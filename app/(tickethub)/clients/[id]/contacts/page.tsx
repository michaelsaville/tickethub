import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { ContactsList } from './ContactsList'

export const dynamic = 'force-dynamic'

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const { id } = await params

  const client = await prisma.tH_Client.findUnique({
    where: { id },
    include: {
      contacts: {
        where: { isActive: true },
        orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }],
      },
    },
  })
  if (!client) notFound()

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href={`/clients/${client.id}`}
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← {client.name}
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">Contacts</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {client.contacts.length}{' '}
          {client.contacts.length === 1 ? 'contact' : 'contacts'}
        </p>
      </header>

      <ContactsList clientId={client.id} contacts={client.contacts} />
    </div>
  )
}
