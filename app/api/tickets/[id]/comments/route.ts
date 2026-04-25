import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/app/lib/api-auth'
import { createComment } from '@/app/lib/comments-core'
import { prisma } from '@/app/lib/prisma'
import { sendTicketClientEmail } from '@/app/lib/ticket-email'
import { findMentionedUserIds } from '@/app/lib/mentions'
import { notifyUser, ticketUrl } from '@/app/lib/notify-server'

/**
 * REST endpoint for creating a ticket comment. Mirrors the `addComment`
 * server action so the offline sync queue can replay queued comments by
 * re-POSTing them when the client comes back online.
 *
 * Body: { body: string, isInternal: boolean, clientOpId?: string }
 *
 * `clientOpId` is an optional idempotency token — if the same op is
 * replayed after a partial-success network failure, we short-circuit
 * rather than double-post. Stored on the TicketComment record.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { body?: unknown; isInternal?: unknown; clientOpId?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  const body = typeof payload.body === 'string' ? payload.body : ''
  const isInternal = payload.isInternal === true
  const clientOpId =
    typeof payload.clientOpId === 'string' ? payload.clientOpId : null

  if (clientOpId) {
    const existing = await prisma.tH_TicketComment.findFirst({
      where: { ticketId, clientOpId },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { data: { id: existing.id, deduplicated: true }, error: null },
        { status: 200 },
      )
    }
  }

  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  })
  if (!ticket) {
    return NextResponse.json(
      { data: null, error: 'Ticket not found' },
      { status: 404 },
    )
  }

  const res = await createComment(
    session!.user.id,
    ticketId,
    body,
    isInternal,
    clientOpId,
  )
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }

  revalidatePath(`/tickets/${ticketId}`)
  if (!isInternal) {
    void sendTicketClientEmail({
      ticketId,
      mode: 'STAFF_REPLY',
      messageText: body,
    })
  }

  // Fire-and-forget @mention dispatch — never blocks the response.
  void dispatchMentions(ticketId, body, session!.user.id)

  return NextResponse.json({ data: { ok: true }, error: null }, { status: 201 })
}

/**
 * Resolve @mentions in the comment body to active TH_Users, log a MENTION
 * event per mentioned user, and dispatch ntfy/Pushover notifications.
 * Excludes the author so people don't get pinged for self-mentions.
 */
async function dispatchMentions(
  ticketId: string,
  body: string,
  authorId: string,
): Promise<void> {
  try {
    const users = await prisma.tH_User.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    })
    const mentionedIds = findMentionedUserIds(body, users).filter(
      (id) => id !== authorId,
    )
    if (mentionedIds.length === 0) return

    const [author, ticket] = await Promise.all([
      prisma.tH_User.findUnique({
        where: { id: authorId },
        select: { name: true },
      }),
      prisma.tH_Ticket.findUnique({
        where: { id: ticketId },
        select: { ticketNumber: true, title: true },
      }),
    ])
    if (!ticket) return

    const authorName = author?.name ?? 'A teammate'
    const url = ticketUrl(ticketId)
    const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body

    await Promise.all([
      // Log MENTION event per user (timeline visibility)
      prisma.tH_TicketEvent.createMany({
        data: mentionedIds.map((mentionedUserId) => ({
          ticketId,
          userId: authorId,
          type: 'MENTION',
          data: { mentionedUserId },
        })),
      }),
      // Dispatch notifications in parallel
      ...mentionedIds.map((userId) =>
        notifyUser(userId, {
          title: `@${authorName} mentioned you · #${ticket.ticketNumber}`,
          body: preview,
          url,
          category: 'COMMENT',
        }),
      ),
    ])
  } catch (e) {
    console.error('[comments] dispatchMentions failed', e)
  }
}
