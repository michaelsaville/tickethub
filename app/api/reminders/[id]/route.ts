import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const reminder = await prisma.tH_Reminder.findUnique({
    where: { id },
    include: {
      contact: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          client: { select: { name: true } },
        },
      },
      createdBy: { select: { name: true } },
      deliveries: { orderBy: { sentAt: 'desc' }, take: 10 },
    },
  })

  if (!reminder) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: reminder })
}

/**
 * PATCH /api/reminders/[id]
 * Body: { action: 'snooze' | 'acknowledge' | 'cancel' | 'edit', ...fields }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as {
    action?: string
    snoozeDays?: number
    title?: string
    body?: string
    actionUrl?: string
    recurrence?: string
  }

  const existing = await prisma.tH_Reminder.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const now = new Date()

  if (body.action === 'snooze') {
    const days = body.snoozeDays ?? 3
    const snoozedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    const updated = await prisma.tH_Reminder.update({
      where: { id },
      data: {
        status: 'SNOOZED',
        snoozedUntil,
        nextNotifyAt: snoozedUntil,
      },
    })
    return NextResponse.json({ data: updated })
  }

  if (body.action === 'acknowledge') {
    const updated = await prisma.tH_Reminder.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: now },
    })
    return NextResponse.json({ data: updated })
  }

  if (body.action === 'cancel') {
    const updated = await prisma.tH_Reminder.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: now },
    })
    return NextResponse.json({ data: updated })
  }

  // Edit fields
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.body !== undefined) data.body = body.body.trim() || null
  if (body.actionUrl !== undefined) data.actionUrl = body.actionUrl.trim() || null
  if (body.recurrence !== undefined) {
    if (['ONCE', 'DAILY', 'EVERY_3_DAYS', 'WEEKLY'].includes(body.recurrence)) {
      data.recurrence = body.recurrence
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updated = await prisma.tH_Reminder.update({ where: { id }, data })
  return NextResponse.json({ data: updated })
}
