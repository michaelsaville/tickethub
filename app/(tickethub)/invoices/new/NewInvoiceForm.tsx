'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createInvoiceForClient } from '@/app/lib/actions/invoices'

export function NewInvoiceForm({
  clientId,
  disabled,
}: {
  clientId: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [dueDays, setDueDays] = useState(30)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setErr(null)
    startTransition(async () => {
      const res = await createInvoiceForClient(clientId, {
        notes,
        dueInDays: dueDays,
      })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      router.push(`/invoices/${res.invoiceId}`)
    })
  }

  return (
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
          placeholder="Shown on the invoice — e.g. 'Thanks for your business.'"
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
        disabled={isPending || disabled}
        className="th-btn-primary w-full"
      >
        {isPending ? 'Creating…' : 'Create Draft Invoice'}
      </button>
    </div>
  )
}
