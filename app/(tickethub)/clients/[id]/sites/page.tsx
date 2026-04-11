import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { SitesList } from './SitesList'

export const dynamic = 'force-dynamic'

export default async function SitesPage({
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
      sites: {
        orderBy: { name: 'asc' },
        include: { _count: { select: { tickets: true } } },
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
        <h1 className="mt-2 font-mono text-2xl text-slate-100">Sites</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {client.sites.length}{' '}
          {client.sites.length === 1 ? 'site' : 'sites'}
        </p>
      </header>

      <SitesList clientId={client.id} sites={client.sites} />
    </div>
  )
}
