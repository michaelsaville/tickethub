import { redirect } from 'next/navigation'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import { ClientQbrReport } from './ClientQbrReport'

export const dynamic = 'force-dynamic'

export default async function ClientQbrPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/dashboard')
  }

  const clients = await prisma.tH_Client.findMany({
    where: { isActive: true },
    select: { id: true, name: true, shortCode: true },
    orderBy: { name: 'asc' },
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
          Client Report (QBR)
        </h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Generate client-facing monthly or quarterly business review reports.
        </p>
      </header>

      <ClientQbrReport clients={clients} />
    </div>
  )
}
