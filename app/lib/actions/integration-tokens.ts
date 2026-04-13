'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { testTogglToken } from '@/app/lib/toggl'
import { testTodoistToken } from '@/app/lib/todoist'

type Result = { ok: true; message?: string } | { ok: false; error: string }

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export async function saveTogglToken(token: string): Promise<Result> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const trimmed = token.trim()
  await prisma.tH_User.update({
    where: { id: userId },
    data: { togglToken: trimmed || null },
  })
  revalidatePath('/settings/notifications')
  return { ok: true }
}

export async function testToggl(): Promise<Result> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const user = await prisma.tH_User.findUnique({
    where: { id: userId },
    select: { togglToken: true },
  })
  if (!user?.togglToken) return { ok: false, error: 'No Toggl token configured' }

  const name = await testTogglToken(user.togglToken)
  if (!name) return { ok: false, error: 'Invalid token or Toggl API unreachable' }
  return { ok: true, message: `Connected as ${name}` }
}

export async function saveTodoistToken(token: string): Promise<Result> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const trimmed = token.trim()
  await prisma.tH_User.update({
    where: { id: userId },
    data: { todoistToken: trimmed || null },
  })
  revalidatePath('/settings/notifications')
  return { ok: true }
}

export async function testTodoist(): Promise<Result> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const user = await prisma.tH_User.findUnique({
    where: { id: userId },
    select: { todoistToken: true },
  })
  if (!user?.todoistToken) return { ok: false, error: 'No Todoist token configured' }

  const name = await testTodoistToken(user.todoistToken)
  if (!name) return { ok: false, error: 'Invalid token or Todoist API unreachable' }
  return { ok: true, message: `Connected as ${name}` }
}
