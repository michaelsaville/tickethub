import { prisma } from '@/app/lib/prisma'
import { notifyUser, ticketUrl } from '@/app/lib/notify-server'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

/**
 * Core comment creation logic shared between the `addComment` server action
 * and the `/api/tickets/[id]/comments` REST route (which the offline
 * sync queue replays). Does not call `revalidatePath` — the caller decides
 * whether to do that.
 */
export async function createComment(
  userId: string,
  ticketId: string,
  body: string,
  isInternal: boolean,
  clientOpId: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'Comment is empty' }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tH_TicketComment.create({
        data: {
          ticketId,
          authorId: userId,
          body: trimmed,
          isInternal,
          clientOpId,
        },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: isInternal ? 'INTERNAL_NOTE' : 'COMMENT',
        },
      })
      await tx.tH_Ticket.update({
        where: { id: ticketId },
        data: { isUnread: false },
      })
    })

    const ticketInfo = await prisma.tH_Ticket.findUnique({
      where: { id: ticketId },
      select: {
        ticketNumber: true,
        title: true,
        assignedToId: true,
        client: { select: { name: true, shortCode: true } },
      },
    })
    if (ticketInfo?.assignedToId && ticketInfo.assignedToId !== userId) {
      const clientLabel =
        ticketInfo.client.shortCode ?? ticketInfo.client.name
      notifyUser(ticketInfo.assignedToId, {
        title: `${isInternal ? 'Internal note' : 'Comment'}: #${ticketInfo.ticketNumber}`,
        body: `${clientLabel} — ${trimmed.slice(0, 120)}`,
        url: ticketUrl(ticketId),
        priority: 'normal',
        category: 'COMMENT',
      })
    }

    await emit({
      type: EVENT_TYPES.TICKET_COMMENT_ADDED,
      entityType: 'ticket',
      entityId: ticketId,
      actorId: userId,
      payload: { isInternal, bodyLength: trimmed.length },
    })

    return { ok: true }
  } catch (e) {
    console.error('[comments-core] createComment failed', e)
    return { ok: false, error: 'Failed to add comment' }
  }
}
