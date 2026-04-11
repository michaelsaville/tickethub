'use client'

import { useState, useTransition } from 'react'
import {
  updateClientBillingEmail,
  updateClientBillingState,
} from '@/app/lib/actions/invoices'
import { SUPPORTED_TAX_STATES } from '@/app/lib/tax'

export function BillingSettings({
  clientId,
  initialState,
  initialEmail,
}: {
  clientId: string
  initialState: string | null
  initialEmail: string | null
}) {
  const [state, setState] = useState(initialState ?? '')
  const [email, setEmail] = useState(initialEmail ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function saveState(next: string) {
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

  function saveEmail() {
    if (email === (initialEmail ?? '')) return
    setErr(null)
    startTransition(async () => {
      const res = await updateClientBillingEmail(clientId, email || null)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <div className="th-card">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        Billing
      </div>
      <div className="grid gap-3 sm:grid-cols-[120px,1fr]">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Tax State
          </label>
          <select
            value={state}
            onChange={(e) => saveState(e.target.value)}
            disabled={isPending}
            className="th-input text-sm"
          >
            <option value="">—</option>
            {SUPPORTED_TAX_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Billing Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={saveEmail}
            disabled={isPending}
            placeholder="ap@client.com"
            className="th-input text-sm"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-th-text-muted">
        Tax state determines sales tax on invoices. Billing email receives
        invoice PDFs when you send them — falls back to the primary contact's
        email if blank.
      </p>
      {err && <div className="mt-2 text-xs text-priority-urgent">{err}</div>}
    </div>
  )
}

// Back-compat export in case anything else imports the old name.
export { BillingSettings as TaxStateSelector }

