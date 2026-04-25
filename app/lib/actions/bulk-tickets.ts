'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { TH_TicketPriority, TH_TicketStatus } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { updateTicketStatusCore } from '@/app/lib/tickets-core'

export type BulkResult =
  | { ok: true; succeeded: number; failed: number }
  | { ok: false; error: string }

const MAX_BATCH = 200

/**
 * Apply one of {status, priority, assigneeId, addTag} to a batch of tickets.
 * Caller dispatches one patch field at a time (the UI does — picker sets one
 * value, hits Enter, submit). Multiple fields in one call are honored
 * sequentially but the result counters reflect the last field applied.
 *
 * Status changes go through `updateTicketStatusCore` per-ticket so SLA
 * pause/resume + STATUS_CHANGE events are correct. Other fields use
 * updateMany + a bulk-flagged event row each so the timeline still shows
 * who did it.
 */
export async function bulkUpdateTickets({
  ticketIds,
  patch,
}: {
  ticketIds: string[]
  patch: {
    status?: TH_TicketStatus
    priority?: TH_TicketPriority
    assigneeId?: string | null
    addTag?: string
  }
}): Promise<BulkResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  const userId = session.user.id

  if (ticketIds.length === 0) {
    return { ok: false, error: 'No tickets selected' }
  }
  if (ticketIds.length > MAX_BATCH) {
    return { ok: false, error: `Too many tickets (${MAX_BATCH} max per batch)` }
  }
  const fieldCount = [
    patch.status,
    patch.priority,
    patch.assigneeId,
    patch.addTag,
  ].filter((v) => v !== undefined).length
  if (fieldCount === 0) {
    return { ok: false, error: 'No changes specified' }
  }

  let succeeded = 0
  let failed = 0

  try {
    if (patch.status !== undefined) {
      const status = patch.status
      const results = await Promise.all(
        ticketIds.map((id) => updateTicketStatusCore(userId, id, status)),
      )
      succeeded = results.filter((r) => r.ok).length
      failed = results.length - succeeded
    }

    if (patch.priority !== undefined) {
      const priority = patch.priority
      const result = await prisma.tH_Ticket.updateMany({
        where: { id: { in: ticketIds }, deletedAt: null },
        data: { priority },
      })
      if (result.count > 0) {
        await prisma.tH_TicketEvent.createMany({
          data: ticketIds.map((id) => ({
            ticketId: id,
            userId,
            type: 'PRIORITY_CHANGE',
            data: { to: priority, bulk: true },
          })),
        })
      }
      succeeded = result.count
      failed = ticketIds.length - result.count
    }

    if (patch.assigneeId !== undefined) {
      const assigneeId = patch.assigneeId
      const result = await prisma.tH_Ticket.updateMany({
        where: { id: { in: ticketIds }, deletedAt: null },
        data: { assignedToId: assigneeId },
      })
      if (result.count > 0) {
        await prisma.tH_TicketEvent.createMany({
          data: ticketIds.map((id) => ({
            ticketId: id,
            userId,
            type: 'ASSIGNED',
            data: { to: assigneeId, bulk: true },
          })),
        })
      }
      succeeded = result.count
      failed = ticketIds.length - result.count
    }

    if (patch.addTag !== undefined) {
      const tag = patch.addTag.trim()
      if (!tag) return { ok: false, error: 'Tag cannot be empty' }
      if (tag.length > 50) return { ok: false, error: 'Tag is too long (50 max)' }
      const result = await prisma.tH_TicketTag.createMany({
        data: ticketIds.map((id) => ({ ticketId: id, tag })),
        skipDuplicates: true,
      })
      // For tags, "succeeded" means a new row was added; existing tags are
      // counted as no-op rather than failure.
      succeeded = result.count
      failed = 0
    }

    revalidatePath('/tickets')
    return { ok: true, succeeded, failed }
  } catch (e) {
    console.error('[actions/bulk-tickets] failed', e)
    return { ok: false, error: 'Bulk update failed' }
  }
}
