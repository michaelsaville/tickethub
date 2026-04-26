'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TH_TicketPriority, TH_TicketStatus } from '@prisma/client'
import { SlaBadge } from '@/app/components/SlaBadge'
import { bulkUpdateTickets } from '@/app/lib/actions/bulk-tickets'

type TicketRow = {
  id: string
  ticketNumber: number
  title: string
  status: string
  priority: string
  type: string
  isUnread: boolean
  updatedAt: Date
  createdAt: Date
  slaResolveDue: Date | null
  slaPausedAt: Date | null
  slaBreached: boolean
  client: { id: string; name: string; shortCode: string | null }
  assignedTo: { id: string; name: string; email: string } | null
}

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

export function BulkTicketTable({
  tickets,
  techs,
}: {
  tickets: TicketRow[]
  techs: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const allSelected =
    tickets.length > 0 && selectedIds.size === tickets.length
  const someSelected = selectedIds.size > 0 && !allSelected

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(tickets.map((t) => t.id)))
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setErr(null)
    setMsg(null)
  }

  function applyBulk(
    patch: Parameters<typeof bulkUpdateTickets>[0]['patch'],
    label: string,
    confirmText?: string,
  ) {
    if (selectedIds.size === 0) return
    if (confirmText && !confirm(confirmText)) return
    setErr(null)
    setMsg(null)
    const ids = Array.from(selectedIds)
    startTransition(async () => {
      const res = await bulkUpdateTickets({ ticketIds: ids, patch })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setMsg(
        `${label}: ${res.succeeded} updated${res.failed > 0 ? `, ${res.failed} failed` : ''}`,
      )
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-th-border">
        <table className="w-full text-sm">
          <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            <tr>
              <th className="w-1 p-0" aria-hidden />
              <th className="px-3 py-2 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
                  aria-label="Select all tickets"
                />
              </th>
              <th className="px-3 py-2 w-16">#</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2 w-44">Client</th>
              <th className="px-3 py-2 w-32">Assignee</th>
              <th className="px-3 py-2 w-20">SLA</th>
              <th className="px-3 py-2 w-28">Status</th>
              <th className="px-3 py-2 w-20 text-right">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-th-border bg-th-surface">
            {tickets.map((t) => {
              const checked = selectedIds.has(t.id)
              return (
                <tr
                  key={t.id}
                  data-shortcut-row
                  data-shortcut-href={`/tickets/${t.id}`}
                  className={
                    checked
                      ? 'group bg-accent/5 transition-colors data-[shortcut-active=true]:outline data-[shortcut-active=true]:outline-2 data-[shortcut-active=true]:outline-accent'
                      : 'group transition-colors hover:bg-th-elevated data-[shortcut-active=true]:outline data-[shortcut-active=true]:outline-2 data-[shortcut-active=true]:outline-accent'
                  }
                >
                  <td
                    className={`w-1 p-0 ${priorityBorderClass(t.priority)}`}
                    aria-hidden
                  />
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(t.id)}
                      className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
                      aria-label={`Select ticket ${t.ticketNumber}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-th-text-muted">
                    #{t.ticketNumber}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/tickets/${t.id}`}
                      className={
                        t.isUnread
                          ? 'font-semibold text-slate-100 hover:text-accent'
                          : 'text-slate-300 hover:text-accent'
                      }
                    >
                      {t.isUnread && (
                        <span aria-label="unread" className="mr-2 text-accent">
                          ✉
                        </span>
                      )}
                      {t.title}
                    </Link>
                  </td>
                  <td className="truncate px-3 py-2 text-th-text-secondary">
                    <Link
                      href={`/clients/${t.client.id}`}
                      className="hover:text-accent"
                    >
                      {t.client.shortCode ?? t.client.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-th-text-secondary">
                    {t.assignedTo ? (
                      <span title={t.assignedTo.email}>
                        {t.assignedTo.name}
                      </span>
                    ) : (
                      <span className="text-th-text-muted">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <SlaBadge ticket={t} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={statusBadgeClass(t.status)}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[10px] text-th-text-muted">
                    {formatRelative(t.updatedAt)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          techs={techs}
          isPending={isPending}
          err={err}
          msg={msg}
          onStatus={(s) =>
            applyBulk(
              { status: s },
              `Status → ${s.replace(/_/g, ' ')}`,
              s === 'CLOSED' || s === 'CANCELLED'
                ? `Set ${selectedIds.size} ticket(s) to ${s}? This is reversible but will fire SLA pauses and timeline events for each.`
                : undefined,
            )
          }
          onPriority={(p) => applyBulk({ priority: p }, `Priority → ${p}`)}
          onAssignee={(id) =>
            applyBulk(
              { assigneeId: id },
              id === null
                ? 'Unassigned'
                : `Assigned to ${techs.find((t) => t.id === id)?.name ?? 'tech'}`,
            )
          }
          onTag={(tag) => applyBulk({ addTag: tag }, `+ tag "${tag}"`)}
          onClear={clearSelection}
        />
      )}
    </>
  )
}

function BulkActionBar({
  count,
  techs,
  isPending,
  err,
  msg,
  onStatus,
  onPriority,
  onAssignee,
  onTag,
  onClear,
}: {
  count: number
  techs: { id: string; name: string }[]
  isPending: boolean
  err: string | null
  msg: string | null
  onStatus: (s: TH_TicketStatus) => void
  onPriority: (p: TH_TicketPriority) => void
  onAssignee: (id: string | null) => void
  onTag: (tag: string) => void
  onClear: () => void
}) {
  return (
    <div className="hidden md:block fixed bottom-0 left-60 right-0 z-40 border-t border-accent/40 bg-th-surface/95 px-4 py-3 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-wider text-accent">
          {count} selected
        </span>
        <BulkPicker
          placeholder="Set status…"
          options={STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
          onPick={(v) => onStatus(v as TH_TicketStatus)}
          disabled={isPending}
        />
        <BulkPicker
          placeholder="Set priority…"
          options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          onPick={(v) => onPriority(v as TH_TicketPriority)}
          disabled={isPending}
        />
        <BulkPicker
          placeholder="Assign to…"
          options={[
            { value: '__none__', label: 'Unassigned' },
            ...techs.map((t) => ({ value: t.id, label: t.name })),
          ]}
          onPick={(v) => onAssignee(v === '__none__' ? null : v)}
          disabled={isPending}
        />
        <BulkTagInput onAdd={onTag} disabled={isPending} />
        <button
          type="button"
          onClick={onClear}
          disabled={isPending}
          className="ml-auto th-btn-ghost text-xs"
        >
          Clear
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-priority-urgent">{err}</div>}
      {msg && !err && (
        <div className="mt-2 text-xs text-status-resolved">{msg}</div>
      )}
    </div>
  )
}

function BulkPicker({
  placeholder,
  options,
  onPick,
  disabled,
}: {
  placeholder: string
  options: Array<{ value: string; label: string }>
  onPick: (value: string) => void
  disabled: boolean
}) {
  return (
    <select
      defaultValue=""
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value
        if (v) {
          onPick(v)
          e.target.value = ''
        }
      }}
      className="th-input text-xs"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function BulkTagInput({
  onAdd,
  disabled,
}: {
  onAdd: (tag: string) => void
  disabled: boolean
}) {
  const [val, setVal] = useState('')
  return (
    <input
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && val.trim()) {
          e.preventDefault()
          onAdd(val.trim())
          setVal('')
        }
      }}
      disabled={disabled}
      placeholder="+ tag (Enter)"
      className="th-input w-36 text-xs"
      maxLength={50}
    />
  )
}

function statusBadgeClass(status: string): string {
  return `badge-status-${status.toLowerCase().replace(/_/g, '-')}`
}

function priorityBorderClass(priority: string): string {
  switch (priority) {
    case 'URGENT':
      return 'bg-priority-urgent'
    case 'HIGH':
      return 'bg-priority-high'
    case 'MEDIUM':
      return 'bg-priority-medium'
    case 'LOW':
      return 'bg-priority-low'
    default:
      return 'bg-th-border'
  }
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  return `${d}d`
}
