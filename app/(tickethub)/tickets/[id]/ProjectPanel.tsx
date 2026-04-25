'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setTicketParent } from '@/app/lib/actions/ticket-parent'

type Child = {
  id: string
  ticketNumber: number
  title: string
  status: string
  assignedTo: { id: string; name: string } | null
  rolledMinutes: number
  rolledCents: number
}

export function ProjectPanel({
  ticketId,
  parent,
  children,
}: {
  ticketId: string
  parent: { id: string; ticketNumber: number; title: string; status: string } | null
  children: Child[]
}) {
  const [linking, setLinking] = useState(false)
  const [parentNum, setParentNum] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function link() {
    const n = parseInt(parentNum, 10)
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Enter a ticket number')
      return
    }
    setErr(null)
    startTransition(async () => {
      const r = await setTicketParent({ ticketId, parentTicketNumber: n })
      if (r.ok) {
        setLinking(false)
        setParentNum('')
      } else {
        setErr(r.error)
      }
    })
  }

  function unlink() {
    if (!confirm('Remove this ticket from its parent project?')) return
    startTransition(async () => {
      await setTicketParent({ ticketId, parentTicketNumber: null })
    })
  }

  // Render: parent crumb (if has parent), then children list (if has children).
  const totalChildMinutes = children.reduce((s, c) => s + c.rolledMinutes, 0)
  const totalChildCents = children.reduce((s, c) => s + c.rolledCents, 0)
  const openChildCount = children.filter(
    (c) => c.status !== 'CLOSED' && c.status !== 'CANCELLED' && c.status !== 'RESOLVED',
  ).length

  return (
    <div className="th-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
          Project
        </span>
        {!parent && (
          <button
            type="button"
            onClick={() => setLinking((v) => !v)}
            className="text-[10px] text-accent hover:underline"
          >
            {linking ? 'cancel' : 'link parent'}
          </button>
        )}
      </div>

      {parent && (
        <div className="mb-3 rounded border border-th-border bg-th-elevated px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-th-text-muted">
            Parent
          </div>
          <Link
            href={`/tickets/${parent.id}`}
            className="block text-sm text-accent hover:underline"
          >
            ↑ #TH-{parent.ticketNumber}
          </Link>
          <div className="truncate text-[11px] text-th-text-secondary">
            {parent.title}
          </div>
          <button
            type="button"
            onClick={unlink}
            disabled={pending}
            className="mt-1 text-[10px] text-rose-400 hover:underline disabled:opacity-40"
          >
            unlink
          </button>
        </div>
      )}

      {linking && !parent && (
        <div className="mb-3 space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-th-text-muted">TH-</span>
            <input
              autoFocus
              type="number"
              value={parentNum}
              onChange={(e) => setParentNum(e.target.value)}
              placeholder="1234"
              className="w-20 rounded border border-th-border bg-th-elevated px-1.5 py-0.5 text-xs text-slate-100"
            />
            <button
              type="button"
              onClick={link}
              disabled={pending}
              className="rounded bg-accent/20 px-2 py-0.5 text-[11px] text-accent disabled:opacity-40"
            >
              {pending ? '…' : 'link'}
            </button>
          </div>
          {err && <div className="text-[10px] text-rose-400">{err}</div>}
        </div>
      )}

      {children.length > 0 && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-th-text-muted">
              Sub-tickets
            </span>
            <span className="text-[10px] text-th-text-muted">
              {openChildCount}/{children.length} open
            </span>
          </div>
          <ul className="space-y-1">
            {children.map((c) => {
              const closed =
                c.status === 'CLOSED' ||
                c.status === 'CANCELLED' ||
                c.status === 'RESOLVED'
              return (
                <li
                  key={c.id}
                  className={`rounded border border-th-border px-2 py-1 text-[11px] ${
                    closed ? 'opacity-60' : ''
                  }`}
                >
                  <Link
                    href={`/tickets/${c.id}`}
                    className="block truncate text-accent hover:underline"
                  >
                    #TH-{c.ticketNumber}: {c.title}
                  </Link>
                  <div className="flex items-center justify-between text-[10px] text-th-text-muted">
                    <span>
                      {c.status.replace(/_/g, ' ').toLowerCase()}
                      {c.assignedTo && ` · ${c.assignedTo.name}`}
                    </span>
                    <span className="font-mono">
                      {(c.rolledMinutes / 60).toFixed(1)}h ·{' '}
                      ${(c.rolledCents / 100).toFixed(0)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-th-border pt-1 text-[11px]">
            <span className="text-th-text-muted">Roll-up</span>
            <span className="font-mono text-slate-100">
              {(totalChildMinutes / 60).toFixed(1)}h ·{' '}
              ${(totalChildCents / 100).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {!parent && children.length === 0 && !linking && (
        <p className="text-[11px] text-th-text-muted">
          Standalone ticket. Link a parent to make this a sub-task, or
          another ticket can link here to make this a project.
        </p>
      )}
    </div>
  )
}
