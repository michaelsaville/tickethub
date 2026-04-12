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
          Other Reports
        </h2>
        <a
          href="/reports/field-activity"
          className="th-card flex items-center gap-3 hover:border-accent/40 transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent text-lg">
            📍
          </div>
          <div>
            <div className="font-medium text-sm text-slate-200">
              Field Activity
            </div>
            <div className="text-xs text-th-text-secondary">
              Daily stopping points, site visits, and missed ticket alerts
            </div>
          </div>
        </a>
      </div>
    </div>
  )
}
