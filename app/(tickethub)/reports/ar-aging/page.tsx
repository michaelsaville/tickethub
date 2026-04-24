import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { formatCents } from '@/app/lib/billing'

export const dynamic = 'force-dynamic'

const BUCKETS = [
  { key: 'current', label: 'Current', minDays: -Infinity, maxDays: 0 },
  { key: 'd1_30', label: '1–30', minDays: 1, maxDays: 30 },
  { key: 'd31_60', label: '31–60', minDays: 31, maxDays: 60 },
  { key: 'd61_90', label: '61–90', minDays: 61, maxDays: 90 },
  { key: 'd90', label: '90+', minDays: 91, maxDays: Infinity },
] as const

type BucketKey = (typeof BUCKETS)[number]['key']

function bucketFor(daysPastDue: number): BucketKey {
  for (const b of BUCKETS) {
    if (daysPastDue >= b.minDays && daysPastDue <= b.maxDays) return b.key
  }
  return 'current'
}

export default async function ARAgingReportPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) redirect('/dashboard')

  const now = new Date()
  const invoices = await prisma.tH_Invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ['SENT', 'VIEWED', 'OVERDUE'] },
    },
    select: {
      id: true,
      invoiceNumber: true,
      issueDate: true,
      dueDate: true,
      totalAmount: true,
      status: true,
      clientId: true,
      client: { select: { id: true, name: true, shortCode: true } },
    },
    orderBy: { dueDate: 'asc' },
  })

  type Row = {
    clientId: string
    clientName: string
    shortCode: string | null
    buckets: Record<BucketKey, number>
    total: number
    invoiceCount: number
    oldestDaysPastDue: number
  }
  const byClient = new Map<string, Row>()
  const grand: Record<BucketKey, number> = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90: 0,
  }
  let grandTotal = 0

  for (const inv of invoices) {
    const ref = inv.dueDate ?? inv.issueDate
    const daysPastDue = Math.floor(
      (now.getTime() - ref.getTime()) / 86_400_000,
    )
    const key = bucketFor(daysPastDue)
    const row =
      byClient.get(inv.clientId) ??
      ({
        clientId: inv.clientId,
        clientName: inv.client.name,
        shortCode: inv.client.shortCode,
        buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 },
        total: 0,
        invoiceCount: 0,
        oldestDaysPastDue: -Infinity,
      } as Row)
    row.buckets[key] += inv.totalAmount
    row.total += inv.totalAmount
    row.invoiceCount += 1
    if (daysPastDue > row.oldestDaysPastDue) row.oldestDaysPastDue = daysPastDue
    byClient.set(inv.clientId, row)

    grand[key] += inv.totalAmount
    grandTotal += inv.totalAmount
  }

  // Sort: clients with the most overdue dollars (61+ days) first, then total.
  const rows = [...byClient.values()].sort((a, b) => {
    const aOld = a.buckets.d61_90 + a.buckets.d90
    const bOld = b.buckets.d61_90 + b.buckets.d90
    if (aOld !== bOld) return bOld - aOld
    return b.total - a.total
  })

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/reports"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Reports
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">AR Aging</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Outstanding invoice balances bucketed by days past due. SENT,
          VIEWED, and OVERDUE status only — DRAFT, PAID, and VOID are
          excluded.
        </p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total AR" value={formatCents(grandTotal)} accent />
        {BUCKETS.map((b) => {
          const amount = grand[b.key]
          const pct =
            grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0
          return (
            <SummaryCard
              key={b.key}
              label={b.label === 'Current' ? 'Current (not due)' : `${b.label} days`}
              value={formatCents(amount)}
              sub={`${pct}% of AR`}
              warn={b.key === 'd61_90' || b.key === 'd90'}
            />
          )
        })}
      </section>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-th-border p-12 text-center">
          <div className="text-base text-slate-300">No outstanding invoices.</div>
          <p className="mt-2 text-sm text-th-text-secondary">
            Every sent invoice has been paid or voided. Nothing to chase.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-th-border">
          <table className="w-full text-sm">
            <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-right">#</th>
                {BUCKETS.map((b) => (
                  <th key={b.key} className="px-3 py-2 text-right">
                    {b.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border">
              {rows.map((r) => (
                <tr key={r.clientId} className="hover:bg-th-elevated">
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${r.clientId}`}
                      className="text-slate-100 hover:text-accent"
                    >
                      {r.clientName}
                    </Link>
                    {r.shortCode && (
                      <span className="ml-2 font-mono text-[10px] text-th-text-muted">
                        {r.shortCode}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                    {r.invoiceCount}
                  </td>
                  {BUCKETS.map((b) => {
                    const amount = r.buckets[b.key]
                    const danger = b.key === 'd61_90' || b.key === 'd90'
                    return (
                      <td
                        key={b.key}
                        className={`px-3 py-2 text-right font-mono ${
                          amount > 0
                            ? danger
                              ? 'text-rose-400'
                              : 'text-slate-100'
                            : 'text-th-text-muted'
                        }`}
                      >
                        {amount > 0 ? formatCents(amount) : '—'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-mono font-medium text-slate-100">
                    {formatCents(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-th-surface">
              <tr>
                <td className="px-3 py-2 text-xs uppercase tracking-wider text-th-text-muted">
                  Total
                </td>
                <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                  {invoices.length}
                </td>
                {BUCKETS.map((b) => (
                  <td
                    key={b.key}
                    className="px-3 py-2 text-right font-mono font-medium text-slate-100"
                  >
                    {formatCents(grand[b.key])}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-mono font-semibold text-slate-100">
                  {formatCents(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
  warn,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  warn?: boolean
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        accent
          ? 'border-accent/40 bg-accent/5'
          : warn
            ? 'border-rose-500/30 bg-rose-500/5'
            : 'border-th-border bg-th-surface'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-th-text-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-lg ${
          accent ? 'text-accent' : warn ? 'text-rose-400' : 'text-slate-100'
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-th-text-muted">{sub}</div>
      )}
    </div>
  )
}
