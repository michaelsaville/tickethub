'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

/**
 * Set or clear a ticket's parent. Self-cycles are blocked. Parent must
 * exist; the parent's status is independent — projects intentionally do
 * not auto-roll-up status (admins close them explicitly when ready).
 */
export async function setTicketParent(input: {
  ticketId: string
  parentTicketNumber: number | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, error } = await requireAuth()
  if (error || !session) return { ok: false, error: 'Not authenticated' }
  const userId = session.user.id

  if (input.parentTicketNumber == null) {
    const t = await prisma.tH_Ticket.findUnique({
      where: { id: input.ticketId },
      select: { parentId: true },
    })
    if (t?.parentId) {
      await prisma.tH_Ticket.update({
        where: { id: input.ticketId },
        data: { parentId: null },
      })
      await prisma.tH_TicketEvent.create({
        data: {
          ticketId: input.ticketId,
          userId,
          type: 'PARENT_UNLINKED',
          data: {},
        },
      })
    }
    revalidatePath(`/tickets/${input.ticketId}`)
    return { ok: true }
  }

  const parent = await prisma.tH_Ticket.findUnique({
    where: { ticketNumber: input.parentTicketNumber },
    select: { id: true, parentId: true, ticketNumber: true },
  })
  if (!parent) return { ok: false, error: 'Parent ticket not found' }
  if (parent.id === input.ticketId) {
    return { ok: false, error: 'A ticket cannot be its own parent' }
  }
  // Block grandparent cycles — sub-tickets cannot themselves have children
  // referenced as parent. Walk up at most 5 hops looking for self.
  let cursor: { id: string; parentId: string | null } | null = parent
  for (let i = 0; i < 5 && cursor?.parentId; i++) {
    if (cursor.parentId === input.ticketId) {
      return { ok: false, error: 'Cycle detected — that would loop back' }
    }
    cursor = await prisma.tH_Ticket.findUnique({
      where: { id: cursor.parentId },
      select: { id: true, parentId: true },
    })
  }

  await prisma.tH_Ticket.update({
    where: { id: input.ticketId },
    data: { parentId: parent.id },
  })
  await prisma.tH_TicketEvent.create({
    data: {
      ticketId: input.ticketId,
      userId,
      type: 'PARENT_LINKED',
      data: { parentId: parent.id, parentNumber: parent.ticketNumber },
    },
  })
  revalidatePath(`/tickets/${input.ticketId}`)
  revalidatePath(`/tickets/${parent.id}`)
  return { ok: true }
}
