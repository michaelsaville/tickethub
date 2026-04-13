import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = req.nextUrl
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const granularity = url.searchParams.get('granularity') === 'monthly' ? 'month' : 'week'

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 })
  }

  const startDate = new Date(start)
  const endDate = new Date(end)
  // Push end to end of day
  endDate.setHours(23, 59, 59, 999)

  try {
    // Tickets created per period
    // granularity is 'week' | 'month' (validated above) — safe to interpolate
    const created = await prisma.$queryRawUnsafe<
      { period: Date; count: bigint }[]
    >(
      `SELECT DATE_TRUNC('${granularity}', "createdAt") AS period,
              COUNT(*)::bigint AS count
         FROM tickethub.th_tickets
        WHERE "deletedAt" IS NULL
          AND "createdAt" >= $1
          AND "createdAt" <= $2
        GROUP BY period
        ORDER BY period`,
      startDate,
      endDate,
    )

    // Tickets closed per period
    const closed = await prisma.$queryRawUnsafe<
      { period: Date; count: bigint }[]
    >(
      `SELECT DATE_TRUNC('${granularity}', "closedAt") AS period,
              COUNT(*)::bigint AS count
         FROM tickethub.th_tickets
        WHERE "deletedAt" IS NULL
          AND "closedAt" IS NOT NULL
          AND "closedAt" >= $1
          AND "closedAt" <= $2
        GROUP BY period
        ORDER BY period`,
      startDate,
      endDate,
    )

    // Average first response time (hours)
    // First non-internal comment not by the ticket creator
    const avgResponse = await prisma.$queryRaw<
      { avg_hours: number | null }[]
    >`
      SELECT AVG(response_hours) AS avg_hours
        FROM (
          SELECT EXTRACT(EPOCH FROM (fc."createdAt" - t."createdAt")) / 3600.0 AS response_hours
            FROM tickethub.th_tickets t
           INNER JOIN LATERAL (
              SELECT c."createdAt"
                FROM tickethub.th_ticket_comments c
               WHERE c."ticketId" = t.id
                 AND c."isInternal" = false
                 AND c."authorId" != t."createdById"
               ORDER BY c."createdAt" ASC
               LIMIT 1
           ) fc ON true
           WHERE t."deletedAt" IS NULL
             AND t."createdAt" >= ${startDate}
             AND t."createdAt" <= ${endDate}
        ) sub
    `

    // Merge created and closed into a unified period list
    const periodMap = new Map<string, { created: number; closed: number }>()

    for (const row of created) {
      const key = row.period.toISOString()
      const entry = periodMap.get(key) || { created: 0, closed: 0 }
      entry.created = Number(row.count)
      periodMap.set(key, entry)
    }

    for (const row of closed) {
      const key = row.period.toISOString()
      const entry = periodMap.get(key) || { created: 0, closed: 0 }
      entry.closed = Number(row.count)
      periodMap.set(key, entry)
    }

    const periods = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({
        period,
        created: data.created,
        closed: data.closed,
      }))

    const avgHours = avgResponse[0]?.avg_hours
    const avgFirstResponseHours =
      avgHours !== null && avgHours !== undefined
        ? Math.round(avgHours * 10) / 10
        : null

    return NextResponse.json({
      data: { periods, avgFirstResponseHours },
    })
  } catch (err) {
    console.error('[volume-trends]', err)
    return NextResponse.json(
      { error: 'Failed to generate volume trends report' },
      { status: 500 },
    )
  }
}
