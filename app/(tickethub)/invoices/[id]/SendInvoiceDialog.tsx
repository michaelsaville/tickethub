'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendInvoiceEmail } from '@/app/lib/actions/email'

export function SendInvoiceDialog({
  invoiceId,
  defaultTo,
  defaultSubject,
  onClose,
}: {
  invoiceId: string
  defaultTo: string
  defaultSubject: string
  onClose: () => void
}) {
  const router = useRouter()
  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    setErr(null)
    startTransition(async () => {
      const res = await sendInvoiceEmail(invoiceId, { to, cc, subject, note })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="th-card w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-mono text-sm uppercase tracking-wider text-accent">
          Send Invoice
        </h2>

        <div className="space-y-3">
          <Field label="To">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="th-input"
              required
            />
          </Field>
          <Field label="Cc">
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="optional, comma-separated"
              className="th-input"
            />
          </Field>
          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="th-input"
            />
          </Field>
          <Field label="Note (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Added to the email body, above the signature."
              className="th-input resize-y"
            />
          </Field>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
            {err}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-th-text-muted">
            PDF will be attached automatically. Invoice transitions to SENT on
            success.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="th-btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !to.trim()}
              className="th-btn-primary"
            >
              {isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        {label}
      </label>
      {children}
    </div>
  )
}
