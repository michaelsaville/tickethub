import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { SlaBadge } from '@/app/components/SlaBadge'
import { TicketFilters } from './TicketFilters'
import { SwipeTicketRow } from './SwipeTicketRow'
import { AiSearch } from './AiSearch'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{
  view?: 'mine' | 'unassigned' | 'sla-risk' | 'recent'
  status?: string
  priority?: string
  assigneeId?: string
  q?: string
}>

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const sp = await searchParams
  const where = buildWhere(sp, session!.user.id)

  const [tickets, users] = await Promise.all([
    prisma.tH_Ticket.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        isUnread: true,
        updatedAt: true,
        createdAt: true,
        slaResolveDue: true,
        slaPausedAt: true,
        slaBreached: true,
        client: { select: { id: true, name: true, shortCode: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.tH_User.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const title =
    sp.view === 'mine'
      ? 'My Queue'
      : sp.view === 'unassigned'
        ? 'Unassigned'
        : sp.view === 'sla-risk'
          ? 'SLA At Risk'
          : sp.view === 'recent'
            ? 'Recently Updated'
            : 'All Tickets'

  return (
    <div className="p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl text-slate-100">{title}</h1>
          <p className="mt-1 text-sm text-th-text-secondary">
            {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
          </p>
        </div>
        <Link href="/tickets/new" className="th-btn-primary">
          + New Ticket
        </Link>
      </header>

      <div className="flex items-center gap-2">
        <TicketFilters users={users} currentUserId={session!.user.id} />
        <AiSearch />
      </div>

      {tickets.length === 0 ? (
        <div className="th-card mt-6 text-center">
          <p className="text-sm text-th-text-secondary">
            No tickets matching the current filters.
          </p>
        </div>
      ) : (
        <>
        {/* Mobile: card list below md breakpoint (swipe to resolve / wait) */}
        <ul className="mt-6 space-y-2 md:hidden">
          {tickets.map((t) => (
            <SwipeTicketRow
              key={t.id}
              ticket={t}
              priorityBorderClass={priorityBorderClass(t.priority)}
              statusBadgeClass={statusBadgeClass(t.status)}
            />
          ))}
        </ul>

        {/* Desktop: dense table */}
        <div className="mt-6 hidden overflow-hidden rounded-lg border border-th-border md:block">
          <table className="w-full text-sm">
            <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="w-1 p-0" aria-hidden />
                <th className="px-3 py-2 w-16">#</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2 w-44">Client</th>
                <th className="px-3 py-2 w-32">Assignee</th>
                <th className="px-3 py-2 w-20">SLA</th>
                <th className="px-3 py-2 w-28">Status</th>
                <th className="px-3 py-2 w-20 text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border bg-th-surface">
              {tickets.map((t) => {
                return (
                  <tr
                    key={t.id}
                    className="group transition-colors hover:bg-th-elevated"
                  >
                    <td
                      className={`w-1 p-0 ${priorityBorderClass(t.priority)}`}
                      aria-hidden
                    />
                    <td className="px-3 py-2 font-mono text-xs text-th-text-muted">
                      #{t.ticketNumber}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/tickets/${t.id}`}
                        className={
                          t.isUnread
                            ? 'font-semibold text-slate-100 hover:text-accent'
                            : 'text-slate-300 hover:text-accent'
                        }
                      >
                        {t.isUnread && (
                          <span
                            aria-label="unread"
                            className="mr-2 text-accent"
                          >
                            ✉
                          </span>
                        )}
                        {t.title}
                      </Link>
                    </td>
                    <td className="truncate px-3 py-2 text-th-text-secondary">
                      <Link
                        href={`/clients/${t.client.id}`}
                        className="hover:text-accent"
                      >
                        {t.client.shortCode ?? t.client.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-th-text-secondary">
                      {t.assignedTo ? (
                        <span title={t.assignedTo.email}>
                          {t.assignedTo.name}
                        </span>
                      ) : (
                        <span className="text-th-text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <SlaBadge ticket={t} />
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusBadgeClass(t.status)}>
                        {t.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[10px] text-th-text-muted">
                      {formatRelative(t.updatedAt, new Date())}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}

function buildWhere(
  sp: Awaited<SearchParams>,
  userId: string,
): Prisma.TH_TicketWhereInput {
  const where: Prisma.TH_TicketWhereInput = { deletedAt: null }

  if (sp.view === 'mine') {
    where.assignedToId = userId
    where.status = { notIn: ['CLOSED', 'CANCELLED'] }
  } else if (sp.view === 'unassigned') {
    where.assignedToId = null
    where.status = { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] }
  } else if (sp.view === 'sla-risk') {
    where.status = { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] }
    where.slaResolveDue = { not: null }
    where.slaPausedAt = null
    // Server-side we approximate "at risk" as breached OR due within 24hr.
    // Exact 50%/90% thresholds are re-evaluated per-row in the view.
    where.OR = [
      { slaBreached: true },
      { slaResolveDue: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
    ]
  } else if (sp.view === 'recent') {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    where.updatedAt = { gte: twoDaysAgo }
  } else {
    // Default: hide closed/cancelled unless explicitly filtered
    if (!sp.status) where.status = { notIn: ['CLOSED', 'CANCELLED'] }
  }

  if (sp.status) {
    where.status = sp.status as Prisma.TH_TicketWhereInput['status']
  }
  if (sp.priority) {
    where.priority = sp.priority as Prisma.TH_TicketWhereInput['priority']
  }
  if (sp.assigneeId) {
    where.assignedToId = sp.assigneeId === 'none' ? null : sp.assigneeId
  }
  if (sp.q) {
    where.OR = [
      { title: { contains: sp.q, mode: 'insensitive' } },
      { description: { contains: sp.q, mode: 'insensitive' } },
    ]
  }
  if (sp.tag) {
    where.tags = { some: { tag: sp.tag } }
  }

  return where
}

function statusBadgeClass(status: string): string {
  return `badge-status-${status.toLowerCase().replace(/_/g, '-')}`
}

function priorityBorderClass(priority: string): string {
  switch (priority) {
    case 'URGENT':
      return 'bg-priority-urgent'
    case 'HIGH':
      return 'bg-priority-high'
    case 'MEDIUM':
      return 'bg-priority-medium'
    case 'LOW':
      return 'bg-priority-low'
    default:
      return 'bg-th-border'
  }
}

function formatRelative(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  return `${w}w`
}
