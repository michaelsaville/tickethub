'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'

export type CannedReplyResult = { ok: true } | { ok: false; error: string }

export type CannedReplyDTO = {
  id: string
  key: string
  title: string
  body: string
  category: string | null
  isShared: boolean
  ownerId: string | null
  useCount: number
  isOwn: boolean
}

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,29}$/

async function getSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return session
}

export async function listCannedReplies(): Promise<CannedReplyDTO[]> {
  const session = await getSession()
  if (!session) return []
  const rows = await prisma.tH_CannedReply.findMany({
    where: {
      OR: [{ ownerId: session.user.id }, { isShared: true }],
    },
    orderBy: [{ useCount: 'desc' }, { title: 'asc' }],
    take: 250,
  })
  const myId = session.user.id
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    title: r.title,
    body: r.body,
    category: r.category,
    isShared: r.isShared,
    ownerId: r.ownerId,
    useCount: r.useCount,
    isOwn: r.ownerId === myId,
  }))
}

export async function createCannedReply(
  _prev: CannedReplyResult | null,
  formData: FormData,
): Promise<CannedReplyResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Unauthorized' }

  const key = (formData.get('key') as string | null)?.trim().toLowerCase() ?? ''
  const title = (formData.get('title') as string | null)?.trim() ?? ''
  const body = (formData.get('body') as string | null) ?? ''
  const category =
    ((formData.get('category') as string | null) ?? '').trim() || null
  const isShared = formData.get('isShared') === 'on'

  if (!KEY_RE.test(key)) {
    return {
      ok: false,
      error:
        'Key must be 1–30 chars: lowercase a–z, 0–9, hyphen or underscore (start with letter or digit)',
    }
  }
  if (!title) return { ok: false, error: 'Title is required' }
  if (!body.trim()) return { ok: false, error: 'Body is required' }
  if (title.length > 100) return { ok: false, error: 'Title is too long (100 max)' }
  if (body.length > 5000) return { ok: false, error: 'Body is too long (5000 max)' }
  if (category && category.length > 50) {
    return { ok: false, error: 'Category is too long (50 max)' }
  }

  if (isShared && !hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return { ok: false, error: 'Admin role required to create shared replies' }
  }

  try {
    await prisma.tH_CannedReply.create({
      data: {
        key,
        title,
        body,
        category,
        isShared,
        ownerId: isShared ? null : session.user.id,
      },
    })
    revalidatePath('/settings/canned-replies')
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unique constraint')) {
      return { ok: false, error: `Key "${key}" is already in use` }
    }
    console.error('[actions/canned-replies] create failed', e)
    return { ok: false, error: 'Failed to create canned reply' }
  }
}

export async function updateCannedReply(
  id: string,
  patch: {
    key?: string
    title?: string
    body?: string
    category?: string | null
    isShared?: boolean
  },
): Promise<CannedReplyResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Unauthorized' }

  const existing = await prisma.tH_CannedReply.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Not found' }

  const isAdmin = hasMinRole(session.user.role, 'TICKETHUB_ADMIN')
  if (!isAdmin && existing.ownerId !== session.user.id) {
    return { ok: false, error: 'You can only edit your own replies' }
  }
  if (
    patch.isShared !== undefined &&
    patch.isShared !== existing.isShared &&
    !isAdmin
  ) {
    return { ok: false, error: 'Admin role required to change shared flag' }
  }

  let nextKey: string | undefined
  if (patch.key !== undefined) {
    nextKey = patch.key.trim().toLowerCase()
    if (!KEY_RE.test(nextKey)) {
      return { ok: false, error: 'Invalid key format' }
    }
  }
  if (patch.title !== undefined) {
    const t = patch.title.trim()
    if (!t || t.length > 100) return { ok: false, error: 'Invalid title' }
  }
  if (patch.body !== undefined) {
    if (!patch.body.trim() || patch.body.length > 5000) {
      return { ok: false, error: 'Invalid body' }
    }
  }

  try {
    await prisma.tH_CannedReply.update({
      where: { id },
      data: {
        ...(nextKey !== undefined ? { key: nextKey } : {}),
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.category !== undefined
          ? { category: patch.category?.trim() || null }
          : {}),
        ...(patch.isShared !== undefined
          ? {
              isShared: patch.isShared,
              ownerId: patch.isShared ? null : session.user.id,
            }
          : {}),
      },
    })
    revalidatePath('/settings/canned-replies')
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unique constraint')) {
      return { ok: false, error: 'Key already in use' }
    }
    console.error('[actions/canned-replies] update failed', e)
    return { ok: false, error: 'Failed to update' }
  }
}

export async function deleteCannedReply(
  id: string,
): Promise<CannedReplyResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Unauthorized' }

  const existing = await prisma.tH_CannedReply.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: 'Not found' }

  const isAdmin = hasMinRole(session.user.role, 'TICKETHUB_ADMIN')
  if (!isAdmin && existing.ownerId !== session.user.id) {
    return { ok: false, error: 'You can only delete your own replies' }
  }

  try {
    await prisma.tH_CannedReply.delete({ where: { id } })
    revalidatePath('/settings/canned-replies')
    return { ok: true }
  } catch (e) {
    console.error('[actions/canned-replies] delete failed', e)
    return { ok: false, error: 'Failed to delete' }
  }
}

export async function incrementCannedReplyUse(id: string): Promise<void> {
  try {
    await prisma.tH_CannedReply.update({
      where: { id },
      data: { useCount: { increment: 1 } },
    })
  } catch {
    // Silent — useCount is for ranking only, never block on a failure.
  }
}
