import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params

  const portalToken = await prisma.tH_ContactPortalToken.findUnique({
    where: { token },
    select: { isActive: true, expiresAt: true, contactId: true },
  })

  if (
    !portalToken ||
    !portalToken.isActive ||
    (portalToken.expiresAt && portalToken.expiresAt < new Date())
  ) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 })
  }

  const reminder = await prisma.tH_Reminder.findUnique({
    where: { id },
    select: { contactId: true },
  })

  if (!reminder || reminder.contactId !== portalToken.contactId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const snoozedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days

  await prisma.tH_Reminder.update({
    where: { id },
    data: {
      status: 'SNOOZED',
      snoozedUntil,
      nextNotifyAt: snoozedUntil,
    },
  })

  return NextResponse.json({ data: { ok: true, snoozedUntil } })
}
