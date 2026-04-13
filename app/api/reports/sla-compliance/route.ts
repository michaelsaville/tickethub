import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth('TICKETHUB_ADMIN')
  if (error) return error

  const url = new URL(req.url)
  const startStr = url.searchParams.get('start')
  const endStr = url.searchParams.get('end')

  if (!startStr || !endStr) {
    return NextResponse.json(
      { error: 'start and end query params required' },
      { status: 400 },
    )
  }

  const start = new Date(`${startStr}T00:00:00`)
  const end = new Date(`${endStr}T23:59:59.999`)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const now = new Date()

  const baseWhere = {
    createdAt: { gte: start, lte: end },
    deletedAt: null,
  }

  // Overall counts
  const [total, breached, atRisk] = await Promise.all([
    prisma.tH_Ticket.count({ where: baseWhere }),
    prisma.tH_Ticket.count({ where: { ...baseWhere, slaBreached: true } }),
    prisma.tH_Ticket.count({
      where: {
        ...baseWhere,
        slaBreached: false,
        slaResolveDue: { not: null, lte: now },
        closedAt: null,
      },
    }),
  ])

  const met = total - breached

  // By priority
  const byPriorityRaw = await prisma.tH_Ticket.groupBy({
    by: ['priority'],
    where: baseWhere,
    _count: { id: true },
  })

  const byPriorityBreached = await prisma.tH_Ticket.groupBy({
    by: ['priority'],
    where: { ...baseWhere, slaBreached: true },
    _count: { id: true },
  })

  const breachedMap = new Map(
    byPriorityBreached.map((r) => [r.priority, r._count.id]),
  )

  const byPriority = byPriorityRaw.map((r) => ({
    priority: r.priority,
    total: r._count.id,
    breached: breachedMap.get(r.priority) ?? 0,
    breachRate:
      r._count.id > 0
        ? Math.round(
            ((breachedMap.get(r.priority) ?? 0) / r._count.id) * 10000,
          ) / 100
        : 0,
  }))

  // Sort by priority order
  const priorityOrder = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']
  byPriority.sort(
    (a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority),
  )

  // By client — get all tickets with client info
  const byClientRaw = await prisma.tH_Ticket.groupBy({
    by: ['clientId'],
    where: baseWhere,
    _count: { id: true },
  })

  const byClientBreached = await prisma.tH_Ticket.groupBy({
    by: ['clientId'],
    where: { ...baseWhere, slaBreached: true },
    _count: { id: true },
  })

  const clientBreachedMap = new Map(
    byClientBreached.map((r) => [r.clientId, r._count.id]),
  )

  // Fetch client names
  const clientIds = byClientRaw.map((r) => r.clientId)
  const clients = await prisma.tH_Client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true, name: true, shortCode: true },
  })
  const clientMap = new Map(clients.map((c) => [c.id, c]))

  const byClient = byClientRaw
    .map((r) => {
      const client = clientMap.get(r.clientId)
      const b = clientBreachedMap.get(r.clientId) ?? 0
      return {
        clientId: r.clientId,
        clientName: client?.name ?? 'Unknown',
        clientShortCode: client?.shortCode ?? null,
        total: r._count.id,
        breached: b,
        breachRate:
          r._count.id > 0 ? Math.round((b / r._count.id) * 10000) / 100 : 0,
      }
    })
    .sort((a, b) => b.breachRate - a.breachRate || b.total - a.total)
    .slice(0, 20)

  return NextResponse.json({
    data: {
      overall: { total, met, breached, atRisk },
      byPriority,
      byClient,
    },
  })
}
