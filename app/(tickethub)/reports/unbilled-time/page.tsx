import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { formatCents } from '@/app/lib/billing'

export const dynamic = 'force-dynamic'

type GroupBy = 'client' | 'tech'

export default async function UnbilledTimeReportPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) redirect('/dashboard')

  const params = await searchParams
  const groupBy: GroupBy = params.groupBy === 'tech' ? 'tech' : 'client'

  const now = new Date()
  const charges = await prisma.tH_Charge.findMany({
    where: {
      status: 'BILLABLE',
      invoiceId: null,
      isBillable: true,
    },
    select: {
      id: true,
      type: true,
      totalPrice: true,
      timeChargedMinutes: true,
      quantity: true,
      workDate: true,
      technicianId: true,
      technician: { select: { id: true, name: true } },
      contract: {
        select: {
          id: true,
          client: { select: { id: true, name: true, shortCode: true } },
        },
      },
    },
    orderBy: { workDate: 'asc' },
  })

  type Row = {
    id: string
    label: string
    subLabel: string | null
    href: string | null
    totalCents: number
    count: number
    laborMinutes: number
    oldestWorkDate: Date | null
    oldestDaysAgo: number
  }
  const groups = new Map<string, Row>()
  let grandTotal = 0
  let grandLaborMinutes = 0

  for (const c of charges) {
    const client = c.contract?.client
    let key: string
    let label: string
    let subLabel: string | null
    let href: string | null
    if (groupBy === 'client') {
      key = client?.id ?? 'unknown'
      label = client?.name ?? '(Unknown client)'
      subLabel = client?.shortCode ?? null
      href = client ? `/clients/${client.id}` : null
    } else {
      key = c.technicianId ?? 'unassigned'
      label = c.technician?.name ?? '(Unassigned)'
      subLabel = null
      href = null
    }

    const row =
      groups.get(key) ??
      ({
        id: key,
        label,
        subLabel,
        href,
        totalCents: 0,
        count: 0,
        laborMinutes: 0,
        oldestWorkDate: null,
        oldestDaysAgo: 0,
      } as Row)
    row.totalCents += c.totalPrice
    row.count += 1
    if (c.type === 'LABOR' && c.timeChargedMinutes) {
      row.laborMinutes += c.timeChargedMinutes
    }
    if (!row.oldestWorkDate || c.workDate < row.oldestWorkDate) {
      row.oldestWorkDate = c.workDate
      row.oldestDaysAgo = Math.floor(
        (now.getTime() - c.workDate.getTime()) / 86_400_000,
      )
    }
    groups.set(key, row)

    grandTotal += c.totalPrice
    if (c.type === 'LABOR' && c.timeChargedMinutes) {
      grandLaborMinutes += c.timeChargedMinutes
    }
  }

  // Sort: stalest first (oldest unbilled dollars are the biggest risk).
  const rows = [...groups.values()].sort((a, b) => {
    if (a.oldestDaysAgo !== b.oldestDaysAgo) {
      return b.oldestDaysAgo - a.oldestDaysAgo
    }
    return b.totalCents - a.totalCents
  })

  const laborHours = grandLaborMinutes / 60

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/reports"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Reports
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Unbilled Time
        </h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          BILLABLE charges that haven't made it onto an invoice yet.
          The stale column is the dollar age of the oldest unbilled
          work — chase the top of the list first.
        </p>
      </header>

      <div className="mb-4 flex items-center gap-2 text-xs">
        <span className="text-th-text-muted">Group by:</span>
        <GroupToggle active={groupBy === 'client'} href="/reports/unbilled-time">
          Client
        </GroupToggle>
        <GroupToggle
          active={groupBy === 'tech'}
          href="/reports/unbilled-time?groupBy=tech"
        >
          Technician
        </GroupToggle>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Total unbilled"
          value={formatCents(grandTotal)}
          accent
        />
        <SummaryCard
          label="Labor hours pending"
          value={`${laborHours.toFixed(1)}h`}
          sub={`across ${charges.length} charges`}
        />
        <SummaryCard
          label={groupBy === 'client' ? 'Clients affected' : 'Techs with backlog'}
          value={rows.length.toString()}
        />
      </section>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-th-border p-12 text-center">
          <div className="text-base text-slate-300">
            No unbilled billable charges.
          </div>
          <p className="mt-2 text-sm text-th-text-secondary">
            Every BILLABLE charge has been invoiced. Good standing.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-th-border">
          <table className="w-full text-sm">
            <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">
                  {groupBy === 'client' ? 'Client' : 'Technician'}
                </th>
                <th className="px-3 py-2 text-right">Charges</th>
                <th className="px-3 py-2 text-right">Labor hrs</th>
                <th className="px-3 py-2 text-right">Oldest (days)</th>
                <th className="px-3 py-2 text-right">Unbilled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-th-elevated">
                  <td className="px-3 py-2">
                    {r.href ? (
                      <Link
                        href={r.href}
                        className="text-slate-100 hover:text-accent"
                      >
                        {r.label}
                      </Link>
                    ) : (
                      <span className="text-slate-100">{r.label}</span>
                    )}
                    {r.subLabel && (
                      <span className="ml-2 font-mono text-[10px] text-th-text-muted">
                        {r.subLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                    {r.count}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                    {r.laborMinutes > 0
                      ? (r.laborMinutes / 60).toFixed(1)
                      : '—'}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      r.oldestDaysAgo >= 30
                        ? 'text-rose-400'
                        : r.oldestDaysAgo >= 14
                          ? 'text-amber-400'
                          : 'text-th-text-secondary'
                    }`}
                  >
                    {r.oldestDaysAgo}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-slate-100">
                    {formatCents(r.totalCents)}
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
                  {charges.length}
                </td>
                <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                  {laborHours.toFixed(1)}
                </td>
                <td />
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

function GroupToggle({
  active,
  href,
  children,
}: {
  active: boolean
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-md bg-accent/10 px-3 py-1 text-accent ring-1 ring-accent/30'
          : 'rounded-md px-3 py-1 text-th-text-secondary hover:bg-th-elevated hover:text-slate-200'
      }
    >
      {children}
    </Link>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        accent
          ? 'border-accent/40 bg-accent/5'
          : 'border-th-border bg-th-surface'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-th-text-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-lg ${
          accent ? 'text-accent' : 'text-slate-100'
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-th-text-muted">{sub}</div>}
    </div>
  )
}
