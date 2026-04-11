'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { notifyUser } from '@/app/lib/notify-server'

const VALID_MODES = ['ON_CALL', 'WORKING', 'OFF_DUTY'] as const

export type PrefsResult = { ok: true } | { ok: false; error: string }

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export async function updateNotificationPrefs(
  _prev: PrefsResult | null,
  formData: FormData,
): Promise<PrefsResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const mode = ((formData.get('mode') as string) ?? 'WORKING').toUpperCase()
  if (!VALID_MODES.includes(mode as (typeof VALID_MODES)[number])) {
    return { ok: false, error: 'Invalid mode' }
  }

  const ntfyTopicRaw = ((formData.get('ntfyTopic') as string) ?? '').trim()
  const pushoverRaw = ((formData.get('pushoverToken') as string) ?? '').trim()

  try {
    await prisma.tH_User.update({
      where: { id: userId },
      data: {
        notificationMode: mode,
        ntfyTopic: ntfyTopicRaw || null,
        pushoverToken: pushoverRaw || null,
      },
    })
    revalidatePath('/settings/notifications')
    return { ok: true }
  } catch (e) {
    console.error('[actions/notification-prefs] save failed', e)
    return { ok: false, error: 'Failed to save preferences' }
  }
}

export async function sendTestNotification(): Promise<PrefsResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    await notifyUser(userId, {
      title: 'TicketHub test',
      body: `Test notification sent at ${new Date().toLocaleString()}. If you see this, push is working.`,
      priority: 'normal',
      category: 'TEST',
      url: `${process.env.NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com'}/settings/notifications`,
    })
    return { ok: true }
  } catch (e) {
    console.error('[actions/notification-prefs] test failed', e)
    return { ok: false, error: 'Test send failed — check server logs' }
  }
}
