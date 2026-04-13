'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function EstimateActions({
  estimateId, status, estimateNumber, convertedToInvoiceId,
}: {
  estimateId: string
  status: string
  estimateNumber: number
  convertedToInvoiceId: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState('')

  async function action(endpoint: string, label: string) {
    if (!confirm(`${label} Estimate #${estimateNumber}?`)) return
    setLoading(label)
    const res = await fetch(`/api/estimates/${estimateId}/${endpoint}`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      if (data.invoiceId) {
        router.push(`/invoices/${data.invoiceId}`)
      } else {
        router.refresh()
      }
    } else {
      const err = await res.json().catch(() => ({ error: 'Failed' }))
      alert(err.error || 'Action failed')
    }
    setLoading('')
  }

  async function cloneEstimate() {
    setLoading('Clone')
    const res = await fetch(`/api/estimates/${estimateId}/clone`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      router.push(`/estimates/${data.id}`)
    } else {
      const err = await res.json().catch(() => ({ error: 'Failed' }))
      alert(err.error || 'Clone failed')
    }
    setLoading('')
  }

  async function deleteEstimate() {
    if (!confirm(`Delete Estimate #${estimateNumber}? This cannot be undone.`)) return
    setLoading('Delete')
    const res = await fetch(`/api/estimates/${estimateId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/estimates')
    } else {
      alert('Failed to delete')
    }
    setLoading('')
  }

  return (
    <div className="th-card p-4 space-y-2">
      <div className="text-xs text-th-secondary uppercase tracking-wider mb-3 font-medium">Actions</div>

      {/* PDF preview */}
      <a
        href={`/api/estimates/${estimateId}/pdf`}
        target="_blank"
        className="block w-full text-center th-btn-secondary py-2 rounded-lg text-sm"
      >
        View PDF
      </a>

      {/* Clone — available on all statuses */}
      <button
        onClick={cloneEstimate}
        disabled={!!loading}
        className="th-btn-secondary w-full py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {loading === 'Clone' ? 'Cloning...' : 'Clone Estimate'}
      </button>

      {status === 'DRAFT' && (
        <>
          <button
            onClick={() => action('send', 'Send')}
            disabled={!!loading}
            className="th-btn-primary w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading === 'Send' ? 'Sending...' : 'Send to Client'}
          </button>
          <button
            onClick={deleteEstimate}
            disabled={!!loading}
            className="w-full py-2 rounded-lg text-sm text-red-400 hover:text-red-300 border border-th-border hover:bg-th-elevated transition-colors disabled:opacity-50"
          >
            {loading === 'Delete' ? 'Deleting...' : 'Delete Draft'}
          </button>
        </>
      )}

      {status === 'APPROVED' && (
        <button
          onClick={() => action('convert', 'Convert to Invoice')}
          disabled={!!loading}
          className="th-btn-primary w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading === 'Convert to Invoice' ? 'Converting...' : 'Convert to Invoice'}
        </button>
      )}

      {status === 'CONVERTED' && convertedToInvoiceId && (
        <Link
          href={`/invoices/${convertedToInvoiceId}`}
          className="block w-full text-center th-btn-secondary py-2 rounded-lg text-sm"
        >
          View Invoice
        </Link>
      )}

      {status === 'SENT' && (
        <p className="text-xs text-th-muted text-center">Awaiting client response...</p>
      )}
    </div>
  )
}
