'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

type KbResult = { ok: true; id?: string } | { ok: false; error: string }

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

/**
 * Convert a resolved/closed ticket into a KB article.
 * Pre-fills title from ticket title, body from description + resolution comments.
 */
export async function convertTicketToKb(
  ticketId: string,
  input?: { title?: string; body?: string; tags?: string[] },
): Promise<KbResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      status: true,
      comments: {
        where: { isInternal: false },
        orderBy: { createdAt: 'asc' },
        select: { body: true, author: { select: { name: true } } },
      },
      tags: { select: { tag: true } },
    },
  })
  if (!ticket) return { ok: false, error: 'Ticket not found' }

  // Check if already converted
  const existing = await prisma.tH_KBArticle.findFirst({
    where: { sourceTicketId: ticketId },
    select: { id: true },
  })
  if (existing) return { ok: true, id: existing.id }

  // Build article body from ticket data
  const title = input?.title?.trim() || ticket.title
  const bodyParts: string[] = []
  if (ticket.description) {
    bodyParts.push('## Problem\n\n' + ticket.description)
  }
  if (ticket.comments.length > 0) {
    bodyParts.push('## Resolution\n\n' + ticket.comments.map((c) => c.body).join('\n\n'))
  }
  const body = input?.body?.trim() || bodyParts.join('\n\n') || ticket.title
  const tags = input?.tags ?? ticket.tags.map((t) => t.tag)

  const article = await prisma.tH_KBArticle.create({
    data: {
      title,
      body,
      tags,
      sourceTicketId: ticketId,
      authorId: userId,
    },
  })

  revalidatePath(`/tickets/${ticketId}`)
  revalidatePath('/kb')
  return { ok: true, id: article.id }
}

/** Delete a KB article. */
export async function deleteKbArticle(articleId: string): Promise<KbResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  await prisma.tH_KBArticle.delete({ where: { id: articleId } })
  revalidatePath('/kb')
  return { ok: true }
}

/** Update a KB article. */
export async function updateKbArticle(
  articleId: string,
  input: { title?: string; body?: string; tags?: string[]; isPublic?: boolean },
): Promise<KbResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  await prisma.tH_KBArticle.update({
    where: { id: articleId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
    },
  })

  revalidatePath('/kb')
  revalidatePath(`/kb/${articleId}`)
  return { ok: true }
}
