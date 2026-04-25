import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { getCurrentOnCall } from '@/app/lib/on-call'
import { OnCallEditor } from './OnCallEditor'

export const dynamic = 'force-dynamic'

export default async function OnCallSettingsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/settings')
  }

  const now = new Date()
  const horizon = new Date(now)
  horizon.setDate(horizon.getDate() + 90)

  const [users, upcoming, current] = await Promise.all([
    prisma.tH_User.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    }),
    prisma.tH_OnCallShift.findMany({
      where: { endsAt: { gte: now }, startsAt: { lt: horizon } },
      orderBy: { startsAt: 'asc' },
      include: { user: { select: { id: true, name: true } } },
    }),
    getCurrentOnCall(now),
  ])

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/settings"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          On-call rotation
        </h1>
        <p className="mt-1 text-xs text-th-text-muted">
          Shifts are the source of truth. Generate a weekly rotation, or
          add manual swap rows that win over generated ones via newest-first.
        </p>
      </header>

      <div className="mb-6 rounded-lg border border-th-border bg-th-surface p-4">
        <div className="text-xs uppercase tracking-wider text-th-text-muted">
          Currently on call
        </div>
        {current ? (
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-xl text-amber-400">
              {current.name}
            </span>
            <span className="text-xs text-th-text-muted">
              until{' '}
              {current.endsAt.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              · {current.source}
            </span>
          </div>
        ) : (
          <div className="mt-2 text-sm text-th-text-secondary">
            Nobody is on call right now &mdash; <code>notifyOnCall</code> calls
            will fall back to the team topic.
          </div>
        )}
      </div>

      <OnCallEditor
        users={JSON.parse(JSON.stringify(users))}
        upcoming={JSON.parse(JSON.stringify(upcoming))}
      />
    </div>
  )
}
