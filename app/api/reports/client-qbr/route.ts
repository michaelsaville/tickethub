import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

export async function GET(req: NextRequest) {
  const { error } = await requireAuth('TICKETHUB_ADMIN')
  if (error) return error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  const startStr = url.searchParams.get('start')
  const endStr = url.searchParams.get('end')

  if (!clientId || !startStr || !endStr) {
    return NextResponse.json(
      { error: 'clientId, start, and end query params required' },
      { status: 400 },
    )
  }

  const start = new Date(`${startStr}T00:00:00`)
  const end = new Date(`${endStr}T23:59:59.999`)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const client = await prisma.tH_Client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, shortCode: true },
  })
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const ticketWhere = {
    clientId,
    createdAt: { gte: start, lte: end },
    deletedAt: null,
  }

  // ─── Ticket summary ──────────────────────────────────────────────────

  const [totalTickets, byStatus, byPriority, byType] = await Promise.all([
    prisma.tH_Ticket.count({ where: ticketWhere }),
    prisma.tH_Ticket.groupBy({
      by: ['status'],
      where: ticketWhere,
      _count: { id: true },
    }),
    prisma.tH_Ticket.groupBy({
      by: ['priority'],
      where: ticketWhere,
      _count: { id: true },
    }),
    prisma.tH_Ticket.groupBy({
      by: ['type'],
      where: ticketWhere,
      _count: { id: true },
    }),
  ])

  // ─── SLA compliance ──────────────────────────────────────────────────

  const slaBreached = await prisma.tH_Ticket.count({
    where: { ...ticketWhere, slaBreached: true },
  })
  const slaMet = totalTickets - slaBreached
  const slaRate = totalTickets > 0 ? Math.round((slaMet / totalTickets) * 10000) / 100 : 100

  // ─── Resolution time ─────────────────────────────────────────────────

  const resolvedTickets = await prisma.tH_Ticket.findMany({
    where: {
      ...ticketWhere,
      closedAt: { not: null },
    },
    select: { createdAt: true, closedAt: true },
  })

  let avgResolutionHours = 0
  if (resolvedTickets.length > 0) {
    const totalMs = resolvedTickets.reduce((sum, t) => {
      return sum + (t.closedAt!.getTime() - t.createdAt.getTime())
    }, 0)
    avgResolutionHours = Math.round((totalMs / resolvedTickets.length / 3_600_000) * 10) / 10
  }

  // ─── First response time ─────────────────────────────────────────────

  const ticketsWithComments = await prisma.tH_Ticket.findMany({
    where: ticketWhere,
    select: {
      createdAt: true,
      createdById: true,
      comments: {
        where: { isInternal: false },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { createdAt: true, authorId: true },
      },
    },
  })

  const responseTimes: number[] = []
  for (const t of ticketsWithComments) {
    const first = t.comments.find((c) => c.authorId !== t.createdById)
    if (first) {
      responseTimes.push(first.createdAt.getTime() - t.createdAt.getTime())
    }
  }
  const avgFirstResponseHours =
    responseTimes.length > 0
      ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 3_600_000) * 10) / 10
      : null

  // ─── Labor & billing ─────────────────────────────────────────────────

  const charges = await prisma.tH_Charge.findMany({
    where: {
      ticket: { clientId },
      workDate: { gte: start, lte: end },
    },
    select: {
      type: true,
      totalPrice: true,
      timeSpentMinutes: true,
      timeChargedMinutes: true,
      isBillable: true,
    },
  })

  let totalRevenue = 0
  let totalLaborMinutes = 0
  let totalChargedMinutes = 0
  const revenueByType: Record<string, number> = {}

  for (const c of charges) {
    if (c.isBillable) totalRevenue += c.totalPrice
    if (c.timeSpentMinutes) totalLaborMinutes += c.timeSpentMinutes
    if (c.timeChargedMinutes) totalChargedMinutes += c.timeChargedMinutes
    revenueByType[c.type] = (revenueByType[c.type] ?? 0) + c.totalPrice
  }

  // ─── Top issues (most common ticket titles, grouped) ─────────────────

  const recentTickets = await prisma.tH_Ticket.findMany({
    where: ticketWhere,
    select: {
      ticketNumber: true,
      title: true,
      priority: true,
      status: true,
      type: true,
      createdAt: true,
      closedAt: true,
      assignedTo: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Group by type for "top categories"
  const typeCountMap: Record<string, number> = {}
  for (const t of recentTickets) {
    typeCountMap[t.type] = (typeCountMap[t.type] ?? 0) + 1
  }
  const topCategories = Object.entries(typeCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }))

  // ─── Assemble response ───────────────────────────────────────────────

  return NextResponse.json({
    data: {
      client: { name: client.name, shortCode: client.shortCode },
      period: { start: startStr, end: endStr },
      tickets: {
        total: totalTickets,
        resolved: resolvedTickets.length,
        byStatus: byStatus.map((r) => ({ status: r.status, count: r._count.id })),
        byPriority: byPriority.map((r) => ({ priority: r.priority, count: r._count.id })),
        byType: byType.map((r) => ({ type: r.type, count: r._count.id })),
        topCategories,
      },
      sla: {
        total: totalTickets,
        met: slaMet,
        breached: slaBreached,
        complianceRate: slaRate,
      },
      performance: {
        avgResolutionHours,
        avgFirstResponseHours,
      },
      billing: {
        totalRevenueCents: totalRevenue,
        totalLaborMinutes,
        totalChargedMinutes,
        revenueByType,
      },
      recentTickets: recentTickets.map((t) => ({
        ticketNumber: t.ticketNumber,
        title: t.title,
        priority: t.priority,
        status: t.status,
        type: t.type,
        createdAt: t.createdAt.toISOString(),
        closedAt: t.closedAt?.toISOString() ?? null,
        assignee: t.assignedTo?.name ?? 'Unassigned',
      })),
    },
  })
}
