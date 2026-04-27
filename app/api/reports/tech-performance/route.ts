import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

/**
 * GET /api/reports/tech-performance?start=2026-03-01&end=2026-04-01
 *
 * Returns per-tech metrics: tickets closed, avg resolution hours, labor minutes.
 * Admin only.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  // Tickets closed per tech with resolution time
  const closedTickets = await prisma.tH_Ticket.findMany({
    where: {
      closedAt: { gte: start, lte: end },
      assignedToId: { not: null },
    },
    select: {
      assignedToId: true,
      createdAt: true,
      closedAt: true,
    },
  })

  // Labor charges per tech in range
  const laborCharges = await prisma.tH_Charge.findMany({
    where: {
      type: 'LABOR',
      workDate: { gte: start, lte: end },
      technicianId: { not: null },
      deletedAt: null,
    },
    select: {
      technicianId: true,
      timeChargedMinutes: true,
    },
  })

  // All active techs for name lookup
  const users = await prisma.tH_User.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  // Aggregate tickets closed per tech
  const techTickets = new Map<
    string,
    { count: number; totalResolutionMs: number }
  >()
  for (const t of closedTickets) {
    const techId = t.assignedToId!
    const existing = techTickets.get(techId) ?? {
      count: 0,
      totalResolutionMs: 0,
    }
    existing.count += 1
    if (t.closedAt && t.createdAt) {
      existing.totalResolutionMs +=
        new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()
    }
    techTickets.set(techId, existing)
  }

  // Aggregate labor minutes per tech
  const techLabor = new Map<string, number>()
  for (const c of laborCharges) {
    const techId = c.technicianId!
    techLabor.set(techId, (techLabor.get(techId) ?? 0) + (c.timeChargedMinutes ?? 0))
  }

  // Combine all tech IDs that appear in either dataset
  const allTechIds = new Set([...techTickets.keys(), ...techLabor.keys()])

  const techs = Array.from(allTechIds)
    .map((id) => {
      const tickets = techTickets.get(id)
      const ticketsClosed = tickets?.count ?? 0
      const avgResolutionHours =
        ticketsClosed > 0
          ? Math.round(
              (tickets!.totalResolutionMs / ticketsClosed / 1000 / 3600) * 10,
            ) / 10
          : 0
      const laborMinutes = techLabor.get(id) ?? 0

      return {
        id,
        name: userMap.get(id) ?? 'Unknown',
        ticketsClosed,
        avgResolutionHours,
        laborMinutes,
      }
    })
    .sort((a, b) => b.ticketsClosed - a.ticketsClosed)

  return NextResponse.json({ data: { techs } })
}
