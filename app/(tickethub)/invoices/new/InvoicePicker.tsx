'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createInvoiceForClient } from '@/app/lib/actions/invoices'
import { formatCents } from '@/app/lib/billing'
import { formatRate } from '@/app/lib/tax'

export interface PickerCharge {
  id: string
  type: string
  itemName: string
  itemTaxable: boolean
  description: string | null
  quantity: number
  timeChargedMinutes: number | null
  unitPrice: number
  totalPrice: number
  contractId: string
  contractName: string
  contractType: string
  isGlobalContract: boolean
  ticketId: string | null
  ticketNumber: number | null
  ticketTitle: string | null
}

export function InvoicePicker({
  clientId,
  billingState,
  taxRate,
  charges,
  canSeeAmounts,
  canInvoice,
  stateReason,
  preselectedTicketId,
}: {
  clientId: string
  billingState: string | null
  taxRate: number
  charges: PickerCharge[]
  canSeeAmounts: boolean
  canInvoice: boolean
  stateReason: string | null
  /** When set, only charges from this ticket are pre-selected. Used by
   *  the ticket-page "Invoice Now" deep-link so the picker opens already
   *  scoped to that ticket; user can still extend the selection. */
  preselectedTicketId?: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (preselectedTicketId) {
      const matching = charges
        .filter((c) => c.ticketId === preselectedTicketId)
        .map((c) => c.id)
      // Fall back to all-selected if the ticket hint matched zero charges
      // (e.g. the user landed here with a stale ticket id).
      if (matching.length > 0) return new Set(matching)
    }
    return new Set(charges.map((c) => c.id))
  })
  const [notes, setNotes] = useState('')
  const [dueDays, setDueDays] = useState(30)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const groups = useMemo(() => {
    const byContract = new Map<
      string,
      {
        contractId: string
        contractName: string
        contractType: string
        isGlobalContract: boolean
        byTicket: Map<
          string,
          {
            ticketId: string | null
            ticketNumber: number | null
            ticketTitle: string | null
            charges: PickerCharge[]
          }
        >
      }
    >()
    for (const c of charges) {
      let g = byContract.get(c.contractId)
      if (!g) {
        g = {
          contractId: c.contractId,
          contractName: c.contractName,
          contractType: c.contractType,
          isGlobalContract: c.isGlobalContract,
          byTicket: new Map(),
        }
        byContract.set(c.contractId, g)
      }
      const tkey = c.ticketId ?? 'unassociated'
      let t = g.byTicket.get(tkey)
      if (!t) {
        t = {
          ticketId: c.ticketId,
          ticketNumber: c.ticketNumber,
          ticketTitle: c.ticketTitle ?? 'Unassociated charges',
          charges: [],
        }
        g.byTicket.set(tkey, t)
      }
      t.charges.push(c)
    }
    return Array.from(byContract.values())
  }, [charges])

  const totals = useMemo(() => {
    let subtotal = 0
    let taxableSubtotal = 0
    for (const c of charges) {
      if (!selected.has(c.id)) continue
      subtotal += c.totalPrice
      if (c.itemTaxable) taxableSubtotal += c.totalPrice
    }
    const taxAmount = Math.round((taxableSubtotal * taxRate) / 10_000)
    return {
      subtotal,
      taxableSubtotal,
      taxAmount,
      total: subtotal + taxAmount,
      count: Array.from(selected).filter((id) =>
        charges.some((c) => c.id === id),
      ).length,
    }
  }, [charges, selected, taxRate])

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(groupCharges: PickerCharge[]) {
    const allSelected = groupCharges.every((c) => selected.has(c.id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of groupCharges) {
        if (allSelected) next.delete(c.id)
        else next.add(c.id)
      }
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === charges.length) return new Set()
      return new Set(charges.map((c) => c.id))
    })
  }

  function submit() {
    if (selected.size === 0) {
      setErr('Pick at least one charge')
      return
    }
    setErr(null)
    startTransition(async () => {
      const res = await createInvoiceForClient(clientId, {
        notes,
        dueInDays: dueDays,
        chargeIds: Array.from(selected),
      })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      router.push(`/invoices/${res.invoiceId}`)
    })
  }

  if (charges.length === 0) {
    return (
      <div className="th-card text-center text-sm text-th-text-secondary">
        No billable charges for this client yet.
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-th-text-secondary">
          <button
            type="button"
            onClick={toggleAll}
            className="th-btn-ghost text-xs"
          >
            {selected.size === charges.length ? 'Deselect all' : 'Select all'}
          </button>
          <span className="font-mono">
            {totals.count} of {charges.length} selected
          </span>
        </div>

        {groups.map((g) => {
          const groupCharges = Array.from(g.byTicket.values()).flatMap(
            (t) => t.charges,
          )
          const allGroupSelected = groupCharges.every((c) => selected.has(c.id))
          const someGroupSelected = groupCharges.some((c) => selected.has(c.id))
          return (
            <div key={g.contractId} className="th-card">
              <div className="mb-3 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someGroupSelected && !allGroupSelected
                    }}
                    onChange={() => toggleGroup(groupCharges)}
                    className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
                  />
                  <span className="font-medium text-slate-100">
                    {g.contractName}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                    {g.contractType}
                    {g.isGlobalContract && ' · default'}
                  </span>
                </label>
                <span className="font-mono text-xs text-th-text-muted">
                  {groupCharges.length}{' '}
                  {groupCharges.length === 1 ? 'line' : 'lines'}
                </span>
              </div>

              {Array.from(g.byTicket.values()).map((t) => (
                <div
                  key={t.ticketId ?? 'none'}
                  className="mb-3 last:mb-0 rounded-md border border-th-border bg-th-base p-2"
                >
                  <div className="mb-1 px-1 text-xs text-th-text-secondary">
                    {t.ticketId ? (
                      <>
                        <span className="font-mono text-th-text-muted">
                          #{t.ticketNumber}
                        </span>{' '}
                        {t.ticketTitle}
                      </>
                    ) : (
                      <span className="text-th-text-muted">
                        {t.ticketTitle}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {t.charges.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-th-elevated"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          className="mt-0.5 h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
                        />
                        <div className="flex-1 text-sm">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                              {c.type}
                            </span>
                            <span className="text-slate-200">{c.itemName}</span>
                            {c.timeChargedMinutes != null && (
                              <span className="font-mono text-xs text-th-text-muted">
                                {formatMinutes(c.timeChargedMinutes)}
                              </span>
                            )}
                            {!c.itemTaxable && (
                              <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                                tax-exempt
                              </span>
                            )}
                          </div>
                          {c.description && (
                            <div className="text-xs text-th-text-secondary">
                              {c.description}
                            </div>
                          )}
                        </div>
                        {canSeeAmounts && (
                          <span className="font-mono text-sm text-slate-100">
                            {formatCents(c.totalPrice)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <aside className="space-y-4">
        {stateReason && (
          <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
            {stateReason}
          </div>
        )}
        {canSeeAmounts ? (
          <div className="th-card space-y-2 text-sm">
            <Row label="Subtotal" value={formatCents(totals.subtotal)} />
            <Row
              label={`Taxable (${formatRate(taxRate)} ${billingState ?? ''})`}
              value={formatCents(totals.taxableSubtotal)}
            />
            <Row label="Tax" value={formatCents(totals.taxAmount)} />
            <div className="border-t border-th-border pt-2">
              <Row label="Total" value={formatCents(totals.total)} strong />
            </div>
          </div>
        ) : (
          <div className="th-card text-xs text-th-text-muted">
            Totals visible to admin users only.
          </div>
        )}

        <div className="th-card space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Due in (days)
            </label>
            <input
              type="number"
              min={0}
              value={dueDays}
              onChange={(e) => setDueDays(Number(e.target.value))}
              className="th-input"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Shown on the invoice."
              className="th-input resize-y"
            />
          </div>
          {err && (
            <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
              {err}
            </div>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !canInvoice || selected.size === 0}
            className="th-btn-primary w-full"
          >
            {isPending ? 'Creating…' : `Create Draft (${totals.count})`}
          </button>
        </div>
      </aside>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-th-text-secondary">{label}</span>
      <span
        className={
          strong
            ? 'font-mono text-lg font-semibold text-slate-100'
            : 'font-mono text-slate-200'
        }
      >
        {value}
      </span>
    </div>
  )
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
