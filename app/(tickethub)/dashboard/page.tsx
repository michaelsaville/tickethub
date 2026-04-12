import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { SlaBadge } from '@/app/components/SlaBadge'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const userId = session!.user.id

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const [
    myOpen,
    unassigned,
    slaAtRisk,
    closedThisWeek,
    inboxPending,
    inboxForwardedByMe,
    recent,
  ] = await Promise.all([
    prisma.tH_Ticket.count({
      where: {
        assignedToId: userId,
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        deletedAt: null,
      },
    }),
    prisma.tH_Ticket.count({
      where: {
        assignedToId: null,
        status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
        deletedAt: null,
      },
    }),
    prisma.tH_Ticket.count({
      where: {
        status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
        deletedAt: null,
        slaPausedAt: null,
        OR: [{ slaBreached: true }, { slaResolveDue: { lte: in24h } }],
      },
    }),
    prisma.tH_Ticket.count({
      where: {
        closedAt: { gte: startOfWeek },
        status: { in: ['CLOSED', 'RESOLVED'] },
        deletedAt: null,
      },
    }),
    prisma.tH_PendingInboundEmail.count({
      where: { status: 'PENDING' },
    }),
    prisma.tH_PendingInboundEmail.count({
      where: { status: 'PENDING', forwardedByUserId: userId },
    }),
    prisma.tH_Ticket.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['CLOSED', 'CANCELLED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        updatedAt: true,
        createdAt: true,
        slaResolveDue: true,
        slaPausedAt: true,
        slaBreached: true,
        client: { select: { name: true, shortCode: true } },
        assignedTo: { select: { name: true } },
      },
    }),
  ])

  const stats: Array<{
    label: string
    value: number
    href: string
    /** "urgent" uses red, "accent" uses amber brand color, undefined is quiet. */
    tone?: 'urgent' | 'accent'
    sublabel?: string | null
  }> = [
    { label: 'My Open Tickets', value: myOpen, href: '/tickets?view=mine' },
    { label: 'Unassigned', value: unassigned, href: '/tickets?view=unassigned' },
    {
      label: 'SLA At Risk',
      value: slaAtRisk,
      href: '/tickets?view=sla-risk',
      tone: slaAtRisk > 0 ? 'urgent' : undefined,
    },
    {
      label: 'Inbox',
      value: inboxPending,
      href: '/inbox',
      tone: inboxPending > 0 ? 'accent' : undefined,
      sublabel:
        inboxForwardedByMe > 0 ? `${inboxForwardedByMe} from you` : null,
    },
    {
      label: 'Closed This Week',
      value: closedThisWeek,
      href: '/tickets?status=CLOSED',
    },
  ]

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">Dashboard</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ''}.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((s) => {
          const cardClass =
            s.tone === 'urgent'
              ? 'th-card border-priority-urgent/40 bg-priority-urgent/5 transition-colors hover:bg-priority-urgent/10'
              : s.tone === 'accent'
                ? 'th-card border-accent/40 bg-accent/5 transition-colors hover:bg-accent/10'
                : 'th-card transition-colors hover:bg-th-elevated'
          const numberClass =
            s.tone === 'urgent'
              ? 'mt-2 text-3xl font-semibold text-priority-urgent'
              : s.tone === 'accent'
                ? 'mt-2 text-3xl font-semibold text-accent'
                : 'mt-2 text-3xl font-semibold text-slate-100'
          return (
            <Link key={s.label} href={s.href} className={cardClass}>
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                {s.label}
              </div>
              <div className={numberClass}>{s.value}</div>
              {s.sublabel && (
                <div className="mt-1 font-mono text-[10px] text-accent/80">
                  ↪ {s.sublabel}
                </div>
              )}
            </Link>
          )
        })}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Recently Updated
        </h2>
        {recent.length === 0 ? (
          <div className="th-card text-center text-sm text-th-text-secondary">
            No active tickets.
          </div>
        ) : (
          <ul className="divide-y divide-th-border overflow-hidden rounded-lg border border-th-border bg-th-surface">
            {recent.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-th-elevated"
                >
                  <span className="font-mono text-xs text-th-text-muted">
                    #{t.ticketNumber}
                  </span>
                  <span className="flex-1 truncate text-sm text-slate-100">
                    {t.title}
                  </span>
                  <span className="w-28 truncate text-xs text-th-text-secondary">
                    {t.client.shortCode ?? t.client.name}
                  </span>
                  <SlaBadge ticket={t} />
                  <span
                    className={`badge-status-${t.status.toLowerCase().replace(/_/g, '-')}`}
                  >
                    {t.status.replace(/_/g, ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
