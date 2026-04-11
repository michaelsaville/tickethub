import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { redirect } from 'next/navigation'
import { ClientSearch } from './ClientSearch'

export const dynamic = 'force-dynamic'

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactive?: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const sp = await searchParams
  const q = sp.q?.trim() ?? ''
  const includeInactive = sp.inactive === '1'

  const clients = await prisma.tH_Client.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { shortCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      shortCode: true,
      isActive: true,
      _count: { select: { contacts: true, sites: true, tickets: true } },
    },
  })

  return (
    <div className="p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl text-slate-100">Clients</h1>
          <p className="mt-1 text-sm text-th-text-secondary">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
            {q ? ` matching "${q}"` : ''}
          </p>
        </div>
        <Link href="/clients/new" className="th-btn-primary">
          + New Client
        </Link>
      </header>

      <ClientSearch initialQuery={q} includeInactive={includeInactive} />

      {clients.length === 0 ? (
        <div className="th-card mt-6 text-center">
          <p className="text-sm text-th-text-secondary">
            {q
              ? `No clients matching "${q}".`
              : 'No clients yet. Click "New Client" to get started.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-th-border">
          <table className="w-full text-sm">
            <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2 w-24">Code</th>
                <th className="px-4 py-2 w-24 text-right">Contacts</th>
                <th className="px-4 py-2 w-24 text-right">Sites</th>
                <th className="px-4 py-2 w-24 text-right">Tickets</th>
                <th className="px-4 py-2 w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border bg-th-surface">
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className="transition-colors hover:bg-th-elevated"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium text-slate-100 hover:text-accent"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-th-text-secondary">
                    {c.shortCode ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-th-text-secondary">
                    {c._count.contacts}
                  </td>
                  <td className="px-4 py-3 text-right text-th-text-secondary">
                    {c._count.sites}
                  </td>
                  <td className="px-4 py-3 text-right text-th-text-secondary">
                    {c._count.tickets}
                  </td>
                  <td className="px-4 py-3">
                    {c.isActive ? (
                      <span className="text-xs text-status-resolved">Active</span>
                    ) : (
                      <span className="text-xs text-th-text-muted">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
