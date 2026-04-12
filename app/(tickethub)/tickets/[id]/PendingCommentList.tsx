'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getPendingComments,
  removePendingComment,
  subscribePendingComments,
  type PendingComment,
} from '@/app/lib/pending-comments-store'
import type { SyncOpCompletedDetail } from '@/app/lib/sync-queue'

/**
 * Renders comments the user posted while offline. They sit under the
 * real timeline (so event order is preserved: real rows first, then
 * the queued tail) and carry a "Queued" badge + dimmed styling. When
 * the sync queue flushes an ADD_COMMENT op we drop the matching row
 * and refresh so the real server-rendered row slides into place.
 */
export function PendingCommentList({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [items, setItems] = useState<PendingComment[]>(() =>
    getPendingComments(ticketId),
  )

  useEffect(() => {
    const unsub = subscribePendingComments((all) => {
      setItems(all.filter((c) => c.ticketId === ticketId))
    })
    return unsub
  }, [ticketId])

  useEffect(() => {
    function onCompleted(e: Event) {
      const detail = (e as CustomEvent<SyncOpCompletedDetail>).detail
      if (!detail) return
      if (detail.type !== 'ADD_COMMENT') return
      if (detail.entityId !== ticketId) return
      removePendingComment(detail.clientOpId)
      router.refresh()
    }
    window.addEventListener('tickethub:sync-op-completed', onCompleted)
    return () =>
      window.removeEventListener('tickethub:sync-op-completed', onCompleted)
  }, [ticketId, router])

  if (items.length === 0) return null

  return (
    <ol className="mt-3 space-y-3 border-t border-dashed border-th-border/60 pt-3">
      {items.map((c) => (
        <li key={c.clientOpId} className="flex gap-3">
          <div className="mt-1 h-2 w-2 flex-none rounded-full bg-amber-400/70" />
          <div className="flex-1 text-sm">
            <div
              className={
                c.isInternal
                  ? 'rounded-md border border-amber-500/30 bg-amber-500/5 p-3 opacity-80'
                  : 'rounded-md border border-amber-500/30 bg-amber-500/5 p-3 opacity-80'
              }
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium text-slate-200">You</span>
                {c.isInternal && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                    Internal
                  </span>
                )}
                <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">
                  Queued
                </span>
                <span className="ml-auto text-th-text-muted">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
                {c.body}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
