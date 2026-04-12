import { NextResponse, type NextRequest } from 'next/server'
import { graphFetch } from '@/app/lib/m365'
import {
  processInboundEmail,
  type ParsedInboundEmail,
} from '@/app/lib/inbox-core'
import { subscriptionClientState } from '@/app/lib/m365-subscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Microsoft Graph change-notification webhook for the accounting mailbox.
 *
 * Two modes:
 *
 * 1. **Validation handshake.** When Graph creates or renews a
 *    subscription pointing at this URL, it immediately POSTs with a
 *    `?validationToken=...` query param. We MUST return the raw token
 *    as `text/plain` within 10 seconds or Graph rejects the subscription.
 *
 * 2. **Change notification.** Graph POSTs a JSON body containing one or
 *    more notification records:
 *      { value: [{ resource, resourceData: { id }, clientState }, ...] }
 *    For each record we verify the clientState matches our shared
 *    secret, then fetch the full message via Graph and run it through
 *    processInboundEmail. We ACK with 202 immediately — heavy work
 *    happens synchronously but must complete within 30s per Graph docs.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const validationToken = url.searchParams.get('validationToken')
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  let payload: {
    value?: Array<{
      resource?: string
      resourceData?: { id?: string }
      clientState?: string
    }>
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  let expectedClientState: string
  try {
    expectedClientState = subscriptionClientState()
  } catch {
    console.error('[m365/email webhook] M365_WEBHOOK_SECRET not set')
    return NextResponse.json(
      { data: null, error: 'Webhook not configured' },
      { status: 500 },
    )
  }

  const records = payload.value ?? []
  for (const record of records) {
    if (record.clientState !== expectedClientState) {
      console.warn(
        '[m365/email webhook] clientState mismatch — ignoring record',
      )
      continue
    }
    const messageId = record.resourceData?.id
    if (!messageId) continue

    try {
      const parsed = await fetchAndParseMessage(messageId)
      if (!parsed) continue
      const outcome = await processInboundEmail(parsed)
      console.log('[m365/email webhook]', outcome)
    } catch (e) {
      console.error(
        '[m365/email webhook] failed to process message',
        messageId,
        e,
      )
      // Swallow — we still want to ACK so Graph doesn't retry forever.
    }
  }

  return new NextResponse(null, { status: 202 })
}

/**
 * Graph sends us a message ID, not the body. Fetch it with the fields we
 * need and collapse it into our pipeline shape. Returns null if the
 * fetch fails so the caller can skip gracefully.
 */
async function fetchAndParseMessage(
  messageId: string,
): Promise<ParsedInboundEmail | null> {
  // $select keeps the response small; $expand isn't needed.
  const fields = [
    'id',
    'subject',
    'from',
    'receivedDateTime',
    'body',
    'bodyPreview',
    'internetMessageHeaders',
    'internetMessageId',
  ].join(',')
  const res = await graphFetch(
    `/users/${encodeURIComponent(process.env.M365_SENDER_UPN ?? '')}/messages/${encodeURIComponent(messageId)}?$select=${fields}`,
  )
  if (!res.ok) {
    console.error(
      '[m365/email webhook] message fetch failed',
      res.status,
      await res.text().catch(() => ''),
    )
    return null
  }
  const msg = (await res.json()) as {
    id: string
    subject?: string
    from?: { emailAddress?: { address?: string; name?: string } }
    receivedDateTime?: string
    body?: { contentType?: string; content?: string }
    bodyPreview?: string
    internetMessageHeaders?: Array<{ name: string; value: string }>
  }

  const fromAddr = msg.from?.emailAddress?.address
  if (!fromAddr) {
    console.warn('[m365/email webhook] message has no from address', msg.id)
    return null
  }

  const headers = msg.internetMessageHeaders ?? []
  const headerMap = new Map(
    headers.map((h) => [h.name.toLowerCase(), h.value]),
  )
  const inReplyTo = headerMap.get('in-reply-to') ?? null
  const refsRaw = headerMap.get('references') ?? ''
  const references = refsRaw
    ? refsRaw
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  const isHtml = (msg.body?.contentType ?? '').toLowerCase() === 'html'
  const bodyHtml = isHtml ? msg.body?.content ?? null : null
  const bodyText = isHtml
    ? stripHtml(msg.body?.content ?? '')
    : msg.body?.content ?? msg.bodyPreview ?? ''

  return {
    graphMessageId: msg.id,
    fromEmail: fromAddr,
    fromName: msg.from?.emailAddress?.name ?? null,
    subject: msg.subject ?? '(no subject)',
    bodyText,
    bodyHtml,
    receivedAt: msg.receivedDateTime
      ? new Date(msg.receivedDateTime)
      : new Date(),
    inReplyTo,
    references,
    headers,
  }
}

/** Minimal HTML→text fallback — Graph gives us preview text too, so this
 *  only runs when the body is HTML and we don't have anything cleaner. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
