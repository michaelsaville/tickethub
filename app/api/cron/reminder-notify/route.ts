import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { sendReminderEmail } from '@/app/lib/reminder-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RECURRENCE_MS: Record<string, number> = {
  DAILY: 24 * 60 * 60 * 1000,
  EVERY_3_DAYS: 3 * 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace(/^Bearer\s+/i, '')
  const secret = process.env.CRON_SECRET
  if (!secret || bearer !== secret) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Find all due reminders
  const due = await prisma.tH_Reminder.findMany({
    where: {
      status: { in: ['ACTIVE', 'SNOOZED'] },
      nextNotifyAt: { lte: now },
      OR: [
        { snoozedUntil: null },
        { snoozedUntil: { lte: now } },
      ],
    },
    include: {
      contact: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          portalTokens: {
            where: { isActive: true },
            take: 1,
            select: { token: true },
          },
        },
      },
    },
  })

  const fired: Array<{ id: string; title: string; email: string | null }> = []

  for (const reminder of due) {
    const contact = reminder.contact
    if (!contact.email) {
      // No email — skip, log
      console.warn(
        `[reminder-notify] skipping reminder ${reminder.id} — contact has no email`,
      )
      continue
    }

    // Un-snooze if snoozed
    if (reminder.status === 'SNOOZED') {
      await prisma.tH_Reminder.update({
        where: { id: reminder.id },
        data: { status: 'ACTIVE', snoozedUntil: null },
      })
    }

    // Build portal URL if token exists
    const portalToken = contact.portalTokens[0]?.token
    const baseUrl = process.env.NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com'
    const portalUrl = portalToken ? `${baseUrl}/portal/${portalToken}` : null

    // Send email
    const error = await sendReminderEmail({
      toEmail: contact.email,
      toName: contact.firstName,
      title: reminder.title,
      body: reminder.body,
      actionUrl: reminder.actionUrl,
      portalUrl,
      notifyCount: reminder.notifyCount,
    })

    // Log delivery (reminder-specific audit)
    await prisma.tH_ReminderDelivery.create({
      data: {
        reminderId: reminder.id,
        channel: 'EMAIL',
        toAddress: contact.email,
        error,
      },
    })

    // Also mirror to the shared outbound log so /admin/messages sees it
    await prisma.tH_TicketEmailOutbound.create({
      data: {
        mode: 'REMINDER_NOTIFY',
        toEmail: contact.email.toLowerCase(),
        toName: `${contact.firstName} ${contact.lastName}`.trim(),
        subject: `Reminder: ${reminder.title}`,
        status: error ? 'FAILED' : 'SENT',
        errorMessage: error,
        metadata: {
          reminderId: reminder.id,
          source: reminder.source,
          recurrence: reminder.recurrence,
          notifyCount: reminder.notifyCount + 1,
        },
      },
    }).catch((e) => console.error('[reminder-notify] outbound log write failed', e))

    // Update reminder
    const intervalMs = RECURRENCE_MS[reminder.recurrence]
    if (reminder.recurrence === 'ONCE' || !intervalMs) {
      // One-time reminder — mark acknowledged after send
      await prisma.tH_Reminder.update({
        where: { id: reminder.id },
        data: {
          lastNotifiedAt: now,
          notifyCount: { increment: 1 },
          status: 'ACKNOWLEDGED',
          acknowledgedAt: now,
        },
      })
    } else {
      // Recurring — bump nextNotifyAt forward
      await prisma.tH_Reminder.update({
        where: { id: reminder.id },
        data: {
          lastNotifiedAt: now,
          notifyCount: { increment: 1 },
          nextNotifyAt: new Date(now.getTime() + intervalMs),
        },
      })
    }

    fired.push({ id: reminder.id, title: reminder.title, email: contact.email })
  }

  return NextResponse.json({
    data: { checkedAt: now.toISOString(), total: due.length, fired },
  })
}
