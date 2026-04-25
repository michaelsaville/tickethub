import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const score = Number(body.score)
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json(
      { error: 'Score must be an integer 1–5' },
      { status: 400 },
    )
  }
  const comment =
    typeof body.comment === 'string'
      ? body.comment.slice(0, 2000).trim() || null
      : null

  const survey = await prisma.tH_CsatSurvey.findUnique({
    where: { token },
    select: { id: true, ticketId: true, respondedAt: true },
  })
  if (!survey) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
  }
  if (survey.respondedAt) {
    return NextResponse.json(
      { error: 'This survey was already submitted.' },
      { status: 409 },
    )
  }

  await prisma.tH_CsatSurvey.update({
    where: { id: survey.id },
    data: { score, comment, respondedAt: new Date() },
  })

  await prisma.tH_TicketEvent.create({
    data: {
      ticketId: survey.ticketId,
      userId: null,
      type: 'CSAT_RESPONSE',
      data: { score, hasComment: !!comment },
    },
  })

  void emit({
    type: EVENT_TYPES.CSAT_RESPONSE_RECEIVED,
    entityType: 'ticket',
    entityId: survey.ticketId,
    actorId: null,
    payload: { score, hasComment: !!comment },
  })

  return NextResponse.json({ ok: true })
}
