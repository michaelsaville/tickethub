import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import { NewReminderForm } from './NewReminderForm'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function NewReminderPage() {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const clients = await prisma.tH_Client.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      shortCode: true,
      contacts: {
        where: { isActive: true },
        orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  })

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/reminders"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Back to Reminders
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          New Reminder
        </h1>
      </header>

      <NewReminderForm clients={clients} />
    </div>
  )
}
