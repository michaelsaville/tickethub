import { redirect } from 'next/navigation'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import { TechPerformanceReport } from './TechPerformanceReport'

export const dynamic = 'force-dynamic'

export default async function TechPerformancePage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

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
          &larr; Back to Reports
        </a>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Tech Performance
        </h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Track technician productivity, resolution times, and labor utilization.
        </p>
      </header>

      <TechPerformanceReport techs={techs} />
    </div>
  )
}
