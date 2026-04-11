import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">Dashboard</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ''}. Scaffold
          placeholder — replace with tech queue / manager overview.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {['My Open Tickets', 'Unassigned', 'SLA At Risk', 'Billable This Week'].map(
          (label) => (
            <div key={label} className="th-card">
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                {label}
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-100">—</div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
