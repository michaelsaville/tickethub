import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { TIME_APPROVAL_ENABLED } from '@/app/lib/time-approvals-config'
import { ApprovalsClient } from './ApprovalsClient'

export const dynamic = 'force-dynamic'

export default async function TimeApprovalsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

  const charges = await prisma.tH_Charge.findMany({
    where: { status: 'PENDING_REVIEW', type: 'LABOR' },
    orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      description: true,
      workDate: true,
      timeChargedMinutes: true,
      timeSpentMinutes: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      ticketId: true,
      ticket: {
        select: { id: true, ticketNumber: true, title: true },
      },
      technician: { select: { id: true, name: true } },
      contract: {
        select: {
          client: { select: { id: true, name: true, shortCode: true } },
        },
      },
    },
  })

  // Group by tech for the page UX. Charges with no tech land in __unassigned.
  const byTech = new Map<
    string,
    {
      techId: string
      techName: string
      rows: typeof charges
      totalMinutes: number
      totalCents: number
    }
  >()
  for (const c of charges) {
    const techId = c.technician?.id ?? '__unassigned'
    const techName = c.technician?.name ?? '(Unassigned)'
    const g =
      byTech.get(techId) ??
      {
        techId,
        techName,
        rows: [] as typeof charges,
        totalMinutes: 0,
        totalCents: 0,
      }
    g.rows.push(c)
    g.totalMinutes += c.timeChargedMinutes ?? 0
    g.totalCents += c.totalPrice
    byTech.set(techId, g)
  }
  const groups = [...byTech.values()].sort((a, b) =>
    a.techName.localeCompare(b.techName),
  )

  const totals = {
    count: charges.length,
    minutes: groups.reduce((s, g) => s + g.totalMinutes, 0),
    cents: groups.reduce((s, g) => s + g.totalCents, 0),
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Time approvals
        </h1>
        <p className="mt-1 text-xs text-th-text-muted">
          Labor charges sit in PENDING_REVIEW until an admin approves them.
          Approved time becomes BILLABLE and flows into the next invoice;
          unapproved time is not invoice-eligible.
          {!TIME_APPROVAL_ENABLED && (
            <>
              {' '}
              <span className="text-amber-400">
                Master switch off (TICKETHUB_TIME_APPROVAL_ENABLED) — new
                LABOR charges land in BILLABLE directly. The queue still
                works for legacy or manually-set rows.
              </span>
            </>
          )}
        </p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Pending charges" value={totals.count.toString()} />
        <SummaryCard
          label="Pending hours"
          value={`${(totals.minutes / 60).toFixed(1)}h`}
        />
        <SummaryCard
          label="Pending value"
          value={`$${(totals.cents / 100).toFixed(2)}`}
          accent
        />
      </section>

      {groups.length === 0 ? (
        <div className="rounded-md border border-dashed border-th-border p-12 text-center">
          <div className="text-base text-slate-300">
            Nothing waiting for approval.
          </div>
          <p className="mt-2 text-sm text-th-text-secondary">
            All logged labor has been signed off and is invoice-eligible.
          </p>
        </div>
      ) : (
        <ApprovalsClient
          groups={JSON.parse(JSON.stringify(groups))}
        />
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
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
    </div>
  )
}
