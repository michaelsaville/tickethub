'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

type TagResult = { ok: true } | { ok: false; error: string }

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export async function addTag(ticketId: string, tag: string): Promise<TagResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const trimmed = tag.trim().toLowerCase()
  if (!trimmed || trimmed.length > 50) return { ok: false, error: 'Invalid tag' }

  try {
    await prisma.tH_TicketTag.create({
      data: { ticketId, tag: trimmed },
    })
    revalidatePath(`/tickets/${ticketId}`)
    return { ok: true }
  } catch (e: any) {
    // Unique constraint — tag already exists on ticket
    if (e?.code === 'P2002') return { ok: true }
    return { ok: false, error: 'Failed to add tag' }
  }
}

export async function removeTag(ticketId: string, tag: string): Promise<TagResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  await prisma.tH_TicketTag.deleteMany({
    where: { ticketId, tag },
  })
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

/** Get all unique tags across all tickets (for autocomplete). */
export async function getAllTags(): Promise<string[]> {
  const rows = await prisma.tH_TicketTag.findMany({
    distinct: ['tag'],
    select: { tag: true },
    orderBy: { tag: 'asc' },
    take: 200,
  })
  return rows.map((r) => r.tag)
}
