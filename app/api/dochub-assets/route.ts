import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

/**
 * GET /api/dochub-assets?clientName=ACME&q=desktop
 *
 * Queries DocHub's Asset table (public schema) for assets belonging to a
 * client matching the given name. Returns lightweight results for the
 * asset picker on ticket detail.
 *
 * We match by client name because TicketHub's TH_Client and DocHub's Client
 * have independent IDs but share the same human name.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const url = new URL(req.url)
  const clientName = url.searchParams.get('clientName')?.trim()
  const q = url.searchParams.get('q')?.trim() ?? ''

  if (!clientName) {
    return NextResponse.json({ data: [] })
  }

  try {
    // Raw SQL across schemas — DocHub assets are in the default (public) schema
    const searchClause = q
      ? `AND (a."name" ILIKE $2 OR a."serial" ILIKE $2 OR a."assetTag" ILIKE $2 OR a."ipAddress" ILIKE $2)`
      : ''
    const params: unknown[] = [`%${clientName}%`]
    if (q) params.push(`%${q}%`)

    const assets: {
      id: string
      name: string
      category: string
      status: string
      make: string | null
      model: string | null
      serial: string | null
      ipAddress: string | null
      locationName: string | null
      primaryUserName: string | null
    }[] = await prisma.$queryRawUnsafe(
      `SELECT
         a.id,
         a.name,
         a.category,
         a.status,
         a.make,
         a.model,
         a.serial,
         a."ipAddress",
         l.name AS "locationName",
         p.name AS "primaryUserName"
       FROM public."Asset" a
       JOIN public."Location" l ON l.id = a."locationId"
       JOIN public."Client" c ON c.id = l."clientId"
       LEFT JOIN public."Person" p ON p.id = a."personId"
       WHERE c.name ILIKE $1
         AND a.status != 'RETIRED'
         ${searchClause}
       ORDER BY a.name ASC
       LIMIT 50`,
      ...params,
    )

    return NextResponse.json({ data: assets })
  } catch (e) {
    console.error('[api/dochub-assets] query failed', e)
    return NextResponse.json({ data: [], error: 'Failed to query DocHub assets' })
  }
}
