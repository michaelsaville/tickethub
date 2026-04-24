'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { chargeInvoiceWithSavedCard } from '@/app/lib/actions/payment-methods'
import { formatCents } from '@/app/lib/billing'

interface CardOption {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  unknown: 'Card',
}

export function ChargeSavedCardButton({
  invoiceId,
  clientId,
  totalAmount,
  savedCards,
}: {
  invoiceId: string
  clientId: string
  totalAmount: number
  savedCards: CardOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(
    savedCards.find((c) => c.isDefault)?.id ?? savedCards[0]?.id ?? '',
  )
  const [result, setResult] = useState<
    | null
    | { kind: 'error'; message: string; code?: string }
    | { kind: 'success'; status: string }
  >(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!selected) return
    const amountLabel = formatCents(totalAmount)
    if (
      !confirm(
        `Charge ${amountLabel} to the selected card? This runs immediately.`,
      )
    )
      return
    setResult(null)
    startTransition(async () => {
      const r = await chargeInvoiceWithSavedCard(invoiceId, selected)
      if (r.ok) {
        setResult({ kind: 'success', status: r.status })
        router.refresh()
      } else {
        setResult({ kind: 'error', message: r.error, code: r.code })
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-th-bg"
      >
        Charge saved card
      </button>
      {open && (
        <div className="w-72 rounded-lg border border-th-border bg-th-surface p-3 text-xs">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Charge {formatCents(totalAmount)}
          </div>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mb-2 w-full rounded border border-th-border bg-th-bg px-2 py-1 text-xs text-slate-100"
          >
            {savedCards.map((c) => (
              <option key={c.id} value={c.id}>
                {BRAND_LABEL[c.brand] ?? c.brand} •••• {c.last4}
                {' '}
                (exp {String(c.expMonth).padStart(2, '0')}/{String(c.expYear).slice(-2)})
                {c.isDefault ? ' · default' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !selected}
            className="w-full rounded bg-accent px-3 py-1.5 text-xs font-semibold text-th-bg disabled:opacity-50"
          >
            {pending ? 'Charging…' : 'Run charge'}
          </button>
          {result?.kind === 'success' && (
            <div className="mt-2 rounded border border-accent/40 bg-accent/10 p-2 text-[11px] text-accent">
              Charge {result.status}.{' '}
              {result.status === 'succeeded'
                ? 'Invoice will flip to PAID via webhook.'
                : 'Watch the invoice for status changes.'}
            </div>
          )}
          {result?.kind === 'error' && (
            <div className="mt-2 rounded border border-priority-urgent/40 bg-priority-urgent/10 p-2 text-[11px] text-priority-urgent">
              {result.message}
              {result.code === 'authentication_required' && (
                <div className="mt-1 text-th-text-muted">
                  This card needs 3-D Secure. Send the client the Payment
                  Link from the invoice email instead.
                </div>
              )}
              <div className="mt-1 text-th-text-muted">
                No charge was made.
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => router.push(`/clients/${clientId}/payment-methods`)}
            className="mt-2 block text-[10px] text-th-text-muted hover:text-accent"
          >
            Manage cards →
          </button>
        </div>
      )}
    </div>
  )
}
