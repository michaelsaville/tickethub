import { redirect } from 'next/navigation'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { ReportBuilder } from './ReportBuilder'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">Reports</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Ask questions about your ticket data in plain English.
        </p>
      </header>

      <ReportBuilder />

      <div className="mt-8">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Canned Reports
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: '/reports/tech-performance',
              icon: '📊',
              title: 'Tech Performance',
              desc: 'Tickets closed, resolution times, and utilization per tech',
            },
            {
              href: '/reports/sla-compliance',
              icon: '🎯',
              title: 'SLA Compliance',
              desc: 'Breach rates by priority and client',
            },
            {
              href: '/reports/profitability',
              icon: '💰',
              title: 'Profitability',
              desc: 'Revenue, costs, and margin by client, contract, or tech',
            },
            {
              href: '/reports/volume-trends',
              icon: '📈',
              title: 'Volume Trends',
              desc: 'Ticket inflow vs resolution over time',
            },
            {
              href: '/reports/field-activity',
              icon: '📍',
              title: 'Field Activity',
              desc: 'Daily stopping points, site visits, and missed tickets',
            },
            {
              href: '/reports/client-qbr',
              icon: '📄',
              title: 'Client Report (QBR)',
              desc: 'Client-facing monthly/quarterly service reports with PDF export',
            },
            {
              href: '/reports/ar-aging',
              icon: '🧾',
              title: 'AR Aging',
              desc: 'Outstanding invoice balances by client, bucketed by days past due',
            },
            {
              href: '/reports/unbilled-time',
              icon: '⏱️',
              title: 'Unbilled Time',
              desc: 'Billable charges not yet on an invoice — revenue at risk',
            },
          ].map((r) => (
            <a
              key={r.href}
              href={r.href}
              className="th-card flex items-center gap-3 hover:border-accent/40 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent text-lg">
                {r.icon}
              </div>
              <div>
                <div className="font-medium text-sm text-slate-200">
                  {r.title}
                </div>
                <div className="text-xs text-th-text-secondary">{r.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
