import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { InboxList } from './InboxList'

export const dynamic = 'force-dynamic'

type FilterKind = 'all' | 'forwarded' | 'cold' | 'dismissed'

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { session, error } = await requireAuth('TECH')
  if (error) redirect('/api/auth/signin?callbackUrl=/inbox')

  const params = await searchParams
  const filter: FilterKind =
    params.filter === 'forwarded' ||
    params.filter === 'cold' ||
    params.filter === 'dismissed'
      ? params.filter
      : 'all'

  const where =
    filter === 'forwarded'
      ? { status: 'PENDING' as const, forwardedByUserId: { not: null } }
      : filter === 'cold'
        ? { status: 'PENDING' as const, forwardedByUserId: null }
        : filter === 'dismissed'
          ? { status: 'DISMISSED' as const }
          : { status: 'PENDING' as const }

  const [rows, counts, clients, techs] = await Promise.all([
    prisma.tH_PendingInboundEmail.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: 200,
      include: {
        forwardedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.tH_PendingInboundEmail.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.tH_Client.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shortCode: true },
    }),
    prisma.tH_User.findMany({
      where: { isActive: true, role: { not: 'DEACTIVATED' } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const forwardedCount = await prisma.tH_PendingInboundEmail.count({
    where: { status: 'PENDING', forwardedByUserId: { not: null } },
  })
  const coldCount = await prisma.tH_PendingInboundEmail.count({
    where: { status: 'PENDING', forwardedByUserId: null },
  })
  const dismissedCount =
    counts.find((c) => c.status === 'DISMISSED')?._count._all ?? 0

  const serialized = rows.map((r) => ({
    id: r.id,
    fromEmail: r.fromEmail,
    fromName: r.fromName,
    subject: r.subject,
    snippet: r.snippet,
    bodyText: r.bodyText,
    receivedAt: r.receivedAt.toISOString(),
    additionalCount: r.additionalCount,
    forwardedBy: r.forwardedBy?.name ?? null,
    forwardedByUserId: r.forwardedByUserId,
    status: r.status,
    matchedTicketId: r.matchedTicketId,
    mailbox: r.mailbox ?? null,
  }))

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6">
        <h1 className="font-mono text-sm uppercase tracking-widest text-accent">
          Inbox
        </h1>
        <p className="mt-1 text-xs text-th-text-muted">
          Inbound emails that need a human to decide. Forwarded messages land
          here automatically; unknown senders land here too if they don't
          match a client contact.
        </p>
      </header>

      <nav className="mb-4 flex flex-wrap gap-2">
        <FilterChip href="/inbox?filter=all" active={filter === 'all'}>
          All Pending ({forwardedCount + coldCount})
        </FilterChip>
        <FilterChip
          href="/inbox?filter=forwarded"
          active={filter === 'forwarded'}
        >
          Forwarded ({forwardedCount})
        </FilterChip>
        <FilterChip href="/inbox?filter=cold" active={filter === 'cold'}>
          Cold ({coldCount})
        </FilterChip>
        <FilterChip
          href="/inbox?filter=dismissed"
          active={filter === 'dismissed'}
        >
          Dismissed ({dismissedCount})
        </FilterChip>
      </nav>

      <InboxList
        rows={serialized}
        clients={clients}
        techs={techs}
        currentUserId={session!.user.id}
      />
    </div>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={
        active
          ? 'rounded-full border border-accent bg-accent/15 px-3 py-1 text-xs text-accent'
          : 'rounded-full border border-th-border bg-th-surface px-3 py-1 text-xs text-th-text-muted hover:border-accent/40 hover:text-slate-200'
      }
    >
      {children}
    </a>
  )
}
