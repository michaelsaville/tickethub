'use client'

import { useState, useTransition } from 'react'
import { updateClientBillingState } from '@/app/lib/actions/invoices'
import { SUPPORTED_TAX_STATES } from '@/app/lib/tax'

export function TaxStateSelector({
  clientId,
  initial,
}: {
  clientId: string
  initial: string | null
}) {
  const [state, setState] = useState(initial ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(next: string) {
    const prev = state
    setState(next)
    setErr(null)
    startTransition(async () => {
      const res = await updateClientBillingState(clientId, next || null)
      if (!res.ok) {
        setErr(res.error)
        setState(prev)
      }
    })
  }

  return (
    <div className="th-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Tax State
          </div>
          <p className="mt-1 text-xs text-th-text-secondary">
            Determines sales tax on invoices. Required before invoicing.
          </p>
        </div>
        <select
          value={state}
          onChange={(e) => save(e.target.value)}
          disabled={isPending}
          className="th-input w-24 text-sm"
        >
          <option value="">—</option>
          {SUPPORTED_TAX_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {err && (
        <div className="mt-2 text-xs text-priority-urgent">{err}</div>
      )}
    </div>
  )
}
