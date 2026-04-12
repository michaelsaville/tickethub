import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'
import { suggestResolution } from '@/app/lib/ai-resolution'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as { ticketId?: string }
  if (!body.ticketId) {
    return NextResponse.json(
      { error: 'ticketId is required' },
      { status: 400 },
    )
  }

  try {
    const ticket = await prisma.tH_Ticket.findUnique({
      where: { id: body.ticketId },
      select: {
        title: true,
        description: true,
        clientId: true,
      },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Find similar resolved tickets — title keyword match within the same client
    // plus global keyword match, limited to recent resolved/closed tickets
    const titleWords = ticket.title
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5)

    const similarTickets = titleWords.length
      ? await prisma.tH_Ticket.findMany({
          where: {
            deletedAt: null,
            status: { in: ['RESOLVED', 'CLOSED'] },
            OR: titleWords.map((word) => ({
              title: { contains: word, mode: 'insensitive' as const },
            })),
          },
          orderBy: { closedAt: 'desc' },
          take: 10,
          select: {
            ticketNumber: true,
            title: true,
            description: true,
            comments: {
              where: { isInternal: false },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { body: true },
            },
          },
        })
      : []

    const result = await suggestResolution({
      title: ticket.title,
      description: ticket.description,
      similarTickets: similarTickets.map((t) => ({
        ticketNumber: t.ticketNumber,
        title: t.title,
        resolution: t.comments[0]?.body ?? t.description?.slice(0, 300) ?? null,
      })),
    })

    return NextResponse.json({ data: result })
  } catch (e) {
    console.error('[api/ai/suggest-resolution]', e)
    const message =
      e instanceof Error && e.message.includes('ANTHROPIC_API_KEY')
        ? 'AI not configured'
        : 'Suggestion failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
