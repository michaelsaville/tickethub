/**
 * Notification dispatch — ntfy (self-hosted) for routine alerts,
 * Pushover for critical/P1 alerts that must break through Do Not Disturb.
 * See PLANNING.md §12.
 */

import { getConfig } from '@/app/lib/settings'

export type NotificationPriority = 'normal' | 'high' | 'critical'

export interface NotifyInput {
  title: string
  body: string
  priority?: NotificationPriority
  url?: string
  /** ntfy topic, usually `tickethub-{userId}` */
  ntfyTopic?: string | null
  /** Pushover per-user key */
  pushoverUserKey?: string | null
}

export async function sendNtfy(input: NotifyInput): Promise<void> {
  const { ntfyTopic, title, body, priority = 'normal', url } = input
  const base = process.env.NTFY_URL
  if (!base || !ntfyTopic) return

  const headers: Record<string, string> = {
    Title: title,
    Priority: priority === 'critical' ? '5' : priority === 'high' ? '4' : '3',
  }
  if (url) headers.Click = url
  const authToken = process.env.NTFY_AUTH_TOKEN
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  try {
    await fetch(`${base.replace(/\/$/, '')}/${ntfyTopic}`, {
      method: 'POST',
      headers,
      body,
    })
  } catch (e) {
    console.error('[notifications] ntfy failed', e)
  }
}

export async function sendPushover(input: NotifyInput): Promise<void> {
  const { pushoverUserKey, title, body, priority = 'normal', url } = input
  const appToken = await getConfig('PUSHOVER_APP_TOKEN')
  if (!appToken || !pushoverUserKey) return

  const pushoverPriority =
    priority === 'critical' ? 2 : priority === 'high' ? 1 : 0

  const payload = new URLSearchParams({
    token: appToken,
    user: pushoverUserKey,
    title,
    message: body,
    priority: String(pushoverPriority),
  })
  if (url) payload.set('url', url)
  // priority=2 requires retry/expire
  if (pushoverPriority === 2) {
    payload.set('retry', '60')
    payload.set('expire', '3600')
  }

  try {
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    })
  } catch (e) {
    console.error('[notifications] pushover failed', e)
  }
}

/**
 * Dispatch to all configured channels. Critical priority goes to both.
 * Routine goes to ntfy only.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const tasks: Promise<void>[] = [sendNtfy(input)]
  if (input.priority === 'critical' || input.priority === 'high') {
    tasks.push(sendPushover(input))
  }
  await Promise.all(tasks)
}
