import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

type GroupBy = 'client' | 'contract' | 'tech'

interface RawRow {
  id: string
  name: string
  revenue: bigint | number
  labor_cost: bigint | number
  labor_minutes: bigint | number
}

interface PartsRow {
  id: string
  parts_cost: bigint | number
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(req.url)
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const groupBy = (url.searchParams.get('groupBy') || 'client') as GroupBy

  if (!start || !end) {
    return NextResponse.json(
      { error: 'start and end query params are required' },
      { status: 400 },
    )
  }

  if (!['client', 'contract', 'tech'].includes(groupBy)) {
    return NextResponse.json(
      { error: 'groupBy must be client, contract, or tech' },
      { status: 400 },
    )
  }

  const startDate = new Date(start + 'T00:00:00Z')
  const endDate = new Date(end + 'T23:59:59.999Z')

  try {
    // Build group-specific SQL fragments
    let groupCol: string
    let joinClause: string
    let nameExpr: string

    switch (groupBy) {
      case 'client':
        groupCol = 'con."clientId"'
        joinClause = `
          JOIN tickethub.th_contracts con ON c."contractId" = con.id
          JOIN tickethub.th_clients cl ON con."clientId" = cl.id`
        nameExpr = 'cl.name'
        break
      case 'contract':
        groupCol = 'c."contractId"'
        joinClause = `
          JOIN tickethub.th_contracts con ON c."contractId" = con.id`
        nameExpr = 'con.name'
        break
      case 'tech':
        groupCol = 'c."technicianId"'
        joinClause = `
          LEFT JOIN tickethub.th_users u ON c."technicianId" = u.id`
        nameExpr = `COALESCE(u.name, 'Unassigned')`
        break
      default:
        groupCol = 'con."clientId"'
        joinClause = `
          JOIN tickethub.th_contracts con ON c."contractId" = con.id
          JOIN tickethub.th_clients cl ON con."clientId" = cl.id`
        nameExpr = 'cl.name'
    }

    // Main aggregation: revenue + labor cost (per-charge hourly rate calc)
    const rows = await prisma.$queryRawUnsafe<RawRow[]>(`
      SELECT
        ${groupCol} AS id,
        ${nameExpr} AS name,
        COALESCE(SUM(c."totalPrice"), 0) AS revenue,
        COALESCE(SUM(
          CASE WHEN c.type = 'LABOR' AND c."timeChargedMinutes" IS NOT NULL
            THEN ROUND(c."timeChargedMinutes"::numeric / 60.0 * COALESCE(tech."hourlyRate", 0))
            ELSE 0
          END
        ), 0) AS labor_cost,
        COALESCE(SUM(
          CASE WHEN c.type = 'LABOR' THEN COALESCE(c."timeChargedMinutes", 0) ELSE 0 END
        ), 0) AS labor_minutes
      FROM tickethub.th_charges c
      ${joinClause}
      LEFT JOIN tickethub.th_users tech ON c."technicianId" = tech.id
      WHERE c."workDate" >= $1
        AND c."workDate" <= $2
        AND c.status IN ('BILLABLE', 'INVOICED', 'LOCKED')
        ${groupBy === 'tech' ? '' : ''}
      GROUP BY ${groupCol}, ${nameExpr}
      ORDER BY revenue DESC
    `, startDate, endDate)

    // Parts cost aggregation: sum unitCost * quantity from TH_TicketPart
    // linked via chargeId on PART-type charges
    let partsGroupCol: string
    let partsJoinClause: string

    switch (groupBy) {
      case 'client':
        partsGroupCol = 'con."clientId"'
        partsJoinClause = `
          JOIN tickethub.th_contracts con ON c."contractId" = con.id`
        break
      case 'contract':
        partsGroupCol = 'c."contractId"'
        partsJoinClause = ''
        break
      case 'tech':
        partsGroupCol = 'c."technicianId"'
        partsJoinClause = ''
        break
      default:
        partsGroupCol = 'con."clientId"'
        partsJoinClause = `
          JOIN tickethub.th_contracts con ON c."contractId" = con.id`
    }

    const partsRows = await prisma.$queryRawUnsafe<PartsRow[]>(`
      SELECT
        ${partsGroupCol} AS id,
        COALESCE(SUM(tp."unitCost" * tp.quantity), 0) AS parts_cost
      FROM tickethub.th_charges c
      JOIN tickethub.th_ticket_parts tp ON tp."chargeId" = c.id
      ${partsJoinClause}
      WHERE c."workDate" >= $1
        AND c."workDate" <= $2
        AND c.status IN ('BILLABLE', 'INVOICED', 'LOCKED')
        AND c.type = 'PART'
      GROUP BY ${partsGroupCol}
    `, startDate, endDate)

    // Merge parts cost into rows
    const partsMap = new Map<string, number>()
    for (const pr of partsRows) {
      partsMap.set(pr.id, Number(pr.parts_cost))
    }

    let totalRevenue = 0
    let totalLaborCost = 0
    let totalPartsCost = 0

    const result = rows.map((r) => {
      const revenue = Number(r.revenue)
      const laborCost = Number(r.labor_cost)
      const partsCost = partsMap.get(r.id) ?? 0
      totalRevenue += revenue
      totalLaborCost += laborCost
      totalPartsCost += partsCost
      return {
        id: r.id,
        name: r.name,
        revenue,
        laborCost,
        partsCost,
      }
    })

    return NextResponse.json({
      summary: {
        revenue: totalRevenue,
        laborCost: totalLaborCost,
        partsCost: totalPartsCost,
      },
      rows: result,
    })
  } catch (err) {
    console.error('Profitability report error:', err)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 },
    )
  }
}
