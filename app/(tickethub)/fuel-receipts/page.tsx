import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { formatCents } from '@/app/lib/billing'

export const dynamic = 'force-dynamic'

export default async function FuelReceiptsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const canSeeAll = hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')
  const receipts = await prisma.tH_FuelReceipt.findMany({
    where: canSeeAll ? {} : { submittedById: session!.user.id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      submittedBy: { select: { name: true, email: true } },
      charge: {
        select: {
          id: true,
          ticket: { select: { id: true, ticketNumber: true, title: true } },
        },
      },
    },
  })

  const totalCents = receipts.reduce((s, r) => s + (r.totalAmount ?? 0), 0)
  const totalGallons = receipts.reduce((s, r) => s + (r.gallons ?? 0), 0)

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl text-slate-100">Fuel Receipts</h1>
          <p className="mt-1 text-sm text-th-text-secondary">
            {canSeeAll
              ? 'All submitted fuel receipts across the team.'
              : 'Your submitted fuel receipts. Snap receipts from the ticket page via the receipt scanner.'}
          </p>
        </div>
        <div className="rounded-md border border-th-border bg-th-surface px-4 py-3 text-right">
          <div className="font-mono text-lg text-slate-100">
            {formatCents(totalCents)}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-th-text-muted">
            {receipts.length} receipts · {totalGallons.toFixed(1)} gal
          </div>
        </div>
      </header>

      {receipts.length === 0 ? (
        <div className="rounded-md border border-dashed border-th-border p-12 text-center">
          <div className="text-base text-slate-300">No fuel receipts yet.</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-th-text-secondary">
            Open a ticket in the field, use the <strong>Receipt Scanner</strong> to
            snap a photo of the pump receipt, and it will land here tagged to the
            ticket and charge.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-th-border">
          <table className="w-full text-sm">
            <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Vendor</th>
                <th className="px-3 py-2 text-left">Vehicle</th>
                <th className="px-3 py-2 text-right">Gallons</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Ticket</th>
                {canSeeAll && <th className="px-3 py-2 text-left">Tech</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border">
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-th-elevated">
                  <td className="px-3 py-2 text-th-text-secondary">
                    {r.date
                      ? new Date(r.date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-200">{r.vendor ?? '—'}</td>
                  <td className="px-3 py-2 text-th-text-secondary">
                    {r.vehicle ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                    {r.gallons != null ? r.gallons.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-100">
                    {r.totalAmount != null ? formatCents(r.totalAmount) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {r.charge?.ticket ? (
                      <Link
                        href={`/tickets/${r.charge.ticket.id}`}
                        className="text-accent hover:underline"
                      >
                        #{r.charge.ticket.ticketNumber}
                      </Link>
                    ) : (
                      <span className="text-th-text-muted">—</span>
                    )}
                  </td>
                  {canSeeAll && (
                    <td className="px-3 py-2 text-th-text-secondary">
                      {r.submittedBy.name}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
