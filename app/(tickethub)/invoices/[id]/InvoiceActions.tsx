'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TH_InvoiceStatus } from '@prisma/client'
import {
  deleteDraftInvoice,
  reopenInvoice,
  updateInvoiceStatus,
} from '@/app/lib/actions/invoices'
import { SendInvoiceDialog } from './SendInvoiceDialog'

export function InvoiceActions({
  invoiceId,
  status,
  isAdmin,
  emailConfigured,
  defaultTo,
  defaultSubject,
}: {
  invoiceId: string
  status: TH_InvoiceStatus
  isAdmin: boolean
  emailConfigured: boolean
  defaultTo: string
  defaultSubject: string
}) {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showSend, setShowSend] = useState(false)

  function transition(next: TH_InvoiceStatus) {
    setErr(null)
    startTransition(async () => {
      const res = await updateInvoiceStatus(invoiceId, next)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      router.refresh()
    })
  }

  function reopen() {
    if (!confirm('Reopen this invoice? Charges will revert to BILLABLE and the invoice will be marked VOID.')) return
    setErr(null)
    startTransition(async () => {
      const res = await reopenInvoice(invoiceId)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      router.refresh()
    })
  }

  function remove() {
    if (!confirm('Delete this draft invoice? Charges will return to BILLABLE.')) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteDraftInvoice(invoiceId)
      if (res && !res.ok) setErr(res.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        {/* Email button shows for any non-VOID invoice — admins can
            re-send after a client loses it, edit and re-send, etc. */}
        {emailConfigured && isAdmin && status !== 'VOID' && (
          <button
            type="button"
            onClick={() => setShowSend(true)}
            disabled={isPending}
            className="th-btn-primary text-xs"
            title={
              status === 'DRAFT'
                ? 'Email PDF to client and transition to SENT'
                : 'Re-send invoice PDF'
            }
          >
            📧 {status === 'DRAFT' ? 'Email to Client' : 'Resend'}
          </button>
        )}
        {status === 'DRAFT' && (
          <>
            <button
              type="button"
              onClick={() => transition('SENT')}
              disabled={isPending}
              className="th-btn-secondary text-xs"
              title="Mark SENT without emailing"
            >
              Mark Sent
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
            >
              Delete
            </button>
          </>
        )}
        {(status === 'SENT' || status === 'VIEWED' || status === 'OVERDUE') && (
          <button
            type="button"
            onClick={() => transition('PAID')}
            disabled={isPending}
            className="th-btn-primary text-xs"
          >
            Mark Paid
          </button>
        )}
        {isAdmin && status !== 'DRAFT' && status !== 'VOID' && (
          <button
            type="button"
            onClick={reopen}
            disabled={isPending}
            className="th-btn-secondary text-xs"
            title="Admin: void this invoice and release its charges back to BILLABLE"
          >
            Reopen
          </button>
        )}
      </div>
      {err && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}
      {showSend && (
        <SendInvoiceDialog
          invoiceId={invoiceId}
          defaultTo={defaultTo}
          defaultSubject={defaultSubject}
          onClose={() => setShowSend(false)}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: TH_InvoiceStatus }) {
  const cls =
    status === 'PAID'
      ? 'bg-status-resolved/20 text-status-resolved'
      : status === 'SENT' || status === 'VIEWED'
        ? 'bg-status-in-progress/20 text-status-in-progress'
        : status === 'VOID'
          ? 'bg-th-elevated text-th-text-muted'
          : status === 'OVERDUE'
            ? 'bg-priority-urgent/20 text-priority-urgent'
            : 'bg-status-new/20 text-status-new'
  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  )
}
