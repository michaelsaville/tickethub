import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { NewTicketForm } from './NewTicketForm'

export const dynamic = 'force-dynamic'

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{
    clientId?: string
    title?: string
    description?: string
    contactEmail?: string
  }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const [clients, techs, sites] = await Promise.all([
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
    prisma.tH_Site.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true,
        name: true,
        clientId: true,
        latitude: true,
        longitude: true,
      },
    }),
  ])

  const sp = await searchParams
  let initialClientId = sp.clientId ?? ''

  // Bookmarklet prefill: when contactEmail is given, look up the matching
  // active TH_Contact and pre-select their client. Best-effort — silently
  // skips when no contact matches.
  if (!initialClientId && sp.contactEmail) {
    const email = sp.contactEmail.trim().toLowerCase()
    if (email) {
      const contact = await prisma.tH_Contact.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          isActive: true,
          client: { isActive: true },
        },
        select: { clientId: true },
      })
      if (contact) initialClientId = contact.clientId
    }
  }

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
        sites={sites.map((s) => ({
          id: s.id,
          name: s.name,
          clientId: s.clientId,
          latitude: s.latitude!,
          longitude: s.longitude!,
        }))}
        initialClientId={initialClientId}
        initialTitle={sp.title ?? ''}
        initialDescription={sp.description ?? ''}
      />
    </div>
  )
}
