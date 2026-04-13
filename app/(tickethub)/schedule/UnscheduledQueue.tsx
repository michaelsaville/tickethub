'use client'

import { useState } from 'react'
import Link from 'next/link'

const PRIORITY_DOT: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-blue-500',
  LOW: 'bg-slate-500',
}

interface Ticket {
  id: string
  ticketNumber: number
  title: string
  priority: string
  status: string
  estimatedMinutes: number | null
  client: { id: string; name: string; shortCode: string | null }
  site: { id: string; name: string } | null
}

interface Props {
  tickets: Ticket[]
  onDragStart: (ticket: Ticket) => void
}

export function UnscheduledQueue({ tickets, onDragStart }: Props) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'priority' | 'sla' | 'created'>('priority')

  const filtered = tickets.filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.title.toLowerCase().includes(q) ||
      t.client.name.toLowerCase().includes(q) ||
      String(t.ticketNumber).includes(q)
    )
  })

  function formatDuration(mins: number | null): string {
    if (!mins) return '?'
    if (mins < 60) return `${mins}m`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h${m}m` : `${h}h`
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-th-border bg-th-surface">
      {/* Header */}
      <div className="border-b border-th-border px-3 py-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-medium text-slate-200">
            Unscheduled
          </h2>
          <span className="rounded-full bg-th-elevated px-2 py-0.5 text-xs font-mono text-slate-400">
            {filtered.length}
          </span>
        </div>
        <input
          type="text"
          placeholder="Search tickets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full rounded border border-th-border bg-th-elevated px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
        />
        <div className="mt-2 flex gap-1">
          {(['priority', 'created'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`rounded px-2 py-0.5 text-[10px] font-mono ${
                sortBy === s
                  ? 'bg-amber-600/30 text-amber-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            No unscheduled tickets
          </p>
        )}
        {filtered.map((ticket) => (
          <div
            key={ticket.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', ticket.id)
              onDragStart(ticket)
            }}
            className="group cursor-grab rounded-lg border border-th-border/50 bg-th-elevated p-2.5 transition-colors hover:border-amber-500/50 active:cursor-grabbing"
          >
            <div className="flex items-start gap-2">
              <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[ticket.priority] ?? 'bg-slate-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-slate-500">
                    #{ticket.ticketNumber}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    ~{formatDuration(ticket.estimatedMinutes)}
                  </span>
                </div>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="block text-sm text-slate-200 hover:text-amber-300 leading-tight truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {ticket.title}
                </Link>
                <div className="mt-0.5 text-[10px] text-slate-500 truncate">
                  {ticket.client.shortCode ?? ticket.client.name}
                  {ticket.site && ` · ${ticket.site.name}`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
