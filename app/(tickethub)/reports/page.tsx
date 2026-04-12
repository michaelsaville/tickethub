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
    </div>
  )
}
