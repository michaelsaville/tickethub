import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { RecurringTicketsList } from './RecurringTicketsList'

export const dynamic = 'force-dynamic'

export default async function RecurringTicketsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Recurring Tickets</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required to manage recurring ticket templates.
        </p>
      </div>
    )
  }

  const templates = await prisma.tH_RecurringTicketTemplate.findMany({
    include: {
      client: { select: { name: true, shortCode: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: [{ active: 'desc' }, { nextRunAt: 'asc' }],
  })

  return (
    <div className="p-6">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <Link
            href="/settings"
            className="text-xs text-th-text-secondary hover:text-accent"
          >
            ← Settings
          </Link>
          <h1 className="mt-2 font-mono text-2xl text-slate-100">
            Recurring Tickets
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
            Auto-spawn tickets on a daily/weekly/monthly schedule. The cron runs
            hourly — schedules with a finer cadence will still fire once per
            cron tick. Each spawn is independent of prior runs.
          </p>
        </div>
        <Link
          href="/recurring-tickets/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-th-bg"
        >
          + New template
        </Link>
      </header>

      <RecurringTicketsList templates={templates} />
    </div>
  )
}
