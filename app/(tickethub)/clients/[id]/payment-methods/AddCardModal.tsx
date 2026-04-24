'use client'

import { useEffect, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import {
  attachCardToClient,
  createCardSetupIntent,
} from '@/app/lib/actions/payment-methods'

interface Props {
  clientId: string
  onClose: () => void
  onSuccess: () => void
  firstCard: boolean
}

export function AddCardModal({ clientId, onClose, onSuccess, firstCard }: Props) {
  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const result = await createCardSetupIntent(clientId)
      if (!mounted) return
      if (!result.ok) {
        setInitError(result.error)
        return
      }
      setStripePromise(loadStripe(result.publishableKey))
      setClientSecret(result.clientSecret)
    })()
    return () => {
      mounted = false
    }
  }, [clientId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-th-border bg-th-surface p-6">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-lg text-slate-100">Add card</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-th-text-muted hover:text-slate-100"
          >
            ✕
          </button>
        </header>

        {initError ? (
          <div className="rounded border border-priority-urgent/40 bg-priority-urgent/10 p-3 text-sm text-priority-urgent">
            {initError}
          </div>
        ) : !stripePromise || !clientSecret ? (
          <div className="py-8 text-center text-sm text-th-text-muted">
            Loading Stripe…
          </div>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CardForm
              clientId={clientId}
              clientSecret={clientSecret}
              firstCard={firstCard}
              onSuccess={onSuccess}
              onCancel={onClose}
            />
          </Elements>
        )}
      </div>
    </div>
  )
}

function CardForm({
  clientId,
  clientSecret,
  firstCard,
  onSuccess,
  onCancel,
}: {
  clientId: string
  clientSecret: string
  firstCard: boolean
  onSuccess: () => void
  onCancel: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [name, setName] = useState('')
  const [setDefault, setSetDefault] = useState(firstCard)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    const card = elements.getElement(CardElement)
    if (!card) return

    setPending(true)
    setError(null)
    try {
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card,
          billing_details: name ? { name } : undefined,
        },
      })
      if (result.error) {
        setError(result.error.message ?? 'Card setup failed')
        setPending(false)
        return
      }
      const pmId =
        typeof result.setupIntent.payment_method === 'string'
          ? result.setupIntent.payment_method
          : result.setupIntent.payment_method?.id
      if (!pmId) {
        setError('Stripe did not return a payment method id')
        setPending(false)
        return
      }
      const attached = await attachCardToClient(clientId, pmId, setDefault)
      if (!attached.ok) {
        setError(attached.error)
        setPending(false)
        return
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs text-th-text-secondary">
          Cardholder name (optional)
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-th-border bg-th-bg px-3 py-2 text-sm text-slate-100"
          placeholder="As it appears on the card"
        />
      </label>
      <div className="rounded border border-th-border bg-th-bg px-3 py-3">
        <CardElement
          options={{
            style: {
              base: {
                color: '#f1f5f9',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: '14px',
                '::placeholder': { color: '#64748b' },
              },
              invalid: { color: '#f87171' },
            },
            hidePostalCode: false,
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={setDefault}
          onChange={(e) => setSetDefault(e.target.checked)}
        />
        Set as default for this client
      </label>

      {error && (
        <div className="rounded border border-priority-urgent/40 bg-priority-urgent/10 p-3 text-xs text-priority-urgent">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded border border-th-border px-4 py-2 text-sm text-slate-200 hover:border-accent disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !stripe}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-th-bg disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save card'}
        </button>
      </div>
    </form>
  )
}
