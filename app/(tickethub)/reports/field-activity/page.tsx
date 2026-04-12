import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import { FieldActivityReport } from './FieldActivityReport'

export const dynamic = 'force-dynamic'

export default async function FieldActivityPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const techs = await prisma.tH_User.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <div className="p-6">
      <header className="mb-6">
        <a
          href="/reports"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Back to Reports
        </a>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Field Activity
        </h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Track stopping points throughout the day and catch missed tickets.
        </p>
      </header>

      <FieldActivityReport
        techs={techs}
        currentUserId={session!.user.id}
        isAdmin={
          session!.user.role === 'GLOBAL_ADMIN' ||
          session!.user.role === 'TICKETHUB_ADMIN'
        }
      />
    </div>
  )
}
