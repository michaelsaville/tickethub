import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { formatCents } from '@/app/lib/billing'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-blue-900/50 text-blue-300',
  SENT: 'bg-amber-900/50 text-amber-300',
  APPROVED: 'bg-green-900/50 text-green-300',
  DECLINED: 'bg-red-900/50 text-red-300',
  EXPIRED: 'bg-gray-800/50 text-gray-400',
  CONVERTED: 'bg-purple-900/50 text-purple-300',
}

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const where: any = {}
  if (status && status !== 'ALL') where.status = status

  const estimates = await prisma.tH_Estimate.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      contact: { select: { firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const statuses = ['ALL', 'DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'EXPIRED', 'CONVERTED']
  const activeFilter = status || 'ALL'

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Estimates</h1>
          <p className="text-sm text-th-secondary mt-1">{estimates.length} estimate{estimates.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/estimates/new" className="th-btn-primary px-4 py-2 rounded-lg text-sm font-medium">
          New Estimate
        </Link>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {statuses.map(s => (
          <Link
            key={s}
            href={s === 'ALL' ? '/estimates' : `/estimates?status=${s}`}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeFilter === s
                ? 'bg-accent text-white'
                : 'bg-th-elevated text-th-secondary hover:text-th-primary'
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="th-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-th-elevated text-th-secondary text-xs uppercase tracking-wider">
              <th className="py-3 px-4 text-left">#</th>
              <th className="py-3 px-4 text-left">Title</th>
              <th className="py-3 px-4 text-left">Client</th>
              <th className="py-3 px-4 text-left">Contact</th>
              <th className="py-3 px-4 text-center">Items</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-right">Total</th>
              <th className="py-3 px-4 text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {estimates.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center text-th-muted">No estimates found</td></tr>
            )}
            {estimates.map(e => (
              <tr key={e.id} className="border-t border-th-border hover:bg-th-elevated/50 transition-colors">
                <td className="py-3 px-4 font-mono text-th-secondary">{e.estimateNumber}</td>
                <td className="py-3 px-4">
                  <Link href={`/estimates/${e.id}`} className="font-medium hover:text-accent">
                    {e.title}
                  </Link>
                </td>
                <td className="py-3 px-4 text-th-secondary">{e.client.name}</td>
                <td className="py-3 px-4 text-th-secondary">
                  {e.contact ? `${e.contact.firstName} ${e.contact.lastName}` : '—'}
                </td>
                <td className="py-3 px-4 text-center text-th-secondary">{e._count.items}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status] || ''}`}>
                    {e.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-mono">{formatCents(e.totalAmount)}</td>
                <td className="py-3 px-4 text-right text-th-secondary text-xs">
                  {new Date(e.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
