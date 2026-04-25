'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  approveTimeCharges,
  unapproveTimeCharge,
} from '@/app/lib/actions/time-approvals'

type Row = {
  id: string
  description: string | null
  workDate: string
  timeChargedMinutes: number | null
  timeSpentMinutes: number | null
  quantity: number
  unitPrice: number
  totalPrice: number
  ticketId: string | null
  ticket: { id: string; ticketNumber: number; title: string } | null
  technician: { id: string; name: string } | null
  contract: { client: { id: string; name: string; shortCode: string | null } } | null
}

type Group = {
  techId: string
  techName: string
  rows: Row[]
  totalMinutes: number
  totalCents: number
}

export function ApprovalsClient({ groups }: { groups: Group[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [flash, setFlash] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const allIds = groups.flatMap((g) => g.rows.map((r) => r.id))
  const allSelected = allIds.length > 0 && selected.size === allIds.length

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(g: Group) {
    const ids = g.rows.map((r) => r.id)
    const allInGroup = ids.every((id) => selected.has(id))
    setSelected((s) => {
      const next = new Set(s)
      if (allInGroup) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allIds))
  }

  function approveSelected() {
    if (selected.size === 0) return
    setFlash(null)
    const editsPayload: Record<string, { chargedMinutes: number }> = {}
    for (const id of selected) {
      if (edits[id] != null) editsPayload[id] = { chargedMinutes: edits[id] }
    }
    startTransition(async () => {
      const r = await approveTimeCharges({
        chargeIds: [...selected],
        edits: editsPayload,
      })
      if (r.ok) {
        setFlash(
          `Approved ${r.approved}${r.skipped ? ` (${r.skipped} skipped)` : ''}.`,
        )
        setSelected(new Set())
        setEdits({})
      } else {
        setFlash(`Failed: ${r.error}`)
      }
    })
  }

  function reject(chargeId: string) {
    if (
      !confirm(
        'Mark this time as NOT_BILLABLE? It will not flow into any invoice. You can also use the ticket page to delete the charge entirely.',
      )
    ) {
      return
    }
    setFlash(null)
    startTransition(async () => {
      const r = await unapproveTimeCharge({
        chargeId,
        to: 'NOT_BILLABLE',
      })
      if (r.ok) setFlash('Marked as not billable.')
      else setFlash(`Failed: ${r.error}`)
    })
  }

  return (
    <>
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-md border border-th-border bg-th-surface px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-th-text-secondary">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-3.5 w-3.5"
          />
          Select all ({allIds.length})
        </label>
        <span className="text-xs text-th-text-muted">
          {selected.size} selected
        </span>
        <button
          type="button"
          onClick={approveSelected}
          disabled={selected.size === 0 || pending}
          className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {pending ? 'Approving…' : `✓ Approve selected (${selected.size})`}
        </button>
        {flash && (
          <span className="basis-full text-xs text-th-text-secondary">
            {flash}
          </span>
        )}
      </div>

      {groups.map((g) => {
        const ids = g.rows.map((r) => r.id)
        const allInGroup = ids.every((id) => selected.has(id))
        return (
          <section
            key={g.techId}
            className="mb-6 rounded-md border border-th-border bg-th-surface"
          >
            <header className="flex items-center gap-3 border-b border-th-border px-3 py-2">
              <input
                type="checkbox"
                checked={allInGroup}
                onChange={() => toggleGroup(g)}
                className="h-3.5 w-3.5"
              />
              <h2 className="font-mono text-sm text-slate-100">{g.techName}</h2>
              <span className="text-xs text-th-text-muted">
                {g.rows.length} {g.rows.length === 1 ? 'charge' : 'charges'} ·{' '}
                {(g.totalMinutes / 60).toFixed(1)}h ·{' '}
                ${(g.totalCents / 100).toFixed(2)}
              </span>
            </header>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-th-text-muted">
                <tr>
                  <th className="w-8" />
                  <th className="px-2 py-1.5 text-left">Date</th>
                  <th className="px-2 py-1.5 text-left">Ticket / Client</th>
                  <th className="px-2 py-1.5 text-left">Notes</th>
                  <th className="px-2 py-1.5 text-right">Spent</th>
                  <th className="px-2 py-1.5 text-right">Charged</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                  <th className="px-2 py-1.5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-th-border">
                {g.rows.map((r) => {
                  const editVal = edits[r.id]
                  const charged = editVal ?? r.timeChargedMinutes ?? 0
                  return (
                    <tr key={r.id} className="hover:bg-th-elevated">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          className="h-3.5 w-3.5"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-th-text-secondary">
                        {new Date(r.workDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.ticket ? (
                          <Link
                            href={`/tickets/${r.ticket.id}`}
                            className="text-accent hover:underline"
                          >
                            #TH-{r.ticket.ticketNumber}
                          </Link>
                        ) : (
                          <span className="text-th-text-muted">—</span>
                        )}
                        <div className="truncate text-[11px] text-th-text-muted">
                          {r.contract?.client.shortCode ??
                            r.contract?.client.name ??
                            '—'}
                          {r.ticket?.title ? ` · ${r.ticket.title}` : ''}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-th-text-secondary">
                        <div className="max-w-[280px] truncate">
                          {r.description ?? '—'}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-th-text-muted">
                        {r.timeSpentMinutes ?? '—'}m
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          min={1}
                          step={5}
                          value={charged}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10)
                            setEdits((prev) => ({
                              ...prev,
                              [r.id]: Number.isFinite(v) ? v : 0,
                            }))
                          }}
                          className={`w-16 rounded border px-1.5 py-0.5 text-right font-mono text-xs ${
                            editVal != null && editVal !== r.timeChargedMinutes
                              ? 'border-amber-400 bg-amber-950/20 text-amber-200'
                              : 'border-th-border bg-th-elevated text-slate-100'
                          }`}
                        />
                        <span className="ml-1 text-[10px] text-th-text-muted">
                          m
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-100">
                        ${(r.totalPrice / 100).toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => reject(r.id)}
                          disabled={pending}
                          className="text-[11px] text-rose-400 hover:text-rose-300 disabled:opacity-40"
                          title="Mark as NOT_BILLABLE"
                        >
                          reject
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
    </>
  )
}
