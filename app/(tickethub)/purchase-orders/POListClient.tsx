'use client'

import Link from 'next/link'

type Row = {
  id: string
  poNumber: number
  status: string
  externalRef: string | null
  sentAt: string | null
  expectedAt: string | null
  receivedAt: string | null
  createdAt: string
  vendor: { id: string; name: string }
  createdBy: { id: string; name: string }
  totalCents: number
  totalUnits: number
  receivedUnits: number
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-700 text-slate-200',
  SENT: 'bg-sky-500/20 text-sky-300',
  PARTIAL: 'bg-amber-500/20 text-amber-300',
  RECEIVED: 'bg-emerald-500/20 text-emerald-300',
  CLOSED: 'bg-th-elevated text-th-text-muted',
  CANCELLED: 'bg-rose-500/15 text-rose-300',
}

export function POListClient({
  rows,
  vendors: _vendors,
}: {
  rows: Row[]
  vendors: { id: string; name: string }[]
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-th-border p-12 text-center text-sm text-th-text-secondary">
        No POs in this view. Create one with the “New PO” button.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-md border border-th-border">
      <table className="w-full text-sm">
        <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
          <tr>
            <th className="px-3 py-2 text-left">PO#</th>
            <th className="px-3 py-2 text-left">Vendor</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Lines</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-left">Expected</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-th-border">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-th-elevated">
              <td className="px-3 py-2 font-mono text-slate-100">
                <Link
                  href={`/purchase-orders/${r.id}`}
                  className="text-accent hover:underline"
                >
                  PO-{r.poNumber}
                </Link>
                {r.externalRef && (
                  <span className="ml-2 text-[11px] text-th-text-muted">
                    ↗ {r.externalRef}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-slate-100">{r.vendor.name}</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
                    STATUS_COLOR[r.status] ?? 'bg-th-elevated text-th-text-muted'
                  }`}
                >
                  {r.status.toLowerCase()}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                {r.receivedUnits}/{r.totalUnits}
              </td>
              <td className="px-3 py-2 text-right font-mono text-slate-100">
                ${(r.totalCents / 100).toFixed(2)}
              </td>
              <td className="px-3 py-2 text-th-text-secondary">
                {r.expectedAt
                  ? new Date(r.expectedAt).toLocaleDateString()
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
