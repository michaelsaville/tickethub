import { redirect } from 'next/navigation'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { ProfitabilityReport } from './ProfitabilityReport'

export const dynamic = 'force-dynamic'

export default async function ProfitabilityPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <a
          href="/reports"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          &larr; Back to Reports
        </a>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Profitability
        </h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Revenue, labor cost, parts cost, and margin breakdowns.
        </p>
      </header>

      <ProfitabilityReport />
    </div>
  )
}
