'use server'

import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { revalidatePath } from 'next/cache'

// ─── Types ───────────────────────────────────────────────────────────────

export type ViewFilters = {
  status?: string[]
  priority?: string[]
  assigneeId?: string       // user id, "none", or "__me__" (resolved at query time)
  clientId?: string
  type?: string[]
  tag?: string
  q?: string
  slaAtRisk?: boolean
  dateField?: 'createdAt' | 'updatedAt' | 'closedAt'
  dateFrom?: string         // ISO date
  dateTo?: string           // ISO date
}

export type ViewSort = {
  field: string
  direction: 'asc' | 'desc'
}

// ─── System view definitions (seeded on first load) ──────────────────────

const SYSTEM_VIEWS = [
  {
    name: 'My Open Tickets',
    icon: 'user',
    filters: {
      assigneeId: '__me__',
      status: ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_THIRD_PARTY'],
    } as ViewFilters,
    sort: { field: 'priority', direction: 'asc' } as ViewSort,
    displayOrder: 0,
  },
  {
    name: 'Unassigned',
    icon: 'inbox',
    filters: {
      assigneeId: 'none',
      status: ['NEW', 'OPEN', 'IN_PROGRESS'],
    } as ViewFilters,
    sort: { field: 'createdAt', direction: 'desc' } as ViewSort,
    displayOrder: 1,
  },
  {
    name: 'All Active',
    icon: 'list',
    filters: {
      status: ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_THIRD_PARTY'],
    } as ViewFilters,
    sort: { field: 'priority', direction: 'asc' } as ViewSort,
    displayOrder: 2,
  },
  {
    name: 'SLA At Risk',
    icon: 'alert',
    filters: {
      slaAtRisk: true,
      status: ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_THIRD_PARTY'],
    } as ViewFilters,
    sort: { field: 'slaResolveDue', direction: 'asc' } as ViewSort,
    displayOrder: 3,
  },
  {
    name: 'Recently Updated',
    icon: 'clock',
    filters: {
      status: ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_THIRD_PARTY', 'RESOLVED'],
    } as ViewFilters,
    sort: { field: 'updatedAt', direction: 'desc' } as ViewSort,
    displayOrder: 4,
  },
  {
    name: 'Resolved / Closed',
    icon: 'check',
    filters: {
      status: ['RESOLVED', 'CLOSED'],
    } as ViewFilters,
    sort: { field: 'updatedAt', direction: 'desc' } as ViewSort,
    displayOrder: 5,
  },
]

// ─── Ensure system views exist (idempotent) ──────────────────────────────

export async function ensureSystemViews() {
  const existing = await prisma.tH_TicketView.findMany({
    where: { visibility: 'SYSTEM' },
    select: { name: true },
  })
  const existingNames = new Set(existing.map((v) => v.name))

  for (const sv of SYSTEM_VIEWS) {
    if (existingNames.has(sv.name)) continue
    await prisma.tH_TicketView.create({
      data: {
        name: sv.name,
        filters: sv.filters as any,
        sort: sv.sort as any,
        visibility: 'SYSTEM',
        icon: sv.icon,
        displayOrder: sv.displayOrder,
        userId: null,
      },
    })
  }
}

// ─── Fetch all views for the current user ────────────────────────────────

export type TicketViewRow = {
  id: string
  name: string
  filters: ViewFilters
  sort: ViewSort | null
  visibility: 'PERSONAL' | 'SHARED' | 'SYSTEM'
  icon: string | null
  displayOrder: number
}

export async function getTicketViews(): Promise<{
  views: TicketViewRow[]
  defaultViewId: string | null
}> {
  const { session, error } = await requireAuth()
  if (error) return { views: [], defaultViewId: null }

  const userId = session!.user.id

  // Seed system views if needed (fast no-op after first run)
  await ensureSystemViews()

  const [views, pref] = await Promise.all([
    prisma.tH_TicketView.findMany({
      where: {
        OR: [
          { visibility: 'SYSTEM' },
          { visibility: 'SHARED' },
          { userId },
        ],
      },
      orderBy: [{ visibility: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.tH_UserViewPreference.findUnique({
      where: { userId },
    }),
  ])

  return {
    views: views.map((v) => ({
      id: v.id,
      name: v.name,
      filters: v.filters as unknown as ViewFilters,
      sort: v.sort as unknown as ViewSort | null,
      visibility: v.visibility,
      icon: v.icon,
      displayOrder: v.displayOrder,
    })),
    defaultViewId: pref?.defaultViewId ?? null,
  }
}

// ─── Create a new personal view ──────────────────────────────────────────

export async function createTicketView(data: {
  name: string
  filters: ViewFilters
  sort?: ViewSort
  visibility?: 'PERSONAL' | 'SHARED'
}) {
  const { session, error } = await requireAuth()
  if (error) throw new Error('Not authenticated')

  const maxOrder = await prisma.tH_TicketView.aggregate({
    where: { userId: session!.user.id },
    _max: { displayOrder: true },
  })

  const view = await prisma.tH_TicketView.create({
    data: {
      name: data.name,
      filters: data.filters as any,
      sort: (data.sort as any) ?? null,
      visibility: data.visibility ?? 'PERSONAL',
      userId: session!.user.id,
      displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
    },
  })

  revalidatePath('/tickets')
  return view
}

// ─── Update a view ───────────────────────────────────────────────────────

export async function updateTicketView(
  viewId: string,
  data: {
    name?: string
    filters?: ViewFilters
    sort?: ViewSort
  },
) {
  const { session, error } = await requireAuth()
  if (error) throw new Error('Not authenticated')

  const view = await prisma.tH_TicketView.findUnique({ where: { id: viewId } })
  if (!view) throw new Error('View not found')
  if (view.visibility === 'SYSTEM') throw new Error('Cannot edit system views')
  if (view.userId !== session!.user.id) throw new Error('Not your view')

  const updated = await prisma.tH_TicketView.update({
    where: { id: viewId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.filters !== undefined && { filters: data.filters as any }),
      ...(data.sort !== undefined && { sort: data.sort as any }),
    },
  })

  revalidatePath('/tickets')
  return updated
}

// ─── Delete a view ───────────────────────────────────────────────────────

export async function deleteTicketView(viewId: string) {
  const { session, error } = await requireAuth()
  if (error) throw new Error('Not authenticated')

  const view = await prisma.tH_TicketView.findUnique({ where: { id: viewId } })
  if (!view) throw new Error('View not found')
  if (view.visibility === 'SYSTEM') throw new Error('Cannot delete system views')
  if (view.userId !== session!.user.id) throw new Error('Not your view')

  await prisma.tH_TicketView.delete({ where: { id: viewId } })

  // If this was the user's default, clear the preference
  await prisma.tH_UserViewPreference.deleteMany({
    where: { userId: session!.user.id, defaultViewId: viewId },
  })

  revalidatePath('/tickets')
}

// ─── Set default view ────────────────────────────────────────────────────

export async function setDefaultView(viewId: string) {
  const { session, error } = await requireAuth()
  if (error) throw new Error('Not authenticated')

  await prisma.tH_UserViewPreference.upsert({
    where: { userId: session!.user.id },
    create: {
      userId: session!.user.id,
      defaultViewId: viewId,
    },
    update: {
      defaultViewId: viewId,
    },
  })

  revalidatePath('/tickets')
}
