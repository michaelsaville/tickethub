'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { TH_TicketStatus } from '@prisma/client'
import { SlaBadge } from '@/app/components/SlaBadge'
import { enqueueRequest } from '@/app/lib/sync-queue'

type RowTicket = {
  id: string
  ticketNumber: number
  title: string
  status: TH_TicketStatus
  priority: string
  isUnread: boolean
  createdAt: Date | string
  slaResolveDue: Date | string | null
  slaPausedAt: Date | string | null
  slaBreached: boolean
  client: { id: string; name: string; shortCode: string | null }
  assignedTo: { id: string; name: string; email: string } | null
}

const TRIGGER_PX = 80
const MAX_PX = 120

/**
 * Swipe-to-act row for the mobile ticket list.
 *
 * - Swipe right (→) past the trigger: mark RESOLVED
 * - Swipe left  (←) past the trigger: mark WAITING_CUSTOMER
 *
 * Short drags snap back and navigate to the ticket (the tap is preserved
 * via a small drag threshold). Status PATCH goes through `enqueueRequest`
 * so it works offline like every other TicketProperties mutation.
 */
export function SwipeTicketRow({
  ticket,
  priorityBorderClass,
  statusBadgeClass,
}: {
  ticket: RowTicket
  priorityBorderClass: string
  statusBadgeClass: string
}) {
  const router = useRouter()
  const [dx, setDx] = useState(0)
  const [pending, setPending] = useState<null | TH_TicketStatus>(null)
  const [hidden, setHidden] = useState(false)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const locked = useRef<'h' | 'v' | null>(null)
  const moved = useRef(false)

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startX.current = e.clientX
    startY.current = e.clientY
    locked.current = null
    moved.current = false
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (startX.current == null || startY.current == null) return
    const ddx = e.clientX - startX.current
    const ddy = e.clientY - startY.current
    if (!locked.current) {
      if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return
      locked.current = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v'
    }
    if (locked.current !== 'h') return
    moved.current = true
    // Soft clamp past MAX_PX so it still feels rubbery.
    const clamped = Math.max(-MAX_PX, Math.min(MAX_PX, ddx))
    setDx(clamped)
  }

  function onPointerUp() {
    if (startX.current == null) return
    const committed =
      dx >= TRIGGER_PX
        ? 'RESOLVED'
        : dx <= -TRIGGER_PX
          ? 'WAITING_CUSTOMER'
          : null
    startX.current = null
    startY.current = null
    locked.current = null
    if (committed) {
      commit(committed as TH_TicketStatus)
    } else {
      setDx(0)
    }
  }

  function onClickCapture(e: React.MouseEvent) {
    // If the user dragged, swallow the click so we don't navigate.
    if (moved.current) {
      e.preventDefault()
      e.stopPropagation()
      moved.current = false
    }
  }

  async function commit(status: TH_TicketStatus) {
    setPending(status)
    try {
      await enqueueRequest({
        type: 'UPDATE_STATUS',
        entityType: 'TICKET',
        entityId: ticket.id,
        method: 'PATCH',
        url: `/api/tickets/${ticket.id}/status`,
        body: { status },
      })
      setHidden(true)
      // Let the next list fetch reorder/drop; cheaper than refetching now.
      router.refresh()
    } catch {
      // Revert on hard error; the row stays visible.
      setDx(0)
      setPending(null)
    }
  }

  if (hidden) return null

  const rightActive = dx >= TRIGGER_PX
  const leftActive = dx <= -TRIGGER_PX

  return (
    <li className="relative overflow-hidden rounded-lg">
      {/* Action rails behind the card */}
      <div
        className={`absolute inset-y-0 left-0 flex w-28 items-center justify-start pl-4 text-xs font-mono uppercase tracking-wider ${
          rightActive
            ? 'bg-emerald-600/90 text-white'
            : 'bg-emerald-600/40 text-emerald-100'
        }`}
      >
        ✓ Resolve
      </div>
      <div
        className={`absolute inset-y-0 right-0 flex w-28 items-center justify-end pr-4 text-xs font-mono uppercase tracking-wider ${
          leftActive
            ? 'bg-amber-500/90 text-white'
            : 'bg-amber-500/40 text-amber-100'
        }`}
      >
        Waiting →
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? 'transform 180ms ease-out' : 'none',
          touchAction: 'pan-y',
        }}
        className="relative z-10"
      >
        <Link
          href={`/tickets/${ticket.id}`}
          className="flex items-stretch gap-3 rounded-lg border border-th-border bg-th-surface p-3 hover:bg-th-elevated active:bg-th-border"
        >
          <div
            className={`w-1 flex-none rounded-full ${priorityBorderClass}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div
              className={
                ticket.isUnread
                  ? 'truncate font-semibold text-slate-100'
                  : 'truncate text-slate-200'
              }
            >
              {ticket.isUnread && (
                <span aria-label="unread" className="mr-1 text-accent">
                  ✉
                </span>
              )}
              {ticket.title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-th-text-muted">
              <span className="font-mono">#{ticket.ticketNumber}</span>
              <span>·</span>
              <span className="truncate">
                {ticket.client.shortCode ?? ticket.client.name}
              </span>
              {ticket.assignedTo && (
                <>
                  <span>·</span>
                  <span className="truncate">{ticket.assignedTo.name}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <SlaBadge ticket={ticket} />
            <span className={statusBadgeClass}>
              {(pending ?? ticket.status).replace(/_/g, ' ')}
            </span>
          </div>
        </Link>
      </div>
    </li>
  )
}
