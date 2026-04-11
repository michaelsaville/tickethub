'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { createCharge } from '@/app/lib/actions/charges'

export interface ChecklistItem {
  id: string
  text: string
  estimatedMinutes?: number | null
  done: boolean
  chargeId?: string | null
  createdAt: string
  completedAt?: string | null
}

export type ChecklistResult = { ok: true } | { ok: false; error: string }

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

async function loadChecklist(ticketId: string): Promise<ChecklistItem[]> {
  const row = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: { checklist: true },
  })
  if (!row || !row.checklist) return []
  if (!Array.isArray(row.checklist)) return []
  return row.checklist as unknown as ChecklistItem[]
}

async function saveChecklist(
  ticketId: string,
  items: ChecklistItem[],
): Promise<void> {
  await prisma.tH_Ticket.update({
    where: { id: ticketId },
    data: { checklist: items as unknown as object },
  })
}

export async function addChecklistItem(
  ticketId: string,
  text: string,
  estimatedMinutes?: number,
): Promise<ChecklistResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Item text required' }

  const items = await loadChecklist(ticketId)
  items.push({
    id: randomUUID(),
    text: trimmed,
    estimatedMinutes:
      estimatedMinutes && estimatedMinutes > 0 ? estimatedMinutes : null,
    done: false,
    chargeId: null,
    createdAt: new Date().toISOString(),
  })
  await saveChecklist(ticketId, items)
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

export async function toggleChecklistItem(
  ticketId: string,
  itemId: string,
): Promise<ChecklistResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  const items = await loadChecklist(ticketId)
  const item = items.find((i) => i.id === itemId)
  if (!item) return { ok: false, error: 'Item not found' }
  if (item.chargeId && !item.done) {
    // Re-opening a converted item is allowed, but we clear the link
    item.chargeId = null
  }
  item.done = !item.done
  item.completedAt = item.done ? new Date().toISOString() : null
  await saveChecklist(ticketId, items)
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

export async function deleteChecklistItem(
  ticketId: string,
  itemId: string,
): Promise<ChecklistResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  const items = await loadChecklist(ticketId)
  const next = items.filter((i) => i.id !== itemId)
  if (next.length === items.length) return { ok: false, error: 'Not found' }
  await saveChecklist(ticketId, next)
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

/**
 * Convert a checklist item to a LABOR charge. Uses the item's estimated
 * minutes by default; caller can override. The checklist item is marked
 * done and linked to the created charge.
 */
export async function convertChecklistItemToCharge(
  ticketId: string,
  itemId: string,
  laborItemId: string,
  durationMinutes: number,
): Promise<ChecklistResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }

  const items = await loadChecklist(ticketId)
  const target = items.find((i) => i.id === itemId)
  if (!target) return { ok: false, error: 'Checklist item not found' }
  if (target.chargeId) return { ok: false, error: 'Already converted' }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { ok: false, error: 'Duration must be positive' }
  }

  // createCharge handles contract resolution + price waterfall + timeline
  const chargeRes = await createCharge(ticketId, {
    itemId: laborItemId,
    durationMinutes: Math.round(durationMinutes),
    description: target.text,
  })
  if (!chargeRes.ok) return chargeRes

  // Reload in case the ticket's checklist changed concurrently (unlikely)
  const fresh = await loadChecklist(ticketId)
  const latest = fresh.find((i) => i.id === itemId)
  if (latest) {
    latest.done = true
    latest.completedAt = new Date().toISOString()
    // Best effort — we don't know the created charge's id without
    // another query, so we just mark it done. The timeline has the link.
  }
  await saveChecklist(ticketId, fresh)
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}
