'use client'

import { useState, useTransition } from 'react'
import type {
  TH_TicketPriority,
  TH_TicketStatus,
  TH_TicketType,
} from '@prisma/client'
import {
  assignTicket,
  updateTicketPriority,
  updateTicketStatus,
} from '@/app/lib/actions/tickets'

const STATUSES: TH_TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_THIRD_PARTY',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
]
const PRIORITIES: TH_TicketPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

export function TicketProperties({
  ticketId,
  status: initialStatus,
  priority: initialPriority,
  assignedToId: initialAssignedToId,
  type,
  techs,
}: {
  ticketId: string
  status: TH_TicketStatus
  priority: TH_TicketPriority
  assignedToId: string | null
  type: TH_TicketType
  techs: Array<{ id: string; name: string }>
}) {
  const [status, setStatus] = useState(initialStatus)
  const [priority, setPriority] = useState(initialPriority)
  const [assignedToId, setAssignedToId] = useState(initialAssignedToId ?? '')
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function wrap<T>(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok && res.error) setErr(res.error)
    })
  }

  return (
    <div className="th-card space-y-3">
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Status
        </label>
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => {
            const v = e.target.value as TH_TicketStatus
            setStatus(v)
            wrap(() => updateTicketStatus(ticketId, v))
          }}
          className="th-input"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Priority
        </label>
        <select
          value={priority}
          disabled={isPending}
          onChange={(e) => {
            const v = e.target.value as TH_TicketPriority
            setPriority(v)
            wrap(() => updateTicketPriority(ticketId, v))
          }}
          className="th-input"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Assignee
        </label>
        <select
          value={assignedToId}
          disabled={isPending}
          onChange={(e) => {
            const v = e.target.value
            setAssignedToId(v)
            wrap(() => assignTicket(ticketId, v || null))
          }}
          className="th-input"
        >
          <option value="">Unassigned</option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Type
        </label>
        <div className="rounded-md border border-th-border bg-th-base px-3 py-2 text-sm text-slate-300">
          {type.replace(/_/g, ' ')}
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-2 py-1 text-xs text-priority-urgent">
          {err}
        </div>
      )}
    </div>
  )
}
