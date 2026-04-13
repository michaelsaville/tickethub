import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { getWorkingHours } from '@/app/lib/actions/working-hours'
import { WorkingHoursEditor } from './WorkingHoursEditor'

export const dynamic = 'force-dynamic'

export default async function WorkingHoursPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Working Hours</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required to manage working hours.
        </p>
      </div>
    )
  }

  const techs = await prisma.tH_User.findMany({
    where: { isActive: true, role: { in: ['GLOBAL_ADMIN', 'TICKETHUB_ADMIN', 'TECH', 'DISPATCHER'] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  // Pre-load schedules for all techs
  const schedules: Record<string, Awaited<ReturnType<typeof getWorkingHours>>> = {}
  for (const tech of techs) {
    schedules[tech.id] = await getWorkingHours(tech.id)
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="font-mono text-2xl text-slate-100">Working Hours</h1>
      <p className="mt-1 text-sm text-slate-400">
        Configure per-tech working schedules. These are used on the dispatch board
        to show availability and gray out off-hours.
      </p>

      <div className="mt-6 space-y-8">
        {techs.map((tech) => (
          <WorkingHoursEditor
            key={tech.id}
            techId={tech.id}
            techName={tech.name}
            initialSchedule={schedules[tech.id]}
          />
        ))}
      </div>
    </div>
  )
}
