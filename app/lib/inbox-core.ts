import 'server-only'
import { prisma } from '@/app/lib/prisma'
import { createComment } from '@/app/lib/comments-core'
import { createTicketCore } from '@/app/lib/tickets-core'
import { notifyUser, ticketUrl } from '@/app/lib/notify-server'

/**
 * Inbound-email pipeline. Called once per message after the M365 Graph
 * webhook fetches the full body. Decides what happens to the email:
 *
 *   1. Blocked sender      → drop
 *   2. Forwarder (tech)    → always land in Inbox, never auto-create
 *   3. Threading match     → append as comment on existing ticket
 *   4. Known contact match → auto-create ticket on that client
 *   5. Unknown sender      → land in Inbox
 *
 * Rate limit: if ≥ 3 PENDING emails from the same sender already exist in
 * the last 24h, newer ones collapse into the newest existing row via
 * `additionalCount++` instead of stacking.
 */

export interface ParsedInboundEmail {
  graphMessageId: string
  fromEmail: string
  fromName: string | null
  subject: string
  bodyText: string
  bodyHtml: string | null
  receivedAt: Date
  /** RFC 2822 In-Reply-To header, if present. */
  inReplyTo: string | null
  /** RFC 2822 References header list, if present. */
  references: string[]
  /** Raw internetMessageHeaders from Graph, for spam-heuristic checks. */
  headers: Array<{ name: string; value: string }>
}

export type PipelineOutcome =
  | { action: 'dropped'; reason: string }
  | { action: 'deduped'; pendingId: string }
  | { action: 'threadMatch'; ticketId: string }
  | { action: 'autoCreated'; ticketId: string }
  | { action: 'pending'; pendingId: string; forwarded: boolean }

const SYSTEM_USER_CACHE: { id: string | null; at: number } = { id: null, at: 0 }

/**
 * Programmatic ticket creation requires a `createdById`. Inbound emails
 * don't have one, so we use the oldest GLOBAL_ADMIN as the system actor.
 * Cached for one hour to avoid a lookup on every inbound message.
 */
async function getSystemActorId(): Promise<string | null> {
  if (SYSTEM_USER_CACHE.id && Date.now() - SYSTEM_USER_CACHE.at < 3_600_000) {
    return SYSTEM_USER_CACHE.id
  }
  const row = await prisma.tH_User.findFirst({
    where: { role: 'GLOBAL_ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  SYSTEM_USER_CACHE.id = row?.id ?? null
  SYSTEM_USER_CACHE.at = Date.now()
  return SYSTEM_USER_CACHE.id
}

function makeSnippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 280 ? clean.slice(0, 277) + '…' : clean
}

function normalizeEmail(addr: string): string {
  return addr.trim().toLowerCase()
}

function domainOf(addr: string): string | null {
  const at = addr.lastIndexOf('@')
  if (at < 0) return null
  return addr.slice(at + 1).toLowerCase()
}

/** Detects `[#TH-1234]` or `#TH-1234` or bare `#1234` in subject. */
function parseTicketNumberFromSubject(subject: string): number | null {
  const patterns = [
    /\[#TH-(\d+)\]/i,
    /#TH-(\d+)/i,
    /#(\d{3,})/, // bare `#1234` — min 3 digits to avoid false positives like "#1"
  ]
  for (const pat of patterns) {
    const m = subject.match(pat)
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

/** Bulk-mail / list-mail heuristic — matches common list server markers. */
function looksLikeBulkMail(
  headers: Array<{ name: string; value: string }>,
  subject: string,
): boolean {
  const headerMap = new Map(
    headers.map((h) => [h.name.toLowerCase(), h.value.toLowerCase()]),
  )
  if (headerMap.has('list-unsubscribe')) return true
  if (headerMap.get('precedence') === 'bulk') return true
  if (headerMap.get('precedence') === 'list') return true
  if (headerMap.has('x-mailchimp-id')) return true
  if (headerMap.has('x-campaignid')) return true
  if (/unsubscribe/i.test(subject)) return true
  return false
}

/**
 * Auto-responder detection. RFC 3834 mandates `Auto-Submitted` on any
 * automated reply, and most modern mail systems (Exchange, Gmail, even
 * SpamAssassin) honor it. Also catches the informal `X-Autoreply` and
 * `X-Autorespond` variants.
 *
 * Critical for loop prevention: a client's vacation responder can ping
 * us back for every outbound email we send, creating infinite loops.
 */
function looksLikeAutoResponse(
  headers: Array<{ name: string; value: string }>,
): boolean {
  const headerMap = new Map(
    headers.map((h) => [h.name.toLowerCase(), h.value.toLowerCase()]),
  )
  const autoSubmitted = headerMap.get('auto-submitted')
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (headerMap.has('x-autoreply')) return true
  if (headerMap.has('x-autorespond')) return true
  if (headerMap.get('x-auto-response-suppress')) {
    // Some Exchange policies set this; the presence of the header
    // typically means this IS an auto response (or something that should
    // suppress them in the reply). Safer to treat as auto.
    return true
  }
  return false
}

async function isBlocked(fromEmail: string): Promise<boolean> {
  const email = normalizeEmail(fromEmail)
  const dom = domainOf(email)
  const row = await prisma.tH_BlockedSender.findFirst({
    where: {
      OR: [
        { kind: 'EMAIL', value: email },
        ...(dom ? [{ kind: 'DOMAIN', value: dom }] : []),
      ],
    },
    select: { id: true },
  })
  return Boolean(row)
}

async function findForwarderUserId(fromEmail: string): Promise<string | null> {
  const email = normalizeEmail(fromEmail)
  const row = await prisma.tH_User.findFirst({
    where: {
      isActive: true,
      inboundForwardEmails: { has: email },
    },
    select: { id: true },
  })
  return row?.id ?? null
}

async function findContactMatch(
  fromEmail: string,
): Promise<{ clientId: string; contactId: string; contactName: string } | null> {
  const email = normalizeEmail(fromEmail)
  // Case-insensitive match. Prefer active contacts; among those, prefer
  // primary; among those, most-recently-updated.
  const contact = await prisma.tH_Contact.findFirst({
    where: {
      isActive: true,
      email: { equals: email, mode: 'insensitive' },
    },
    orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      clientId: true,
      firstName: true,
      lastName: true,
    },
  })
  if (!contact) return null
  return {
    clientId: contact.clientId,
    contactId: contact.id,
    contactName: `${contact.firstName} ${contact.lastName}`.trim(),
  }
}

async function findTicketByThreadingHints(
  email: ParsedInboundEmail,
): Promise<string | null> {
  const num = parseTicketNumberFromSubject(email.subject)
  if (num != null) {
    const t = await prisma.tH_Ticket.findFirst({
      where: { ticketNumber: num },
      select: { id: true },
    })
    if (t) return t.id
  }
  // Future: store outbound Graph messageId in a table and match
  // against email.inReplyTo / email.references. Skipped for this
  // session since we don't yet send ticket-scoped outbound mail.
  return null
}

async function rateLimitedDedupe(
  fromEmail: string,
  windowMs = 24 * 60 * 60 * 1000,
  max = 3,
): Promise<{ dedupedInto: string | null }> {
  const email = normalizeEmail(fromEmail)
  const since = new Date(Date.now() - windowMs)
  const recent = await prisma.tH_PendingInboundEmail.findMany({
    where: {
      fromEmail: { equals: email, mode: 'insensitive' },
      status: 'PENDING',
      receivedAt: { gte: since },
    },
    orderBy: { receivedAt: 'desc' },
    select: { id: true },
  })
  if (recent.length >= max) {
    const target = recent[0]
    await prisma.tH_PendingInboundEmail.update({
      where: { id: target.id },
      data: { additionalCount: { increment: 1 } },
    })
    return { dedupedInto: target.id }
  }
  return { dedupedInto: null }
}

export async function processInboundEmail(
  email: ParsedInboundEmail,
): Promise<PipelineOutcome> {
  // Idempotency — Graph can redeliver a notification. If we've seen this
  // messageId, short-circuit.
  const existing = await prisma.tH_PendingInboundEmail.findUnique({
    where: { graphMessageId: email.graphMessageId },
    select: { id: true },
  })
  if (existing) return { action: 'deduped', pendingId: existing.id }

  // 1. Blocked sender
  if (await isBlocked(email.fromEmail)) {
    return { action: 'dropped', reason: 'blocked sender' }
  }

  // 1a. Auto-responder detection. RFC 3834 Auto-Submitted etc. Always
  // dropped — a forwarder's OOO reply is still garbage we don't want
  // on the dashboard.
  if (looksLikeAutoResponse(email.headers)) {
    return { action: 'dropped', reason: 'auto-response' }
  }

  // 1b. Obvious bulk mail — drop silently unless it's from a forwarder.
  const forwarderUserId = await findForwarderUserId(email.fromEmail)
  if (!forwarderUserId && looksLikeBulkMail(email.headers, email.subject)) {
    return { action: 'dropped', reason: 'bulk mail' }
  }

  const snippet = makeSnippet(email.bodyText || email.subject)

  // 2. Forwarder — always Pending, never auto-create.
  if (forwarderUserId) {
    // Forwarders get a looser window (10/hr) before deduping.
    const dedupe = await rateLimitedDedupe(
      email.fromEmail,
      60 * 60 * 1000,
      10,
    )
    if (dedupe.dedupedInto) {
      return { action: 'deduped', pendingId: dedupe.dedupedInto }
    }
    const pending = await prisma.tH_PendingInboundEmail.create({
      data: {
        graphMessageId: email.graphMessageId,
        fromEmail: normalizeEmail(email.fromEmail),
        fromName: email.fromName,
        subject: email.subject,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        snippet,
        receivedAt: email.receivedAt,
        forwardedByUserId: forwarderUserId,
      },
      select: { id: true },
    })
    return { action: 'pending', pendingId: pending.id, forwarded: true }
  }

  // 3. Threading match → append as comment
  const threadedTicketId = await findTicketByThreadingHints(email)
  if (threadedTicketId) {
    const systemId = await getSystemActorId()
    if (systemId) {
      const commentBody =
        `From: ${email.fromName ?? email.fromEmail} <${email.fromEmail}>\n\n` +
        email.bodyText
      await createComment(
        systemId,
        threadedTicketId,
        commentBody,
        false, // public
        `inbound:${email.graphMessageId}`, // idempotency key
      )
      // Mark unread + notify assignee
      const ticket = await prisma.tH_Ticket.update({
        where: { id: threadedTicketId },
        data: { isUnread: true },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          assignedToId: true,
          client: { select: { name: true, shortCode: true } },
        },
      })
      if (ticket.assignedToId) {
        notifyUser(ticket.assignedToId, {
          title: `Client reply: #${ticket.ticketNumber}`,
          body: `${ticket.client.shortCode ?? ticket.client.name} — ${snippet.slice(0, 120)}`,
          url: ticketUrl(ticket.id),
          priority: 'normal',
          category: 'COMMENT',
        })
      }
    }
    return { action: 'threadMatch', ticketId: threadedTicketId }
  }

  // 4. Known contact → auto-create
  const contactMatch = await findContactMatch(email.fromEmail)
  if (contactMatch) {
    const systemId = await getSystemActorId()
    if (systemId) {
      const res = await createTicketCore({
        clientId: contactMatch.clientId,
        title: email.subject || '(no subject)',
        description:
          `Auto-created from email from ${contactMatch.contactName || email.fromEmail}\n\n` +
          email.bodyText,
        priority: 'MEDIUM',
        type: 'INCIDENT',
        createdById: systemId,
      })
      if (res.ok) {
        // Persist a pending row too — for audit, status APPROVED with
        // matchedTicketId. Makes the dashboard show "auto-created".
        await prisma.tH_PendingInboundEmail.create({
          data: {
            graphMessageId: email.graphMessageId,
            fromEmail: normalizeEmail(email.fromEmail),
            fromName: email.fromName,
            subject: email.subject,
            bodyText: email.bodyText,
            bodyHtml: email.bodyHtml,
            snippet,
            receivedAt: email.receivedAt,
            status: 'APPROVED',
            matchedTicketId: res.ticketId,
            handledAt: new Date(),
          },
        })
        return { action: 'autoCreated', ticketId: res.ticketId }
      }
    }
    // Fall through to Pending if auto-create failed
  }

  // 5. Unknown — land in Pending, with dedupe.
  const dedupe = await rateLimitedDedupe(email.fromEmail)
  if (dedupe.dedupedInto) {
    return { action: 'deduped', pendingId: dedupe.dedupedInto }
  }
  const pending = await prisma.tH_PendingInboundEmail.create({
    data: {
      graphMessageId: email.graphMessageId,
      fromEmail: normalizeEmail(email.fromEmail),
      fromName: email.fromName,
      subject: email.subject,
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
      snippet,
      receivedAt: email.receivedAt,
    },
    select: { id: true },
  })
  return { action: 'pending', pendingId: pending.id, forwarded: false }
}
