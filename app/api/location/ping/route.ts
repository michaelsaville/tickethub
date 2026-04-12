import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'
import {
  haversineMeters,
  STOP_CLUSTER_RADIUS_M,
  MIN_STOP_MINUTES,
  SITE_MATCH_RADIUS_M,
} from '@/app/lib/geo'

/**
 * POST /api/location/ping
 * Body: { latitude, longitude, accuracy? }
 *
 * Records a GPS ping for the current user. Manages stopping-point
 * detection: if the tech has been within STOP_CLUSTER_RADIUS_M of
 * a position for MIN_STOP_MINUTES+, a TH_StoppingPoint is created
 * or extended.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    latitude?: number
    longitude?: number
    accuracy?: number
  }

  const lat = body.latitude
  const lng = body.longitude
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return NextResponse.json(
      { error: 'latitude and longitude required' },
      { status: 400 },
    )
  }

  const userId = session.user.id
  const now = new Date()

  // Record the ping
  await prisma.tH_LocationPing.create({
    data: {
      userId,
      latitude: lat,
      longitude: lng,
      accuracy: body.accuracy ?? null,
    },
  })

  // Stopping-point detection:
  // Find the user's current open stop (no departedAt)
  const openStop = await prisma.tH_StoppingPoint.findFirst({
    where: { userId, departedAt: null },
    orderBy: { arrivedAt: 'desc' },
  })

  if (openStop) {
    const dist = haversineMeters(lat, lng, openStop.latitude, openStop.longitude)
    if (dist <= STOP_CLUSTER_RADIUS_M) {
      // Still at the same stop — update duration
      const durationMinutes = Math.round(
        (now.getTime() - openStop.arrivedAt.getTime()) / 60_000,
      )
      await prisma.tH_StoppingPoint.update({
        where: { id: openStop.id },
        data: { durationMinutes },
      })
      return NextResponse.json({ data: { action: 'extended', stopId: openStop.id } })
    } else {
      // Left the previous stop — close it
      const durationMinutes = Math.round(
        (now.getTime() - openStop.arrivedAt.getTime()) / 60_000,
      )
      await prisma.tH_StoppingPoint.update({
        where: { id: openStop.id },
        data: { departedAt: now, durationMinutes },
      })
    }
  }

  // Check recent pings — have we been near this location for MIN_STOP_MINUTES?
  const lookbackMs = MIN_STOP_MINUTES * 60_000
  const recentPings = await prisma.tH_LocationPing.findMany({
    where: {
      userId,
      createdAt: { gte: new Date(now.getTime() - lookbackMs) },
    },
    orderBy: { createdAt: 'asc' },
    select: { latitude: true, longitude: true, createdAt: true },
  })

  // Check if all recent pings are within the cluster radius of current position
  const allNear =
    recentPings.length >= 2 &&
    recentPings.every(
      (p) => haversineMeters(lat, lng, p.latitude, p.longitude) <= STOP_CLUSTER_RADIUS_M,
    )

  if (allNear) {
    const arrivedAt = recentPings[0].createdAt

    // Find nearest site
    const sites = await prisma.tH_Site.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: { id: true, latitude: true, longitude: true },
    })

    let nearestSiteId: string | null = null
    let distanceMeters: number | null = null
    for (const site of sites) {
      const d = haversineMeters(lat, lng, site.latitude!, site.longitude!)
      if (d <= SITE_MATCH_RADIUS_M && (distanceMeters === null || d < distanceMeters)) {
        nearestSiteId = site.id
        distanceMeters = Math.round(d)
      }
    }

    // Check if a ticket was created near this site today
    let ticketCreated = false
    let ticketId: string | null = null
    if (nearestSiteId) {
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)
      const recentTicket = await prisma.tH_Ticket.findFirst({
        where: {
          siteId: nearestSiteId,
          createdById: userId,
          createdAt: { gte: todayStart },
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      })
      if (recentTicket) {
        ticketCreated = true
        ticketId = recentTicket.id
      }
    }

    const stop = await prisma.tH_StoppingPoint.create({
      data: {
        userId,
        latitude: lat,
        longitude: lng,
        arrivedAt,
        durationMinutes: Math.round(
          (now.getTime() - arrivedAt.getTime()) / 60_000,
        ),
        nearestSiteId,
        distanceMeters,
        ticketCreated,
        ticketId,
      },
    })

    return NextResponse.json({ data: { action: 'created', stopId: stop.id } })
  }

  return NextResponse.json({ data: { action: 'recorded' } })
}
