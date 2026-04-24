import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { createRecurringTemplate } from '@/app/lib/actions/recurring-tickets'
import { TemplateForm } from '../TemplateForm'

export const dynamic = 'force-dynamic'

export default async function NewRecurringTemplatePage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/recurring-tickets')
  }

  const [clients, techs] = await Promise.all([
    prisma.tH_Client.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        shortCode: true,
        sites: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        contacts: {
          where: { isActive: true },
          select: { id: true, firstName: true, lastName: true, isPrimary: true },
          orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
        },
        contracts: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
          orderBy: [{ isGlobal: 'desc' }, { name: 'asc' }],
        },
      },
    }),
    prisma.tH_User.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/recurring-tickets"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Recurring Tickets
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          New recurring template
        </h1>
      </header>

      <TemplateForm
        clients={clients}
        techs={techs}
        action={createRecurringTemplate}
        successHref="/recurring-tickets"
        submitLabel="Create template"
      />
    </div>
  )
}
