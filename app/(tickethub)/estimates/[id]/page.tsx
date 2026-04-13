import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { formatCents } from '@/app/lib/billing'
import { formatRate } from '@/app/lib/tax'
import EstimateActions from './EstimateActions'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-blue-900/50 text-blue-300',
  SENT: 'bg-amber-900/50 text-amber-300',
  APPROVED: 'bg-green-900/50 text-green-300',
  DECLINED: 'bg-red-900/50 text-red-300',
  EXPIRED: 'bg-gray-800/50 text-gray-400',
  CONVERTED: 'bg-purple-900/50 text-purple-300',
}

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, billingState: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      contract: { select: { id: true, name: true, type: true } },
      items: {
        include: { item: { select: { id: true, name: true, type: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!estimate) redirect('/estimates')

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/estimates" className="text-xs text-th-secondary hover:text-accent mb-2 block">← Estimates</Link>
          <h1 className="text-xl font-semibold">Estimate #{estimate.estimateNumber}</h1>
          <p className="text-sm text-th-secondary mt-1">{estimate.title}</p>
        </div>
        <span className={`px-3 py-1 rounded text-sm font-medium ${STATUS_COLORS[estimate.status] || ''}`}>
          {estimate.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Client info */}
          <div className="th-card p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-th-secondary uppercase tracking-wider mb-1">Client</div>
                <div className="font-medium">{estimate.client.name}</div>
              </div>
              <div>
                <div className="text-xs text-th-secondary uppercase tracking-wider mb-1">Contact</div>
                <div>{estimate.contact ? `${estimate.contact.firstName} ${estimate.contact.lastName}` : '—'}</div>
                {estimate.contact?.email && <div className="text-xs text-th-muted">{estimate.contact.email}</div>}
              </div>
              {estimate.contract && (
                <div>
                  <div className="text-xs text-th-secondary uppercase tracking-wider mb-1">Contract</div>
                  <div>{estimate.contract.name} ({estimate.contract.type})</div>
                </div>
              )}
              {estimate.validUntil && (
                <div>
                  <div className="text-xs text-th-secondary uppercase tracking-wider mb-1">Valid Until</div>
                  <div>{new Date(estimate.validUntil).toLocaleDateString()}</div>
                </div>
              )}
            </div>
            {estimate.description && (
              <div className="mt-4 pt-3 border-t border-th-border text-sm text-th-secondary">{estimate.description}</div>
            )}
          </div>

          {/* Line items */}
          <div className="th-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-th-elevated text-xs text-th-secondary uppercase tracking-wider">
                  <th className="py-3 px-4 text-left">Item</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {estimate.items.map(item => (
                  <tr key={item.id} className="border-t border-th-border">
                    <td className="py-3 px-4">
                      <div className="font-medium">{item.item.name}</div>
                      {item.description && <div className="text-xs text-th-muted mt-0.5">{item.description}</div>}
                      <div className="text-xs text-th-muted">{item.item.type}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{item.quantity}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCents(item.unitPrice)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCents(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {estimate.notes && (
            <div className="th-card p-4">
              <div className="text-xs text-th-secondary uppercase tracking-wider mb-2">Notes</div>
              <div className="text-sm text-th-secondary whitespace-pre-wrap">{estimate.notes}</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Totals */}
          <div className="th-card p-4">
            <div className="text-xs text-th-secondary uppercase tracking-wider mb-3 font-medium">Totals</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-th-secondary">Subtotal</span><span className="font-mono">{formatCents(estimate.subtotal)}</span></div>
              {estimate.taxAmount > 0 && (
                <div className="flex justify-between"><span className="text-th-secondary">Tax ({estimate.taxState} {formatRate(estimate.taxRate)})</span><span className="font-mono">{formatCents(estimate.taxAmount)}</span></div>
              )}
              <div className="flex justify-between pt-2 border-t border-th-border text-lg font-bold">
                <span>Total</span>
                <span className="font-mono">{formatCents(estimate.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <EstimateActions
            estimateId={estimate.id}
            status={estimate.status}
            estimateNumber={estimate.estimateNumber}
            convertedToInvoiceId={estimate.convertedToInvoiceId}
          />

          {/* Timeline */}
          <div className="th-card p-4">
            <div className="text-xs text-th-secondary uppercase tracking-wider mb-3 font-medium">Timeline</div>
            <div className="space-y-2 text-xs text-th-secondary">
              <div>Created: {new Date(estimate.createdAt).toLocaleString()}</div>
              {estimate.sentAt && <div>Sent: {new Date(estimate.sentAt).toLocaleString()}</div>}
              {estimate.approvedAt && <div className="text-green-400">Approved: {new Date(estimate.approvedAt).toLocaleString()}</div>}
              {estimate.declinedAt && <div className="text-red-400">Declined: {new Date(estimate.declinedAt).toLocaleString()}</div>}
              {estimate.convertedAt && <div className="text-purple-400">Converted: {new Date(estimate.convertedAt).toLocaleString()}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
