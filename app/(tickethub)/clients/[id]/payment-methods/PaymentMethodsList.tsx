'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  removePaymentMethod,
  setDefaultPaymentMethod,
} from '@/app/lib/actions/payment-methods'
import { AddCardModal } from './AddCardModal'

interface PaymentMethodRow {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  cardholderName: string | null
  isDefault: boolean
  lastUsedAt: Date | null
  createdAt: Date
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  unknown: 'Card',
}

function expiryLabel(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

export function PaymentMethodsList({
  clientId,
  methods,
  stripeReady,
}: {
  clientId: string
  methods: PaymentMethodRow[]
  stripeReady: boolean
}) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function setDefault(id: string) {
    startTransition(async () => {
      await setDefaultPaymentMethod(id)
      router.refresh()
    })
  }

  function remove(row: PaymentMethodRow) {
    if (
      !confirm(
        `Remove ${BRAND_LABEL[row.brand] ?? row.brand} ending ${row.last4}?`,
      )
    )
      return
    startTransition(async () => {
      await removePaymentMethod(row.id)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-th-text-muted">
          {methods.length} card{methods.length === 1 ? '' : 's'} on file
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={!stripeReady}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-th-bg disabled:opacity-50"
        >
          + Add card
        </button>
      </div>

      {methods.length === 0 ? (
        <div className="rounded-lg border border-th-border bg-th-surface p-8 text-center">
          <p className="text-sm text-th-text-secondary">
            No saved cards yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-th-border bg-th-surface">
          <table className="w-full text-sm">
            <thead className="bg-th-elevated text-xs uppercase text-th-text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Card</th>
                <th className="px-4 py-2 text-left">Expires</th>
                <th className="px-4 py-2 text-left">Cardholder</th>
                <th className="px-4 py-2 text-left">Last used</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border">
              {methods.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-100">
                      {BRAND_LABEL[m.brand] ?? m.brand}
                    </span>
                    <span className="ml-2 font-mono text-th-text-muted">
                      •••• {m.last4}
                    </span>
                    {m.isDefault && (
                      <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                        default
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-th-text-secondary">
                    {expiryLabel(m.expMonth, m.expYear)}
                  </td>
                  <td className="px-4 py-3 text-th-text-secondary">
                    {m.cardholderName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-th-text-muted">
                    {m.lastUsedAt
                      ? new Date(m.lastUsedAt).toLocaleDateString()
                      : 'never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!m.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefault(m.id)}
                        disabled={pending}
                        className="mr-2 rounded border border-th-border px-2 py-1 text-xs text-slate-200 hover:border-accent disabled:opacity-50"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      disabled={pending}
                      className="rounded border border-priority-urgent/40 px-2 py-1 text-xs text-priority-urgent hover:bg-priority-urgent/10 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && stripeReady && (
        <AddCardModal
          clientId={clientId}
          onClose={() => setAddOpen(false)}
          onSuccess={() => {
            setAddOpen(false)
            router.refresh()
          }}
          firstCard={methods.length === 0}
        />
      )}
    </div>
  )
}
