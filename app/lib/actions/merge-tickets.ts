'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type MergeResult =
  | { ok: true; winnerId: string; winnerNumber: number }
  | { ok: false; error: string }

export type MergeCandidate = {
  id: string
  ticketNumber: number
  title: string
  status: string
  priority: string
  clientName: string
}

/**
 * Merge `loserId` into `winnerId`. Moves all child records (comments,
 * charges, attachments, signatures, parts, appointments, timer, tags,
 * timeline events) onto the winner; logs `MERGE_INTO` on the winner and
 * `MERGED_AWAY` on the loser; soft-deletes the loser and marks it CLOSED.
 *
 * Idempotent in the sense that a second call against the same loser will
 * return "already merged" because the loser's `deletedAt` is set after
 * the first run.
 */
export async function mergeTickets({
  winnerId,
  loserId,
}: {
  winnerId: string
  loserId: string
}): Promise<MergeResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  const userId = session.user.id

  if (winnerId === loserId) {
    return { ok: false, error: 'Cannot merge a ticket into itself' }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [winner, loser] = await Promise.all([
        tx.tH_Ticket.findUnique({
          where: { id: winnerId },
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            deletedAt: true,
          },
        }),
        tx.tH_Ticket.findUnique({
          where: { id: loserId },
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            deletedAt: true,
          },
        }),
      ])

      if (!winner || winner.deletedAt) {
        return { ok: false as const, error: 'Target ticket not found' }
      }
      if (!loser) {
        return { ok: false as const, error: 'Source ticket not found' }
      }
      if (loser.deletedAt) {
        return {
          ok: false as const,
          error: 'Source ticket is already merged or deleted',
        }
      }

      // Move every child record from loser → winner.
      await tx.tH_TicketComment.updateMany({
        where: { ticketId: loserId },
        data: { ticketId: winnerId },
      })
      await tx.tH_Charge.updateMany({
        where: { ticketId: loserId },
        data: { ticketId: winnerId },
      })
      await tx.tH_Attachment.updateMany({
        where: { ticketId: loserId },
        data: { ticketId: winnerId },
      })
      await tx.tH_Signature.updateMany({
        where: { ticketId: loserId },
        data: { ticketId: winnerId },
      })
      await tx.tH_TicketPart.updateMany({
        where: { ticketId: loserId },
        data: { ticketId: winnerId },
      })
      await tx.tH_Appointment.updateMany({
        where: { ticketId: loserId },
        data: { ticketId: winnerId },
      })
      await tx.tH_TicketTimer.updateMany({
        where: { ticketId: loserId },
        data: { ticketId: winnerId },
      })
      await tx.tH_TicketEvent.updateMany({
        where: { ticketId: loserId },
        data: { ticketId: winnerId },
      })

      // Tags: respect the unique [ticketId, tag] constraint by re-creating
      // distinct entries on the winner, then deleting the loser's rows.
      const loserTags = await tx.tH_TicketTag.findMany({
        where: { ticketId: loserId },
        select: { tag: true },
      })
      if (loserTags.length > 0) {
        await tx.tH_TicketTag.createMany({
          data: loserTags.map((t) => ({ ticketId: winnerId, tag: t.tag })),
          skipDuplicates: true,
        })
        await tx.tH_TicketTag.deleteMany({ where: { ticketId: loserId } })
      }

      // Two new timeline events: one on the winner so the merge is visible
      // there, one on the loser so navigating to the soft-deleted ticket
      // can redirect to the winner.
      const now = new Date()
      await tx.tH_TicketEvent.createMany({
        data: [
          {
            ticketId: winnerId,
            userId,
            type: 'MERGE_INTO',
            data: {
              fromTicketId: loserId,
              fromTicketNumber: loser.ticketNumber,
              fromTitle: loser.title,
            },
            createdAt: now,
          },
          {
            ticketId: loserId,
            userId,
            type: 'MERGED_AWAY',
            data: {
              toTicketId: winnerId,
              toTicketNumber: winner.ticketNumber,
              toTitle: winner.title,
            },
            createdAt: now,
          },
        ],
      })

      // Soft-delete + close the loser so future loads can redirect.
      await tx.tH_Ticket.update({
        where: { id: loserId },
        data: {
          status: 'CLOSED',
          closedAt: now,
          deletedAt: now,
          isUnread: false,
          // Pause any running SLA on the loser so it doesn't keep ticking
          // in reports if it was active.
          slaPausedAt: now,
        },
      })

      return {
        ok: true as const,
        winnerId,
        winnerNumber: winner.ticketNumber,
      }
    })

    if (result.ok) {
      revalidatePath(`/tickets/${winnerId}`)
      revalidatePath(`/tickets/${loserId}`)
      revalidatePath('/tickets')
    }
    return result
  } catch (e) {
    console.error('[actions/merge-tickets] failed', e)
    return { ok: false, error: 'Merge failed — see server logs' }
  }
}

/**
 * Find candidate target tickets for the merge picker. Filters out the
 * source ticket and any soft-deleted rows. Default search scopes to
 * the same client; the UI can opt into all-clients search.
 */
export async function listMergeCandidates(opts: {
  excludeTicketId: string
  clientId?: string
  q?: string
  limit?: number
}): Promise<MergeCandidate[]> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return []

  const where: Prisma.TH_TicketWhereInput = {
    id: { not: opts.excludeTicketId },
    deletedAt: null,
  }
  if (opts.clientId) where.clientId = opts.clientId

  if (opts.q) {
    const q = opts.q.trim()
    if (q) {
      const orClauses: Prisma.TH_TicketWhereInput[] = [
        { title: { contains: q, mode: 'insensitive' } },
      ]
      const num = parseInt(q.replace(/[^\d]/g, ''), 10)
      if (Number.isFinite(num) && num > 0) {
        orClauses.push({ ticketNumber: num })
      }
      where.OR = orClauses
    }
  }

  const tickets = await prisma.tH_Ticket.findMany({
    where,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: opts.limit ?? 20,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      client: { select: { name: true } },
    },
  })

  return tickets.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    status: t.status,
    priority: t.priority,
    clientName: t.client.name,
  }))
}
