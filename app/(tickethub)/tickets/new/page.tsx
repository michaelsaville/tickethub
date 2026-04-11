import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { NewTicketForm } from './NewTicketForm'

export const dynamic = 'force-dynamic'

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const [clients, techs] = await Promise.all([
    prisma.tH_Client.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shortCode: true },
    }),
    prisma.tH_User.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const sp = await searchParams
  const initialClientId = sp.clientId ?? ''

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/tickets"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Back to tickets
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">New Ticket</h1>
      </header>

      <NewTicketForm
        clients={clients}
        techs={techs}
        initialClientId={initialClientId}
      />
    </div>
  )
}
