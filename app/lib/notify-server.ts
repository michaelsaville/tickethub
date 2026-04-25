import 'server-only'
import { prisma } from '@/app/lib/prisma'
import { notify, sendNtfy, type NotificationPriority } from '@/app/lib/notifications'

/** Shared team topic — used when a user hasn't set a personal topic and
 *  for team-wide broadcasts (new high-priority tickets, SLA alerts). */
export const SHARED_TOPIC = process.env.NTFY_SHARED_TOPIC ?? 'tickethub'

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
  // In-app row first — written unconditionally regardless of notificationMode
  // so the bell still shows a record even when push delivery is suppressed
  // (OFF_DUTY mode, working-mode INFO suppression, etc.).
  try {
    await prisma.tH_Notification.create({
      data: {
        userId,
        type: opts.category ?? 'INFO',
        title: opts.title,
        body: opts.body,
        data: opts.url ? { url: opts.url } : undefined,
      },
    })
  } catch (e) {
    console.error('[notify-server] in-app write failed', e)
  }

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
        : SHARED_TOPIC

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

/**
 * Team-wide broadcast to the shared ntfy topic. Used for events that
 * matter to anyone on call — new urgent tickets, SLA alerts, etc.
 * A single POST regardless of how many admins exist.
 */
export async function notifyTeam(opts: {
  title: string
  body: string
  url?: string
  priority?: NotificationPriority
  /** Accepted for signature parity with notifyUser; ignored at dispatch. */
  category?: 'ASSIGNED' | 'COMMENT' | 'SLA' | 'NEW_HIGH' | 'INFO' | 'TEST'
}): Promise<void> {
  try {
    await sendNtfy({
      title: opts.title,
      body: opts.body,
      url: opts.url,
      priority: opts.priority ?? 'normal',
      ntfyTopic: SHARED_TOPIC,
    })
  } catch (e) {
    console.error('[notify-server] notifyTeam failed', e)
  }
}

/** Back-compat alias — admin fan-out now goes to the shared topic. */
export const notifyAdmins = notifyTeam

/**
 * Page whoever is currently on the on-call rotation. Falls back to the
 * shared team topic when nobody is on the schedule so urgent signal is
 * never lost. Always categorized as 'NEW_HIGH' so it pierces WORKING
 * mode but is still suppressed in OFF_DUTY unless explicitly critical.
 */
export async function notifyOnCall(opts: {
  title: string
  body: string
  url?: string
  priority?: NotificationPriority
}): Promise<{ deliveredTo: 'on_call' | 'team'; userId?: string }> {
  try {
    const { getCurrentOnCall } = await import('@/app/lib/on-call')
    const entry = await getCurrentOnCall()
    if (entry) {
      await notifyUser(entry.userId, {
        title: `[on-call] ${opts.title}`,
        body: opts.body,
        url: opts.url,
        priority: opts.priority ?? 'high',
        category: 'NEW_HIGH',
      })
      return { deliveredTo: 'on_call', userId: entry.userId }
    }
  } catch (e) {
    console.error('[notify-server] notifyOnCall lookup failed', e)
  }
  await notifyTeam({
    title: `[no-on-call] ${opts.title}`,
    body: opts.body,
    url: opts.url,
    priority: opts.priority ?? 'high',
  })
  return { deliveredTo: 'team' }
}

export function ticketUrl(ticketId: string): string {
  const base = process.env.NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com'
  return `${base.replace(/\/$/, '')}/tickets/${ticketId}`
}
