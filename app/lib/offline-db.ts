'use client'

import Dexie, { type Table } from 'dexie'

/**
 * Client-side IndexedDB queue for offline operations (PLANNING.md §11).
 * Operations are stored here when offline and flushed to /api/... on reconnect.
 */

export type SyncOperationType =
  | 'ADD_COMMENT'
  | 'LOG_TIME'
  | 'UPDATE_STATUS'
  | 'UPDATE_PRIORITY'
  | 'UPDATE_ASSIGNEE'
  | 'UPDATE_CONTRACT'
  | 'UPDATE_BOARD'
  | 'UPDATE_TITLE'
  | 'ADD_CHARGE'
  | 'ADD_PART'
  | 'ATTACH_PHOTO'
  | 'CAPTURE_SIGNATURE'

/**
 * A queued HTTP request. The sync-queue library re-POSTs these when the
 * client comes back online. `url` + `method` + `body` are enough to replay.
 * `type` + `entityId` are metadata for the status UI and for future
 * optimistic-UI hooks.
 */
export interface SyncOperation {
  id: string
  type: SyncOperationType
  entityType: 'TICKET' | 'CHARGE'
  entityId: string
  url: string
  method: 'POST' | 'PATCH' | 'DELETE'
  body: string
  createdAt: number
  retryCount: number
  nextAttemptAt: number
  error?: string
}

export interface CachedTicket {
  id: string
  ticketNumber: number
  title: string
  status: string
  priority: string
  clientName: string
  updatedAt: number
  raw: unknown
}

/**
 * Ticket IDs for which the user clicked Stop&Log while offline. The
 * server still shows the timer running until the LOG_TIME op flushes,
 * so TimerBar and TimerControls read this table to hide the phantom.
 * Cleared when the corresponding sync op completes or is dropped.
 */
export interface LocallyStoppedTimer {
  ticketId: string
  clientOpId: string
  stoppedAt: number
}

class TicketHubDB extends Dexie {
  syncQueue!: Table<SyncOperation, string>
  tickets!: Table<CachedTicket, string>
  locallyStoppedTimers!: Table<LocallyStoppedTimer, string>

  constructor() {
    super('tickethub')
    this.version(1).stores({
      syncQueue: 'id, type, entityId, createdAt',
      tickets: 'id, ticketNumber, status, updatedAt',
    })
    this.version(2).stores({
      syncQueue: 'id, type, entityId, createdAt, nextAttemptAt',
      tickets: 'id, ticketNumber, status, updatedAt',
    })
    // v3: adds `locallyStoppedTimers` for the offline timer-ghost fix.
    this.version(3).stores({
      syncQueue: 'id, type, entityId, createdAt, nextAttemptAt',
      tickets: 'id, ticketNumber, status, updatedAt',
      locallyStoppedTimers: 'ticketId, clientOpId',
    })
  }
}

let db: TicketHubDB | null = null

export function getDB(): TicketHubDB {
  if (typeof window === 'undefined') {
    throw new Error('offline-db is client-only')
  }
  if (!db) db = new TicketHubDB()
  return db
}

export async function markTimerLocallyStopped(
  ticketId: string,
  clientOpId: string,
): Promise<void> {
  await getDB().locallyStoppedTimers.put({
    ticketId,
    clientOpId,
    stoppedAt: Date.now(),
  })
}

export async function isTimerLocallyStopped(
  ticketId: string,
): Promise<boolean> {
  const row = await getDB().locallyStoppedTimers.get(ticketId)
  return Boolean(row)
}

export async function clearLocalTimerStopByOp(
  clientOpId: string,
): Promise<void> {
  const row = await getDB()
    .locallyStoppedTimers.where('clientOpId')
    .equals(clientOpId)
    .first()
  if (row) {
    await getDB().locallyStoppedTimers.delete(row.ticketId)
  }
}
