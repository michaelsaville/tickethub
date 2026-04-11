'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  deleteTaxRate,
  updateTaxRateValue,
  upsertTaxRate,
  type TaxRateResult,
} from '@/app/lib/actions/tax-rates'

type Row = {
  state: string
  rateBps: number
  label: string | null
  source: 'db' | 'default'
}

function formatBps(bps: number): string {
  return (bps / 100).toFixed(2)
}

export function TaxRatesList({ initial }: { initial: Row[] }) {
  const [showForm, setShowForm] = useState(false)
  return (
    <div className="space-y-4">
      {showForm ? (
        <NewRateForm onCancel={() => setShowForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="th-btn-primary text-sm"
        >
          + Add State
        </button>
      )}

      <div className="overflow-hidden rounded-lg border border-th-border">
        <table className="w-full text-sm">
          <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            <tr>
              <th className="px-4 py-2 w-20">State</th>
              <th className="px-4 py-2 w-32">Rate (%)</th>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2 w-32">Source</th>
              <th className="px-4 py-2 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-th-border bg-th-surface">
            {initial.map((r) => (
              <RateRow key={r.state} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RateRow({ row }: { row: Row }) {
  const [rate, setRate] = useState(formatBps(row.rateBps))
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function saveRate() {
    const n = Number.parseFloat(rate)
    if (!Number.isFinite(n) || n < 0) {
      setErr('Invalid rate')
      return
    }
    const bps = Math.round(n * 100)
    if (bps === row.rateBps) return
    setErr(null)
    startTransition(async () => {
      const res = await updateTaxRateValue(row.state, bps)
      if (!res.ok) {
        setErr(res.error)
        setRate(formatBps(row.rateBps))
      }
    })
  }

  function remove() {
    if (!confirm(`Delete tax rate for ${row.state}?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteTaxRate(row.state)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <tr>
      <td className="px-4 py-3 font-mono text-slate-100">{row.state}</td>
      <td className="px-4 py-3">
        <input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={saveRate}
          disabled={isPending || row.source === 'default'}
          className="th-input w-24 text-sm font-mono"
        />
        {err && <div className="mt-1 text-xs text-priority-urgent">{err}</div>}
      </td>
      <td className="px-4 py-3 text-th-text-secondary">{row.label ?? '—'}</td>
      <td className="px-4 py-3">
        <span
          className={
            row.source === 'db'
              ? 'font-mono text-[10px] uppercase tracking-wider text-status-resolved'
              : 'font-mono text-[10px] uppercase tracking-wider text-th-text-muted'
          }
        >
          {row.source === 'db' ? 'Saved' : 'Default'}
        </span>
      </td>
      <td className="px-4 py-3">
        {row.source === 'db' && (
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  )
}

function NewRateForm({ onCancel }: { onCancel: () => void }) {
  const [state, formAction] = useFormState<TaxRateResult | null, FormData>(
    upsertTaxRate,
    null,
  )
  return (
    <form action={formAction} className="th-card max-w-xl space-y-3">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-accent">
        New State Rate
      </h2>
      <div className="grid gap-3 sm:grid-cols-[100px,1fr,140px]">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            State
          </label>
          <input
            name="state"
            required
            placeholder="OH"
            maxLength={2}
            className="th-input font-mono uppercase"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Label (optional)
          </label>
          <input
            name="label"
            placeholder="Ohio"
            className="th-input"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Rate (%)
          </label>
          <input
            name="rateBps"
            required
            placeholder="5.75"
            className="th-input font-mono"
          />
        </div>
      </div>
      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {state.error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <AddButton />
        <button type="button" onClick={onCancel} className="th-btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}

function AddButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary">
      {pending ? 'Saving…' : 'Save'}
    </button>
  )
}
