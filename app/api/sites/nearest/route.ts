import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'
import { haversineMeters, SITE_MATCH_RADIUS_M } from '@/app/lib/geo'

/**
 * GET /api/sites/nearest?lat=X&lng=Y&radius=300
 *
 * Returns the closest client site within radius (default 200m).
 * Used by the mobile ticket creation flow to auto-select client/site.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const lat = parseFloat(url.searchParams.get('lat') ?? '')
  const lng = parseFloat(url.searchParams.get('lng') ?? '')
  const radius = parseFloat(url.searchParams.get('radius') ?? '') || SITE_MATCH_RADIUS_M

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'lat and lng are required' },
      { status: 400 },
    )
  }

  // Fetch all sites that have coordinates
  const sites = await prisma.tH_Site.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      clientId: true,
      client: { select: { id: true, name: true, shortCode: true } },
    },
  })

  let closest: (typeof sites)[number] | null = null
  let closestDistance = Infinity

  for (const site of sites) {
    const d = haversineMeters(lat, lng, site.latitude!, site.longitude!)
    if (d < closestDistance && d <= radius) {
      closest = site
      closestDistance = d
    }
  }

  if (!closest) {
    return NextResponse.json({ data: null })
  }

  return NextResponse.json({
    data: {
      site: {
        id: closest.id,
        name: closest.name,
        address: closest.address,
        city: closest.city,
        state: closest.state,
      },
      client: closest.client,
      distanceMeters: Math.round(closestDistance),
    },
  })
}
