import 'server-only'
import { prisma } from '@/app/lib/prisma'
import { notify, type NotificationPriority } from '@/app/lib/notifications'

/**
 * Mode-aware per-user notification dispatch. Filters by the user's
 * notificationMode before fanning out to ntfy and/or Pushover.
 *
 * Modes (PLANNING.md §12):
 *   ON_CALL  → all notifications real-time
 *   WORKING  → assigned + SLA warnings only (default)
 *   OFF_DUTY → critical P1 only, Pushover only
 *
 * Never throws — notification failures should never break the action
 * that triggered them. Logs and returns.
 */
export async function notifyUser(
  userId: string,
  opts: {
    title: string
    body: string
    url?: string
    priority?: NotificationPriority
    /** Category helps the mode filter decide whether to deliver. */
    category?: 'ASSIGNED' | 'COMMENT' | 'SLA' | 'NEW_HIGH' | 'INFO' | 'TEST'
  },
): Promise<void> {
  try {
    const user = await prisma.tH_User.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        ntfyTopic: true,
        pushoverToken: true,
        notificationMode: true,
      },
    })
    if (!user || !user.isActive) return

    const mode = (user.notificationMode ?? 'WORKING') as
      | 'ON_CALL'
      | 'WORKING'
      | 'OFF_DUTY'
    const priority = opts.priority ?? 'normal'
    const category = opts.category ?? 'INFO'

    // Decide deliverability by mode + category
    if (mode === 'OFF_DUTY' && priority !== 'critical') {
      // Only critical alerts break through OFF_DUTY
      return
    }
    if (mode === 'WORKING') {
      // Working mode suppresses generic INFO but keeps direct signals
      const allowed = new Set([
        'ASSIGNED',
        'SLA',
        'NEW_HIGH',
        'COMMENT',
        'TEST',
      ])
      if (!allowed.has(category) && priority === 'normal') return
    }

    const topic =
      user.ntfyTopic && user.ntfyTopic.trim()
        ? user.ntfyTopic.trim()
        : `tickethub-${user.id}`

    await notify({
      title: opts.title,
      body: opts.body,
      url: opts.url,
      priority,
      ntfyTopic: topic,
      pushoverUserKey: user.pushoverToken,
    })
  } catch (e) {
    console.error('[notify-server] dispatch failed', e)
  }
}

/** Dispatch to every admin (GLOBAL_ADMIN / TICKETHUB_ADMIN). */
export async function notifyAdmins(opts: {
  title: string
  body: string
  url?: string
  priority?: NotificationPriority
  category?: 'ASSIGNED' | 'COMMENT' | 'SLA' | 'NEW_HIGH' | 'INFO' | 'TEST'
}): Promise<void> {
  try {
    const admins = await prisma.tH_User.findMany({
      where: {
        isActive: true,
        role: { in: ['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'] },
      },
      select: { id: true },
    })
    await Promise.all(admins.map((a) => notifyUser(a.id, opts)))
  } catch (e) {
    console.error('[notify-server] notifyAdmins failed', e)
  }
}

export function ticketUrl(ticketId: string): string {
  const base = process.env.NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com'
  return `${base.replace(/\/$/, '')}/tickets/${ticketId}`
}
