'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPurchaseOrder } from '@/app/lib/actions/purchase-orders'

type Vendor = { id: string; name: string; termsDays: number | null }
type OrphanPart = {
  id: string
  name: string
  quantity: number
  unitCost: number
  vendor: string | null
  ticket: { id: string; ticketNumber: number } | null
}

type Line = {
  description: string
  sku: string
  quantity: number
  unitCostDollars: string
  ticketPartId: string | null
}

const blankLine = (): Line => ({
  description: '',
  sku: '',
  quantity: 1,
  unitCostDollars: '0.00',
  ticketPartId: null,
})

export function NewPOForm({
  vendors,
  orphanParts,
}: {
  vendors: Vendor[]
  orphanParts: OrphanPart[]
}) {
  const router = useRouter()
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '')
  const [externalRef, setExternalRef] = useState('')
  const [notes, setNotes] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function update(idx: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((ls) => [...ls, blankLine()])
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, i) => i !== idx)))
  }
  function pullPart(p: OrphanPart) {
    setLines((ls) => {
      const filled = ls.find((l) => !l.description) ? ls : [...ls, blankLine()]
      const idx = filled.findIndex((l) => !l.description && !l.ticketPartId)
      const insertIdx = idx >= 0 ? idx : filled.length - 1
      return filled.map((l, i) =>
        i === insertIdx
          ? {
              description: `${p.name}${p.ticket ? ` (TH-${p.ticket.ticketNumber})` : ''}`,
              sku: '',
              quantity: p.quantity,
              unitCostDollars: (p.unitCost / 100).toFixed(2),
              ticketPartId: p.id,
            }
          : l,
      )
    })
  }

  function submit() {
    setErr(null)
    if (!vendorId) {
      setErr('Pick a vendor')
      return
    }
    const cleaned = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description,
        sku: l.sku || undefined,
        quantity: l.quantity,
        unitCost: Math.round(parseFloat(l.unitCostDollars || '0') * 100),
        ticketPartId: l.ticketPartId || undefined,
      }))
    if (cleaned.length === 0) {
      setErr('Add at least one line with a description')
      return
    }
    startTransition(async () => {
      const r = await createPurchaseOrder({
        vendorId,
        externalRef: externalRef || undefined,
        notes: notes || undefined,
        expectedAt: expectedAt || undefined,
        lines: cleaned,
      })
      if (r.ok) {
        router.replace(`/purchase-orders/${r.id}`)
      } else {
        setErr(r.error)
      }
    })
  }

  const totalCents = lines.reduce(
    (s, l) =>
      s + Math.round(parseFloat(l.unitCostDollars || '0') * 100) * l.quantity,
    0,
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-md border border-th-border bg-th-surface p-4 sm:grid-cols-3">
        <Field label="Vendor *">
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className={fieldClass}
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.termsDays != null ? ` · Net ${v.termsDays}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="External ref">
          <input
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            placeholder="vendor order #"
            className={fieldClass}
          />
        </Field>
        <Field label="Expected">
          <input
            type="date"
            value={expectedAt}
            onChange={(e) => setExpectedAt(e.target.value)}
            className={fieldClass}
          />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Notes">
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-md border border-th-border bg-th-surface">
        <header className="flex items-center justify-between border-b border-th-border px-3 py-2">
          <span className="text-xs uppercase tracking-wider text-th-text-muted">
            Lines
          </span>
          <button
            type="button"
            onClick={addLine}
            className="text-xs text-accent hover:underline"
          >
            + add line
          </button>
        </header>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-th-text-muted">
            <tr>
              <th className="px-2 py-1 text-left">Description</th>
              <th className="px-2 py-1 text-left">SKU</th>
              <th className="px-2 py-1 text-right">Qty</th>
              <th className="px-2 py-1 text-right">Unit cost</th>
              <th className="px-2 py-1 text-right">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-th-border">
            {lines.map((l, i) => {
              const cost = Math.round(parseFloat(l.unitCostDollars || '0') * 100)
              return (
                <tr key={i}>
                  <td className="px-2 py-1">
                    <input
                      value={l.description}
                      onChange={(e) =>
                        update(i, { description: e.target.value })
                      }
                      className={fieldClass}
                    />
                    {l.ticketPartId && (
                      <span className="text-[10px] text-emerald-400">
                        ↳ linked to ticket part
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={l.sku}
                      onChange={(e) => update(i, { sku: e.target.value })}
                      className={fieldClass}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) =>
                        update(i, { quantity: parseInt(e.target.value, 10) || 0 })
                      }
                      className={`${fieldClass} text-right`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={l.unitCostDollars}
                      onChange={(e) =>
                        update(i, { unitCostDollars: e.target.value })
                      }
                      className={`${fieldClass} text-right font-mono`}
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-slate-100">
                    ${((cost * l.quantity) / 100).toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-th-surface">
            <tr>
              <td colSpan={4} className="px-2 py-2 text-right text-xs uppercase tracking-wider text-th-text-muted">
                Total
              </td>
              <td className="px-2 py-2 text-right font-mono font-semibold text-slate-100">
                ${(totalCents / 100).toFixed(2)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {orphanParts.length > 0 && (
        <div className="rounded-md border border-th-border bg-th-surface p-3">
          <div className="mb-2 text-xs uppercase tracking-wider text-th-text-muted">
            Pending ticket parts (not on any PO)
          </div>
          <ul className="space-y-1 text-xs">
            {orphanParts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded border border-th-border px-2 py-1"
              >
                <div className="text-slate-100">
                  {p.name}{' '}
                  <span className="text-th-text-muted">
                    × {p.quantity} · ${(p.unitCost / 100).toFixed(2)} ea
                  </span>
                  {p.ticket && (
                    <span className="ml-2 font-mono text-[10px] text-th-text-muted">
                      TH-{p.ticket.ticketNumber}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => pullPart(p)}
                  className="rounded bg-accent/20 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/30"
                >
                  pull
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save as DRAFT'}
        </button>
        {err && <span className="text-xs text-rose-400">{err}</span>}
      </div>
    </div>
  )
}

const fieldClass =
  'w-full rounded border border-th-border bg-th-elevated px-2 py-1 text-sm text-slate-100 focus:border-accent focus:outline-none'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-th-text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}
