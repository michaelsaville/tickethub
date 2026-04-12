import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'
import { buildSearchFilter } from '@/app/lib/ai-search'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as { query?: string }
  const query = body.query?.trim()
  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  try {
    const today = new Date().toISOString().slice(0, 10)
    const filter = await buildSearchFilter(query, today)

    const tickets = await prisma.tH_Ticket.findMany({
      where: filter.where as Parameters<typeof prisma.tH_Ticket.findMany>[0] extends { where?: infer W } ? W : never,
      orderBy: (filter.orderBy as Parameters<typeof prisma.tH_Ticket.findMany>[0] extends { orderBy?: infer O } ? O : never) ?? { updatedAt: 'desc' },
      take: 50,
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
        explanation: filter.explanation,
        tickets,
        count: tickets.length,
      },
    })
  } catch (e) {
    console.error('[api/ai/search]', e)
    const message =
      e instanceof Error && e.message.includes('ANTHROPIC_API_KEY')
        ? 'AI not configured'
        : 'Search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
