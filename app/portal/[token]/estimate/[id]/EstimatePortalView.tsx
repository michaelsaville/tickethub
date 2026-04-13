'use client'

import { useState } from 'react'
import { formatCents } from '@/app/lib/billing'
import { formatRate } from '@/app/lib/tax'

interface EstimateItem {
  name: string
  type: string
  description: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface EstimateData {
  estimateNumber: number
  title: string
  description: string | null
  status: string
  subtotal: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  validUntil: string | null
  notes: string | null
  sentAt: string | null
  approvedAt: string | null
  declinedAt: string | null
  convertedAt: string | null
  items: EstimateItem[]
}

export function EstimatePortalView({
  token,
  estimateId,
  contactName,
  companyName,
  estimate,
}: {
  token: string
  estimateId: string
  contactName: string
  companyName: string
  estimate: EstimateData
}) {
  const [status, setStatus] = useState(estimate.status)
  const [loading, setLoading] = useState(false)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [responded, setResponded] = useState(false)

  async function handleApprove() {
    if (!confirm('Are you sure you want to approve this estimate? This action cannot be undone.')) {
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/estimates/${estimateId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', token }),
      })
      if (res.ok) {
        setStatus('APPROVED')
        setResponded(true)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  async function handleDecline() {
    setLoading(true)
    try {
      const res = await fetch(`/api/estimates/${estimateId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline', token, reason: declineReason || undefined }),
      })
      if (res.ok) {
        setStatus('DECLINED')
        setResponded(true)
        setShowDeclineModal(false)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  const fmtDate = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-th-bg">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            PCC2K
          </h1>
          <p className="mt-1 text-sm text-th-text-secondary uppercase tracking-widest">
            Estimate
          </p>
        </div>

        {/* Status Banners */}
        {status === 'APPROVED' && (
          <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-center">
            <p className="text-sm font-medium text-green-400">
              This estimate has been approved
              {estimate.approvedAt && !responded && (
                <span className="block mt-0.5 text-xs text-green-400/70">
                  Approved on {fmtDate(estimate.approvedAt)}
                </span>
              )}
            </p>
            {responded && (
              <p className="mt-2 text-xs text-green-400/70">
                Thank you for your response. We will be in touch shortly.
              </p>
            )}
          </div>
        )}

        {status === 'DECLINED' && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center">
            <p className="text-sm font-medium text-red-400">
              This estimate was declined
            </p>
            {responded && (
              <p className="mt-2 text-xs text-red-400/70">
                Thank you for your response. If you change your mind, please contact us.
              </p>
            )}
          </div>
        )}

        {status === 'CONVERTED' && (
          <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-center">
            <p className="text-sm font-medium text-blue-400">
              This estimate has been converted to an invoice
            </p>
          </div>
        )}

        {/* Estimate Card */}
        <div className="rounded-lg border border-th-border bg-th-surface p-6 sm:p-8">
          {/* Meta */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-th-text-muted uppercase tracking-wide">
                Estimate #
              </p>
              <p className="mt-0.5 text-lg font-mono font-semibold text-slate-100">
                {estimate.estimateNumber}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-th-text-muted uppercase tracking-wide">
                Prepared For
              </p>
              <p className="mt-0.5 text-sm text-slate-200">{contactName}</p>
              <p className="text-sm text-th-text-secondary">{companyName}</p>
            </div>
          </div>

          {/* Title & Description */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-100">
              {estimate.title}
            </h2>
            {estimate.description && (
              <p className="mt-1 text-sm text-th-text-secondary whitespace-pre-wrap">
                {estimate.description}
              </p>
            )}
          </div>

          {/* Date row */}
          <div className="mb-6 flex flex-wrap gap-6 text-sm">
            {estimate.sentAt && (
              <div>
                <span className="text-th-text-muted">Date: </span>
                <span className="text-slate-300">{fmtDate(estimate.sentAt)}</span>
              </div>
            )}
            {estimate.validUntil && (
              <div>
                <span className="text-th-text-muted">Valid Until: </span>
                <span className="text-slate-300">{fmtDate(estimate.validUntil)}</span>
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-th-border text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-th-text-muted uppercase tracking-wide">
                    Item
                  </th>
                  <th className="pb-2 pr-4 text-right text-xs font-medium text-th-text-muted uppercase tracking-wide">
                    Qty
                  </th>
                  <th className="pb-2 pr-4 text-right text-xs font-medium text-th-text-muted uppercase tracking-wide">
                    Rate
                  </th>
                  <th className="pb-2 text-right text-xs font-medium text-th-text-muted uppercase tracking-wide">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {estimate.items.map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-th-border/50"
                  >
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-200">{item.name}</p>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-th-text-secondary whitespace-pre-wrap">
                          {item.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-300 tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-300 tabular-nums">
                      {formatCents(item.unitPrice)}
                    </td>
                    <td className="py-3 text-right text-slate-200 font-medium tabular-nums">
                      {formatCents(item.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mb-6 flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-th-text-muted">Subtotal</span>
                <span className="text-slate-300 tabular-nums">
                  {formatCents(estimate.subtotal)}
                </span>
              </div>
              {estimate.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-th-text-muted">
                    Tax ({formatRate(estimate.taxRate)})
                  </span>
                  <span className="text-slate-300 tabular-nums">
                    {formatCents(estimate.taxAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-th-border pt-2">
                <span className="font-semibold text-slate-100">Total</span>
                <span className="font-semibold text-slate-100 tabular-nums">
                  {formatCents(estimate.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {estimate.notes && (
            <div className="mb-6 rounded-md bg-th-surface-raised p-4">
              <p className="text-xs font-medium text-th-text-muted uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-sm text-th-text-secondary whitespace-pre-wrap">
                {estimate.notes}
              </p>
            </div>
          )}

          {/* Action Buttons — only for SENT status */}
          {status === 'SENT' && !responded && (
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={handleApprove}
                disabled={loading}
                className="rounded-lg bg-green-600 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Approve Estimate'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeclineModal(true)}
                disabled={loading}
                className="rounded-lg bg-red-600 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Decline Estimate
              </button>
            </div>
          )}

          {/* PDF Download */}
          <div className="mt-6 text-center">
            <a
              href={`/api/estimates/${estimateId}/pdf?download=1`}
              className="inline-flex items-center gap-1.5 text-sm text-th-text-secondary hover:text-accent transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download PDF
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-th-text-muted">
          Questions? Reply to the estimate email or contact PCC2K directly.
        </p>
      </div>

      {/* Decline Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-th-border bg-th-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-100">
              Decline Estimate
            </h3>
            <p className="mt-1 text-sm text-th-text-secondary">
              Are you sure you want to decline this estimate? You can optionally
              provide a reason below.
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Reason for declining (optional)"
              rows={3}
              className="mt-4 w-full rounded-md border border-th-border bg-th-surface-raised px-3 py-2 text-sm text-slate-200 placeholder:text-th-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeclineModal(false)}
                disabled={loading}
                className="rounded-md px-4 py-2 text-sm font-medium text-th-text-secondary hover:text-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Decline Estimate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
