import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'

/**
 * GET /api/reminders?status=ACTIVE&source=MANUAL&clientId=xxx&contactId=xxx
 * POST /api/reminders — create a manual reminder
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const source = url.searchParams.get('source')
  const clientId = url.searchParams.get('clientId')
  const contactId = url.searchParams.get('contactId')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (source) where.source = source
  if (contactId) where.contactId = contactId
  if (clientId) where.contact = { clientId }

  const reminders = await prisma.tH_Reminder.findMany({
    where,
    orderBy: { nextNotifyAt: 'asc' },
    take: 200,
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          client: { select: { id: true, name: true, shortCode: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ data: reminders })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    contactId?: string
    title?: string
    body?: string
    actionUrl?: string
    recurrence?: string
    dueDate?: string
    nextNotifyAt?: string
  }

  if (!body.contactId || !body.title?.trim()) {
    return NextResponse.json(
      { error: 'contactId and title are required' },
      { status: 400 },
    )
  }

  const contact = await prisma.tH_Contact.findUnique({
    where: { id: body.contactId },
    select: { id: true },
  })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const recurrence = ['ONCE', 'DAILY', 'EVERY_3_DAYS', 'WEEKLY'].includes(
    body.recurrence ?? '',
  )
    ? (body.recurrence as 'ONCE' | 'DAILY' | 'EVERY_3_DAYS' | 'WEEKLY')
    : 'EVERY_3_DAYS'

  const reminder = await prisma.tH_Reminder.create({
    data: {
      contactId: body.contactId,
      createdById: session.user.id,
      source: 'MANUAL',
      title: body.title.trim(),
      body: body.body?.trim() || null,
      actionUrl: body.actionUrl?.trim() || null,
      recurrence,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      nextNotifyAt: body.nextNotifyAt
        ? new Date(body.nextNotifyAt)
        : new Date(),
    },
  })

  return NextResponse.json({ data: reminder }, { status: 201 })
}
