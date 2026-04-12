import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params

  // Validate portal token
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

  // Verify reminder belongs to this contact
  const reminder = await prisma.tH_Reminder.findUnique({
    where: { id },
    select: { contactId: true, status: true },
  })

  if (!reminder || reminder.contactId !== portalToken.contactId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.tH_Reminder.update({
    where: { id },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
  })

  return NextResponse.json({ data: { ok: true } })
}
