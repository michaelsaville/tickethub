import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'

/**
 * GET /api/location/stops?date=2026-04-12&userId=xxx
 *
 * Returns stopping points for a user on a given day.
 * If userId is omitted, returns for the current user.
 * Admins can query other users.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dateStr = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const userId = url.searchParams.get('userId') ?? session.user.id

  // Non-admins can only see their own stops
  if (userId !== session.user.id) {
    const role = session.user.role
    if (role !== 'GLOBAL_ADMIN' && role !== 'TICKETHUB_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const dayStart = new Date(`${dateStr}T00:00:00`)
  const dayEnd = new Date(`${dateStr}T23:59:59.999`)

  if (isNaN(dayStart.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const stops = await prisma.tH_StoppingPoint.findMany({
    where: {
      userId,
      arrivedAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { arrivedAt: 'asc' },
    include: {
      nearestSite: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          client: { select: { id: true, name: true, shortCode: true } },
        },
      },
    },
  })

  return NextResponse.json({
    data: {
      date: dateStr,
      userId,
      stops: stops.map((s) => ({
        id: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
        arrivedAt: s.arrivedAt,
        departedAt: s.departedAt,
        durationMinutes: s.durationMinutes,
        nearestSite: s.nearestSite
          ? {
              id: s.nearestSite.id,
              name: s.nearestSite.name,
              address: s.nearestSite.address,
              city: s.nearestSite.city,
              state: s.nearestSite.state,
              client: s.nearestSite.client,
            }
          : null,
        distanceMeters: s.distanceMeters,
        ticketCreated: s.ticketCreated,
        ticketId: s.ticketId,
      })),
    },
  })
}
