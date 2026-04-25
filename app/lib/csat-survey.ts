import 'server-only'
import { randomBytes } from 'crypto'
import { prisma } from '@/app/lib/prisma'
import { m365Configured, sendMail } from '@/app/lib/m365'

const MASTER_ENV = 'TICKETHUB_CSAT_SURVEY_ENABLED'

function masterEnabled(): boolean {
  return process.env[MASTER_ENV] === 'true'
}

function publicBase(): string {
  return process.env.NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function bodyFor(args: {
  contactFirstName: string | null
  ticketNumber: number
  ticketTitle: string
  surveyUrl: string
}): string {
  const greeting = args.contactFirstName
    ? `Hi ${escapeHtml(args.contactFirstName)},`
    : 'Hi there,'
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${args.surveyUrl}?score=${n}" style="display:inline-block;margin:0 4px;padding:8px 12px;background:#1f2937;color:#fff;text-decoration:none;border-radius:6px;font-size:18px">${'★'.repeat(n)}</a>`,
    )
    .join('')
  return `
    <p>${greeting}</p>
    <p>Your ticket <strong>#TH-${args.ticketNumber}</strong> &mdash;
       ${escapeHtml(args.ticketTitle)} &mdash; was just resolved. How did we do?</p>
    <p style="text-align:center;margin:24px 0">${stars}</p>
    <p style="text-align:center"><a href="${args.surveyUrl}">Leave a comment</a></p>
    <p style="color:#6b7280;font-size:12px;margin-top:32px">
      This is a one-time survey link. It expires when you respond.
    </p>
  `
}

/**
 * Send the CSAT survey email and create the TH_CsatSurvey row. No-op if:
 *   - master switch off
 *   - m365 not configured
 *   - client has emailClientOnTicketEvents=false
 *   - ticket has no recipient email
 *   - a survey already exists for this ticket
 *
 * Fire-and-forget. Never throws. Caller should `void sendCsatSurvey(ticketId)`.
 */
export async function sendCsatSurvey(ticketId: string): Promise<void> {
  try {
    if (!masterEnabled()) return
    if (!m365Configured()) return

    const existing = await prisma.tH_CsatSurvey.findUnique({
      where: { ticketId },
      select: { id: true },
    })
    if (existing) return

    const ticket = await prisma.tH_Ticket.findUnique({
      where: { id: ticketId },
      select: {
        ticketNumber: true,
        title: true,
        client: {
          select: {
            name: true,
            billingEmail: true,
            emailClientOnTicketEvents: true,
            contacts: {
              where: { isActive: true, email: { not: null } },
              orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
              take: 1,
              select: { firstName: true, email: true },
            },
          },
        },
      },
    })
    if (!ticket) return
    if (!ticket.client.emailClientOnTicketEvents) return

    const primary = ticket.client.contacts[0]
    const toEmail = primary?.email ?? ticket.client.billingEmail ?? null
    if (!toEmail) return

    const token = randomBytes(32).toString('hex')
    const surveyUrl = `${publicBase()}/csat/${token}`
    const subject = `[#TH-${ticket.ticketNumber}] How did we do?`
    const html = bodyFor({
      contactFirstName: primary?.firstName ?? null,
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      surveyUrl,
    })

    await prisma.tH_CsatSurvey.create({
      data: { ticketId, token, toEmail: toEmail.toLowerCase() },
    })

    await sendMail({ to: [toEmail], subject, html })

    await prisma.tH_TicketEmailOutbound.create({
      data: {
        ticketId,
        mode: 'CSAT_SURVEY',
        toEmail: toEmail.toLowerCase(),
        subject,
      },
    })
  } catch (e) {
    console.error('[csat-survey] send failed', e)
  }
}
