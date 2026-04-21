import 'server-only'
import { prisma } from '@/app/lib/prisma'
import { m365Configured, sendMail } from '@/app/lib/m365'

/**
 * Outbound ticket-email helper. Fire-and-forget from server actions and
 * API routes — callers must not block on its result. Sends an email to
 * the ticket's client contact when:
 *
 *   1. A new ticket is opened (mode = 'NEW_TICKET')
 *   2. A staff member posts a public reply (mode = 'STAFF_REPLY')
 *
 * Emails carry `[#TH-1234]` in the subject. When the client replies, the
 * inbox webhook picks up the marker and threads the reply as a comment
 * on the same ticket — closing the email round trip.
 *
 * Gating:
 *   - `TICKETHUB_CLIENT_EMAILS_ENABLED=true` env (master switch, default off)
 *   - `TH_Client.emailClientOnTicketEvents === true` (per-client, default on)
 *   - m365 configured
 *   - Ticket has a recipient (primary contact email, or falls back to
 *     billingEmail if set; otherwise skip silently)
 *
 * Audit: every successful send writes a `TH_TicketEmailOutbound` row,
 * including an `ignoreUntil` window during which the inbox pipeline
 * will drop any inbound mail from that same address — blocks vacation
 * responder loops.
 */

type Mode = 'NEW_TICKET' | 'STAFF_REPLY'

const AUTORESPONDER_WINDOW_MS = 5 * 60 * 1000 // 5 min

function masterEnabled(): boolean {
  return process.env.TICKETHUB_CLIENT_EMAILS_ENABLED === 'true'
}

export function subjectFor(mode: Mode, ticketNumber: number, title: string): string {
  const prefix = `[#TH-${ticketNumber}]`
  if (mode === 'NEW_TICKET') return `${prefix} ${title}`
  return `${prefix} Re: ${title}`
}

export function bodyFor(args: {
  mode: Mode
  clientName: string
  contactFirstName: string | null
  ticketNumber: number
  ticketTitle: string
  messageText: string
}): string {
  const { mode, contactFirstName, ticketNumber, ticketTitle, messageText } =
    args
  const greeting = contactFirstName ? `Hi ${contactFirstName},` : 'Hi,'
  const intro =
    mode === 'NEW_TICKET'
      ? `Thanks — we've received your request and opened ticket <strong>#${ticketNumber}</strong>.`
      : `An update has been posted to your ticket <strong>#${ticketNumber}</strong>.`
  const bodyHtml = escapeHtml(messageText).replace(/\n/g, '<br>')
  return `
<!doctype html>
<html>
<body style="font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #1a1a1a; max-width: 600px;">
  <p>${greeting}</p>
  <p>${intro}</p>
  <blockquote style="margin: 0 0 1em 0; padding: 12px 16px; background: #f5f5f5; border-left: 3px solid #f97316;">
    <div style="font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #666;">${escapeHtml(ticketTitle)}</div>
    <div style="margin-top: 8px;">${bodyHtml}</div>
  </blockquote>
  <p style="color: #666; font-size: 12px;">Reply to this email to respond — your message will be added to the ticket automatically. Please keep <strong>[#TH-${ticketNumber}]</strong> in the subject line.</p>
  <p style="color: #999; font-size: 11px;">PCC2K · TicketHub</p>
</body>
</html>
`.trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function pickRecipient(
  ticketId: string,
): Promise<
  | {
      toEmail: string
      contactFirstName: string | null
      clientName: string
      ticketNumber: number
      ticketTitle: string
      emailClientOnTicketEvents: boolean
    }
  | null
> {
  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: {
      ticketNumber: true,
      title: true,
      client: {
        select: {
          id: true,
          name: true,
          billingEmail: true,
          emailClientOnTicketEvents: true,
          contacts: {
            where: { isActive: true, email: { not: null } },
            orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
            take: 1,
            select: {
              firstName: true,
              email: true,
            },
          },
        },
      },
    },
  })
  if (!ticket) return null
  const primary = ticket.client.contacts[0]
  const toEmail = primary?.email ?? ticket.client.billingEmail ?? null
  if (!toEmail) return null
  return {
    toEmail,
    contactFirstName: primary?.firstName ?? null,
    clientName: ticket.client.name,
    ticketNumber: ticket.ticketNumber,
    ticketTitle: ticket.title,
    emailClientOnTicketEvents: ticket.client.emailClientOnTicketEvents,
  }
}

/**
 * Quiet no-op if anything is disabled. Never throws. Callers should
 * kick this off with `void sendTicketClientEmail(...)` and move on.
 */
export async function sendTicketClientEmail(args: {
  ticketId: string
  mode: Mode
  /** For STAFF_REPLY: the comment body. For NEW_TICKET: the ticket description. */
  messageText: string
}): Promise<void> {
  try {
    if (!masterEnabled()) return
    if (!m365Configured()) return

    const target = await pickRecipient(args.ticketId)
    if (!target) return
    if (!target.emailClientOnTicketEvents) return

    const subject = subjectFor(args.mode, target.ticketNumber, target.ticketTitle)
    const html = bodyFor({
      mode: args.mode,
      clientName: target.clientName,
      contactFirstName: target.contactFirstName,
      ticketNumber: target.ticketNumber,
      ticketTitle: target.ticketTitle,
      messageText: args.messageText,
    })

    await sendMail({
      to: [target.toEmail],
      subject,
      html,
    })

    await prisma.tH_TicketEmailOutbound.create({
      data: {
        ticketId: args.ticketId,
        mode: args.mode,
        toEmail: target.toEmail.toLowerCase(),
        subject,
        ignoreUntil: new Date(Date.now() + AUTORESPONDER_WINDOW_MS),
      },
    })
  } catch (e) {
    console.error('[ticket-email] send failed', e)
    // Swallowed — this is a fire-and-forget path. The UI action that
    // triggered us already succeeded against the database.
  }
}

