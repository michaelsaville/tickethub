import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { SlaBadge } from '@/app/components/SlaBadge'
import { SwipeTicketRow } from './SwipeTicketRow'
import { AiSearch } from './AiSearch'
import { TicketListClient } from './TicketListClient'
import { BulkTicketTable } from './BulkTicketTable'
import { getTicketViews } from '@/app/lib/actions/ticket-views'
import type { ViewFilters, ViewSort } from '@/app/lib/actions/ticket-views'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{
  viewId?: string
  // Legacy view= param for backwards compat
  view?: 'mine' | 'unassigned' | 'sla-risk' | 'recent'
  status?: string
  priority?: string
  assigneeId?: string
  clientId?: string
  type?: string
  tag?: string
  q?: string
  dateField?: string
  dateFrom?: string
  dateTo?: string
  showSubtickets?: string
  parentId?: string
}>

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const userId = session!.user.id
  const sp = await searchParams

  // Load views + user preference
  const { views, defaultViewId } = await getTicketViews()

  // Determine active view
  let activeViewId = sp.viewId ?? null

  // Legacy view= param: map to system view
  if (!activeViewId && sp.view) {
    const legacyMap: Record<string, string> = {
      mine: 'My Open Tickets',
      unassigned: 'Unassigned',
      'sla-risk': 'SLA At Risk',
      recent: 'Recently Updated',
    }
    const name = legacyMap[sp.view]
    if (name) {
      const match = views.find((v) => v.visibility === 'SYSTEM' && v.name === name)
      if (match) activeViewId = match.id
    }
  }

  // If no view selected, use default or first system view
  if (!activeViewId) {
    activeViewId = defaultViewId ?? views.find((v) => v.visibility === 'SYSTEM')?.id ?? null
  }

  // Build effective filters: view base + URL overrides
  const activeView = views.find((v) => v.id === activeViewId)
  const viewFilters: ViewFilters = activeView
    ? (activeView.filters as unknown as ViewFilters)
    : {}

  // Apply URL overrides
  const effectiveFilters: ViewFilters = { ...viewFilters }
  if (sp.status) effectiveFilters.status = [sp.status]
  if (sp.priority) effectiveFilters.priority = [sp.priority]
  if (sp.assigneeId) effectiveFilters.assigneeId = sp.assigneeId
  if (sp.clientId) effectiveFilters.clientId = sp.clientId
  if (sp.type) effectiveFilters.type = [sp.type]
  if (sp.tag) effectiveFilters.tag = sp.tag
  if (sp.q) effectiveFilters.q = sp.q
  if (sp.dateField) effectiveFilters.dateField = sp.dateField as ViewFilters['dateField']
  if (sp.dateFrom) effectiveFilters.dateFrom = sp.dateFrom
  if (sp.dateTo) effectiveFilters.dateTo = sp.dateTo

  // Build Prisma where from effective filters
  const { where, orderBy } = buildQuery(effectiveFilters, activeView?.sort as ViewSort | null, userId)

  // Hide sub-tickets by default — flatten projects so the main list isn't
  // cluttered. Toggle with ?showSubtickets=1 (also kept on when filtering
  // by an explicit parent via ?parentId=).
  const showSub = sp.showSubtickets === '1' || !!sp.parentId
  if (!showSub) {
    where.parentId = null
  } else if (sp.parentId) {
    where.parentId = sp.parentId
  }

  const [tickets, users, clients] = await Promise.all([
    prisma.tH_Ticket.findMany({
      where,
      orderBy,
      take: 200,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        type: true,
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
    prisma.tH_Client.findMany({
      where: { isActive: true },
      select: { id: true, name: true, shortCode: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const title = activeView?.name ?? 'All Tickets'

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
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

      <div className="space-y-3">
        <TicketListClient
          views={views}
          defaultViewId={defaultViewId}
          activeViewId={activeViewId}
          users={users}
          clients={clients}
          currentUserId={userId}
        />
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

        {/* Desktop: dense table with bulk selection (hidden below md inside the component) */}
        <div className="mt-6 hidden md:block pb-20">
          <BulkTicketTable tickets={tickets} techs={users} />
        </div>
        </>
      )}
    </div>
  )
}

// ─── Query builder from ViewFilters ──────────────────────────────────────

function buildQuery(
  filters: ViewFilters,
  sort: ViewSort | null,
  userId: string,
): {
  where: Prisma.TH_TicketWhereInput
  orderBy: Prisma.TH_TicketOrderByWithRelationInput[]
} {
  const where: Prisma.TH_TicketWhereInput = { deletedAt: null }

  // Status
  if (filters.status?.length) {
    if (filters.status.length === 1) {
      where.status = filters.status[0] as any
    } else {
      where.status = { in: filters.status as any }
    }
  }

  // Priority
  if (filters.priority?.length) {
    if (filters.priority.length === 1) {
      where.priority = filters.priority[0] as any
    } else {
      where.priority = { in: filters.priority as any }
    }
  }

  // Assignee
  if (filters.assigneeId) {
    if (filters.assigneeId === '__me__') {
      where.assignedToId = userId
    } else if (filters.assigneeId === 'none') {
      where.assignedToId = null
    } else {
      where.assignedToId = filters.assigneeId
    }
  }

  // Client
  if (filters.clientId) {
    where.clientId = filters.clientId
  }

  // Type
  if (filters.type?.length) {
    if (filters.type.length === 1) {
      where.type = filters.type[0] as any
    } else {
      where.type = { in: filters.type as any }
    }
  }

  // Tag
  if (filters.tag) {
    where.tags = { some: { tag: { equals: filters.tag, mode: 'insensitive' } } }
  }

  // Text search
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
    ]
  }

  // SLA at risk
  if (filters.slaAtRisk) {
    where.slaResolveDue = { not: null }
    where.slaPausedAt = null
    where.AND = [
      {
        OR: [
          { slaBreached: true },
          { slaResolveDue: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
        ],
      },
    ]
  }

  // Date range
  if (filters.dateField && (filters.dateFrom || filters.dateTo)) {
    const dateWhere: any = {}
    if (filters.dateFrom) dateWhere.gte = new Date(filters.dateFrom)
    if (filters.dateTo) {
      const to = new Date(filters.dateTo)
      to.setHours(23, 59, 59, 999)
      dateWhere.lte = to
    }
    ;(where as any)[filters.dateField] = dateWhere
  }

  // Sort
  const orderBy: Prisma.TH_TicketOrderByWithRelationInput[] = []
  if (sort?.field) {
    orderBy.push({ [sort.field]: sort.direction })
  }
  // Always add secondary sort
  if (!sort || sort.field !== 'priority') {
    orderBy.push({ priority: 'asc' })
  }
  if (!sort || sort.field !== 'updatedAt') {
    orderBy.push({ updatedAt: 'desc' })
  }

  return { where, orderBy }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

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
