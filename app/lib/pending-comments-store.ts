'use client'

/**
 * In-memory store of comments the user posted while offline. The
 * `enqueueRequest` call persisted them to Dexie for replay; this store
 * is purely for optimistic UI so the row appears in the timeline
 * immediately instead of vanishing until the flush completes.
 *
 * Scoped by ticketId so the timeline for ticket A doesn't pick up
 * pending comments belonging to ticket B.
 *
 * Rows are removed when the sync-queue fires a `tickethub:sync-op-completed`
 * CustomEvent carrying the matching clientOpId. PendingCommentList then
 * calls router.refresh() so the real server-rendered row takes its place.
 */

export interface PendingComment {
  clientOpId: string
  ticketId: string
  body: string
  isInternal: boolean
  createdAt: number
}

type Listener = (items: PendingComment[]) => void

let items: PendingComment[] = []
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(items)
}

export function addPendingComment(c: PendingComment): void {
  items = [...items, c]
  emit()
}

export function removePendingComment(clientOpId: string): void {
  const next = items.filter((c) => c.clientOpId !== clientOpId)
  if (next.length !== items.length) {
    items = next
    emit()
  }
}

export function getPendingComments(ticketId: string): PendingComment[] {
  return items.filter((c) => c.ticketId === ticketId)
}

export function subscribePendingComments(listener: Listener): () => void {
  listeners.add(listener)
  listener(items)
  return () => {
    listeners.delete(listener)
  }
}
