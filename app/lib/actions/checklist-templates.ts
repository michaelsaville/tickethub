'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import type { ChecklistTemplateItem } from '@/app/types/checklist-template'
import type { ChecklistItem } from '@/app/lib/actions/checklist'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])

export type TemplateResult = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<{ ok: true } | TemplateResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!ADMIN_ROLES.has(session.user.role)) {
    return { ok: false, error: 'Admin role required' }
  }
  return { ok: true }
}

export async function createChecklistTemplate(
  name: string,
  description: string | null,
  items: Array<{ text: string; estimatedMinutes: number | null }>,
): Promise<TemplateResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Name is required' }
  if (items.length === 0) return { ok: false, error: 'At least one item is required' }

  const mapped: ChecklistTemplateItem[] = items.map((item, i) => ({
    id: randomUUID(),
    text: item.text.trim(),
    estimatedMinutes: item.estimatedMinutes && item.estimatedMinutes > 0
      ? item.estimatedMinutes
      : null,
    sortOrder: i,
  }))

  const valid = mapped.filter((i) => i.text.length > 0)
  if (valid.length === 0) return { ok: false, error: 'At least one non-empty item is required' }

  await prisma.tH_ChecklistTemplate.create({
    data: {
      name: trimmed,
      description: description?.trim() || null,
      items: valid as unknown as object,
    },
  })

  revalidatePath('/settings/checklist-templates')
  return { ok: true }
}

export async function updateChecklistTemplate(
  id: string,
  patch: {
    name?: string
    description?: string | null
    items?: Array<{ text: string; estimatedMinutes: number | null }>
  },
): Promise<TemplateResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const data: Record<string, unknown> = {}

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim()
    if (!trimmed) return { ok: false, error: 'Name is required' }
    data.name = trimmed
  }

  if (patch.description !== undefined) {
    data.description = patch.description?.trim() || null
  }

  if (patch.items !== undefined) {
    if (patch.items.length === 0) return { ok: false, error: 'At least one item is required' }
    const mapped: ChecklistTemplateItem[] = patch.items.map((item, i) => ({
      id: randomUUID(),
      text: item.text.trim(),
      estimatedMinutes: item.estimatedMinutes && item.estimatedMinutes > 0
        ? item.estimatedMinutes
        : null,
      sortOrder: i,
    }))
    const valid = mapped.filter((i) => i.text.length > 0)
    if (valid.length === 0) return { ok: false, error: 'At least one non-empty item is required' }
    data.items = valid as unknown as object
  }

  await prisma.tH_ChecklistTemplate.update({
    where: { id },
    data,
  })

  revalidatePath('/settings/checklist-templates')
  return { ok: true }
}

export async function deleteChecklistTemplate(
  id: string,
): Promise<TemplateResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  await prisma.tH_ChecklistTemplate.delete({ where: { id } })
  revalidatePath('/settings/checklist-templates')
  return { ok: true }
}

/**
 * Append all items from a checklist template to a ticket's existing checklist.
 */
export async function applyChecklistTemplate(
  ticketId: string,
  templateId: string,
): Promise<TemplateResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }

  const template = await prisma.tH_ChecklistTemplate.findUnique({
    where: { id: templateId },
  })
  if (!template) return { ok: false, error: 'Template not found' }

  const templateItems = template.items as unknown as ChecklistTemplateItem[]

  // Load existing checklist
  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: { checklist: true },
  })
  const existing: ChecklistItem[] =
    ticket?.checklist && Array.isArray(ticket.checklist)
      ? (ticket.checklist as unknown as ChecklistItem[])
      : []

  // Append template items as new checklist items
  const now = new Date().toISOString()
  const newItems: ChecklistItem[] = templateItems
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((ti) => ({
      id: randomUUID(),
      text: ti.text,
      estimatedMinutes: ti.estimatedMinutes,
      done: false,
      chargeId: null,
      createdAt: now,
      completedAt: null,
    }))

  await prisma.tH_Ticket.update({
    where: { id: ticketId },
    data: { checklist: [...existing, ...newItems] as unknown as object },
  })

  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}
