'use client'

import {
  clearLocalTimerStopByOp,
  getDB,
  type SyncOperation,
  type SyncOperationType,
} from '@/app/lib/offline-db'

/**
 * Offline sync queue — wraps `fetch` so that mutating requests either go
 * through immediately (online) or get persisted to IndexedDB and replayed
 * when connectivity returns.
 *
 * Flow:
 *  1. UI calls `enqueueRequest({ url, method, body, type, entityId })`
 *  2. If online, we try fetch immediately. On success → done. On network
 *     error → persist to Dexie.
 *  3. If offline, we persist to Dexie without attempting.
 *  4. On `window.online` event (and on page load), `flushQueue()` walks
 *     pending ops, POSTs each, removes on success, bumps retryCount on
 *     failure with exponential backoff (via `nextAttemptAt`).
 *  5. A tiny pub/sub lets UI subscribe to queue depth + online state for
 *     the status indicator.
 *
 * Idempotency: each queued op carries a `clientOpId` in its body (UUID).
 * Server endpoints must honor this to dedupe replays.
 */

type QueueListener = (state: QueueState) => void

export interface QueueState {
  depth: number
  online: boolean
  flushing: boolean
}

const listeners = new Set<QueueListener>()
let state: QueueState = {
  depth: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  flushing: false,
}

function setState(patch: Partial<QueueState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l(state)
}

export function getQueueState(): QueueState {
  return state
}

export function subscribeQueue(listener: QueueListener): () => void {
  listeners.add(listener)
  listener(state)
  return () => {
    listeners.delete(listener)
  }
}

async function refreshDepth(): Promise<void> {
  try {
    const depth = await getDB().syncQueue.count()
    setState({ depth })
  } catch {
    // Dexie unavailable — ignore
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError
}

function backoffMs(retryCount: number): number {
  // 5s, 15s, 45s, 2m15s, 6m45s, capped at ~10m
  return Math.min(5000 * Math.pow(3, retryCount), 600_000)
}

/**
 * Fired after a queued op replays successfully. Optimistic-UI layers
 * listen for this to drop their placeholder rows and trigger a
 * router.refresh so the real server-rendered row takes over.
 */
export interface SyncOpCompletedDetail {
  clientOpId: string
  type: SyncOperationType
  entityId: string
}

function dispatchOpCompleted(
  clientOpId: string,
  type: SyncOperationType,
  entityId: string,
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<SyncOpCompletedDetail>('tickethub:sync-op-completed', {
      detail: { clientOpId, type, entityId },
    }),
  )
}

export interface EnqueueInput {
  type: SyncOperationType
  entityType: 'TICKET' | 'CHARGE'
  entityId: string
  url: string
  method?: 'POST' | 'PATCH' | 'DELETE'
  /** Plain object — will be JSON-stringified and get a `clientOpId` added. */
  body: Record<string, unknown>
}

export interface EnqueueResult {
  /** True if the request completed against the server (online path). */
  synced: boolean
  /** The clientOpId we sent / queued — useful for optimistic UI keys. */
  clientOpId: string
  /** Parsed response JSON if synced, null otherwise. */
  response: unknown
}

/**
 * Attempt the request immediately; if offline or the network fails,
 * persist to IndexedDB so it gets retried later.
 *
 * Non-network failures (4xx/5xx with a real response) do NOT queue —
 * those are logic errors the caller needs to surface to the user.
 */
export async function enqueueRequest(
  input: EnqueueInput,
): Promise<EnqueueResult> {
  const clientOpId = makeId()
  const method = input.method ?? 'POST'
  const bodyWithId = { ...input.body, clientOpId }
  const serialized = JSON.stringify(bodyWithId)

  const canTry =
    typeof navigator === 'undefined' ? true : navigator.onLine

  if (canTry) {
    try {
      const res = await fetch(input.url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      })
      if (res.ok) {
        const json = await res.json().catch(() => null)
        return { synced: true, clientOpId, response: json }
      }
      // Server-side error — surface to caller, do NOT queue.
      const errJson = (await res.json().catch(() => null)) as
        | { error?: string }
        | null
      throw new Error(errJson?.error ?? `Request failed (${res.status})`)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      // Fall through: network error, persist below.
    }
  }

  const op: SyncOperation = {
    id: clientOpId,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    url: input.url,
    method,
    body: serialized,
    createdAt: Date.now(),
    retryCount: 0,
    nextAttemptAt: Date.now(),
  }
  await getDB().syncQueue.add(op)
  await refreshDepth()
  return { synced: false, clientOpId, response: null }
}

let flushing = false

/**
 * Walk the queue, replay each ready op. Called on reconnect + on demand
 * from the status indicator. Safe to call concurrently — a single flight
 * is enforced via the `flushing` module flag.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  setState({ flushing: true })
  try {
    const db = getDB()
    const now = Date.now()
    const ready = await db.syncQueue
      .where('nextAttemptAt')
      .belowOrEqual(now)
      .sortBy('createdAt')

    for (const op of ready) {
      if (!op.url || !op.method || !op.body) {
        // v1-format row — we can't replay it. Delete so it doesn't
        // block the queue forever.
        await db.syncQueue.delete(op.id)
        continue
      }
      try {
        const res = await fetch(op.url, {
          method: op.method,
          headers: { 'Content-Type': 'application/json' },
          body: op.body,
        })
        if (res.ok) {
          await db.syncQueue.delete(op.id)
          if (op.type === 'LOG_TIME') await clearLocalTimerStopByOp(op.id)
          dispatchOpCompleted(op.id, op.type, op.entityId)
          continue
        }
        if (res.status >= 400 && res.status < 500 && res.status !== 408) {
          // Hard client error — giving up avoids a zombie op. We could
          // move these to a dead-letter table later.
          const errText = await res.text().catch(() => '')
          console.warn(
            '[sync-queue] dropping op after 4xx',
            op.id,
            res.status,
            errText,
          )
          await db.syncQueue.delete(op.id)
          // If a LOG_TIME drops, the charge was never created and the
          // server-side timer is still live. Clear the local-stop
          // marker so the user can see the timer and retry.
          if (op.type === 'LOG_TIME') await clearLocalTimerStopByOp(op.id)
          continue
        }
        throw new Error(`status ${res.status}`)
      } catch (e) {
        const retryCount = op.retryCount + 1
        await db.syncQueue.update(op.id, {
          retryCount,
          nextAttemptAt: Date.now() + backoffMs(retryCount),
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  } finally {
    flushing = false
    await refreshDepth()
    setState({ flushing: false })
  }
}

let wired = false

/**
 * One-time wiring — call from a top-level client boundary on mount.
 * Sets up online/offline listeners and kicks an initial flush.
 */
export function initSyncQueue(): void {
  if (wired || typeof window === 'undefined') return
  wired = true

  window.addEventListener('online', () => {
    setState({ online: true })
    void flushQueue()
  })
  window.addEventListener('offline', () => {
    setState({ online: false })
  })

  void refreshDepth()
  if (navigator.onLine) void flushQueue()

  // Periodic retry sweep for ops whose backoff window expired while the
  // tab was open and online the whole time.
  setInterval(() => {
    if (navigator.onLine) void flushQueue()
  }, 30_000)
}
