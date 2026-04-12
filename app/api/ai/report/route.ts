import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import { buildReportQuery } from '@/app/lib/ai-report'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Reports are admin-only
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await req.json()) as { prompt?: string }
  const prompt = body.prompt?.trim()
  if (!prompt) {
    return NextResponse.json(
      { error: 'Prompt is required' },
      { status: 400 },
    )
  }

  try {
    const today = new Date().toISOString().slice(0, 10)
    const reportQuery = await buildReportQuery(prompt, today)

    if (reportQuery.queryType === 'summary' && reportQuery.groupBy) {
      // Summary query — group by a field and count
      const field = reportQuery.groupBy
      const validGroupFields = [
        'status',
        'priority',
        'type',
      ]

      if (validGroupFields.includes(field)) {
        const groups = await prisma.tH_Ticket.groupBy({
          by: [field as 'status' | 'priority' | 'type'],
          where: reportQuery.where as Parameters<typeof prisma.tH_Ticket.groupBy>[0] extends { where?: infer W } ? W : never,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        })

        return NextResponse.json({
          data: {
            type: 'summary',
            explanation: reportQuery.explanation,
            groupBy: field,
            groups: groups.map((g) => ({
              label: String(g[field as keyof typeof g]),
              count: g._count.id,
            })),
          },
        })
      }

      // Client/assignee grouping — use a regular query and aggregate in JS
      if (field === 'client' || field === 'assignedTo') {
        const tickets = await prisma.tH_Ticket.findMany({
          where: reportQuery.where as Parameters<typeof prisma.tH_Ticket.findMany>[0] extends { where?: infer W } ? W : never,
          select: {
            id: true,
            client: { select: { name: true } },
            assignedTo: { select: { name: true } },
          },
        })
        const counts = new Map<string, number>()
        for (const t of tickets) {
          const label =
            field === 'client'
              ? t.client.name
              : t.assignedTo?.name ?? 'Unassigned'
          counts.set(label, (counts.get(label) ?? 0) + 1)
        }
        const groups = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count }))

        return NextResponse.json({
          data: {
            type: 'summary',
            explanation: reportQuery.explanation,
            groupBy: field,
            groups,
          },
        })
      }
    }

    // Default: ticket list query
    const tickets = await prisma.tH_Ticket.findMany({
      where: reportQuery.where as Parameters<typeof prisma.tH_Ticket.findMany>[0] extends { where?: infer W } ? W : never,
      orderBy: (reportQuery.orderBy as Parameters<typeof prisma.tH_Ticket.findMany>[0] extends { orderBy?: infer O } ? O : never) ?? { updatedAt: 'desc' },
      take: reportQuery.limit,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
        slaBreached: true,
        client: { select: { name: true, shortCode: true } },
        assignedTo: { select: { name: true } },
      },
    })

    return NextResponse.json({
      data: {
        type: 'tickets',
        explanation: reportQuery.explanation,
        columns: reportQuery.columns,
        tickets,
        count: tickets.length,
      },
    })
  } catch (e) {
    console.error('[api/ai/report]', e)
    const message =
      e instanceof Error && e.message.includes('ANTHROPIC_API_KEY')
        ? 'AI not configured'
        : 'Report generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
