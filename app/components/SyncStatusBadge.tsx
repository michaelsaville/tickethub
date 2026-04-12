'use client'

import { useEffect, useState } from 'react'
import {
  flushQueue,
  getQueueState,
  initSyncQueue,
  subscribeQueue,
  type QueueState,
} from '@/app/lib/sync-queue'

/**
 * Floating status pill. Self-hides when everything is healthy (online +
 * empty queue). Turns amber when offline or ops are pending. Click to
 * force-flush. Also responsible for calling `initSyncQueue` on mount.
 */
export function SyncStatusBadge() {
  const [state, setState] = useState<QueueState>(() => getQueueState())

  useEffect(() => {
    initSyncQueue()
    return subscribeQueue(setState)
  }, [])

  const hidden = state.online && state.depth === 0 && !state.flushing
  if (hidden) return null

  const label = !state.online
    ? `Offline · ${state.depth} queued`
    : state.flushing
      ? `Syncing · ${state.depth}`
      : `${state.depth} pending`

  return (
    <button
      type="button"
      onClick={() => void flushQueue()}
      title="Sync queue — click to flush now"
      className="fixed right-4 bottom-24 md:bottom-4 z-50 flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200 shadow-lg backdrop-blur hover:bg-amber-500/25"
    >
      <span
        className={
          state.flushing
            ? 'inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300'
            : 'inline-block h-2 w-2 rounded-full bg-amber-400'
        }
        aria-hidden
      />
      {label}
    </button>
  )
}
