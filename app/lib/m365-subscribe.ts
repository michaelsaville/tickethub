import 'server-only'
import { graphFetch, m365Configured, senderUpn } from '@/app/lib/m365'

/**
 * Graph change-notification subscription management. One subscription
 * per deployment, on `users/{accountingUPN}/mailFolders('inbox')/messages`
 * with changeType=created. Renewed by /api/cron/m365-subscription-renew.
 *
 * Outlook message subscriptions max out at 4230 minutes (70.5 hours)
 * before Graph rejects the expiry. We ask for 4200 minutes (70 hours)
 * each time to leave a safety margin, and renew whenever the active
 * subscription is within 24h of expiring.
 */

const MAX_EXPIRY_MINUTES = 4200
const RENEW_IF_EXPIRES_WITHIN_MS = 24 * 60 * 60 * 1000

interface GraphSubscription {
  id: string
  resource: string
  changeType: string
  notificationUrl: string
  expirationDateTime: string
  clientState?: string
}

function notificationUrl(): string {
  const base = process.env.APP_BASE_URL ?? 'https://tickethub.pcc2k.com'
  return `${base.replace(/\/$/, '')}/api/webhooks/m365/email`
}

function inboxResource(): string {
  return `/users/${encodeURIComponent(senderUpn())}/mailFolders('Inbox')/messages`
}

function computeExpiration(): string {
  return new Date(Date.now() + MAX_EXPIRY_MINUTES * 60_000).toISOString()
}

export function subscriptionClientState(): string {
  const s = process.env.M365_WEBHOOK_SECRET
  if (!s) throw new Error('M365_WEBHOOK_SECRET not set')
  return s
}

async function listOurSubscriptions(): Promise<GraphSubscription[]> {
  const url = notificationUrl()
  const res = await graphFetch('/subscriptions')
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph list subscriptions failed: ${res.status} ${text}`)
  }
  const json = (await res.json()) as { value: GraphSubscription[] }
  // Filter client-side — Graph doesn't reliably support $filter on
  // notificationUrl for all tenants.
  return (json.value ?? []).filter((s) => s.notificationUrl === url)
}

async function createSubscription(): Promise<GraphSubscription> {
  const res = await graphFetch('/subscriptions', {
    method: 'POST',
    body: {
      changeType: 'created',
      notificationUrl: notificationUrl(),
      resource: inboxResource(),
      expirationDateTime: computeExpiration(),
      clientState: subscriptionClientState(),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph create subscription failed: ${res.status} ${text}`)
  }
  return (await res.json()) as GraphSubscription
}

async function renewSubscription(id: string): Promise<GraphSubscription> {
  const res = await graphFetch(`/subscriptions/${id}`, {
    method: 'PATCH',
    body: { expirationDateTime: computeExpiration() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph renew subscription failed: ${res.status} ${text}`)
  }
  return (await res.json()) as GraphSubscription
}

export interface SubscribeResult {
  action: 'created' | 'renewed' | 'ok' | 'skipped'
  subscriptionId?: string
  expiresAt?: string
  reason?: string
}

/**
 * Idempotent entry point — creates the subscription if none exists,
 * renews if it's close to expiring, or no-ops otherwise. Also cleans up
 * duplicates (keeps the longest-lived one).
 */
export async function ensureInboxSubscription(): Promise<SubscribeResult> {
  if (!m365Configured()) {
    return { action: 'skipped', reason: 'm365 not configured' }
  }
  if (!process.env.M365_WEBHOOK_SECRET) {
    return { action: 'skipped', reason: 'M365_WEBHOOK_SECRET not set' }
  }

  const ours = await listOurSubscriptions()
  if (ours.length === 0) {
    const sub = await createSubscription()
    return {
      action: 'created',
      subscriptionId: sub.id,
      expiresAt: sub.expirationDateTime,
    }
  }

  // Dedupe: keep the one with the latest expiry, delete the others.
  ours.sort(
    (a, b) =>
      new Date(b.expirationDateTime).getTime() -
      new Date(a.expirationDateTime).getTime(),
  )
  const keeper = ours[0]
  for (const extra of ours.slice(1)) {
    await graphFetch(`/subscriptions/${extra.id}`, { method: 'DELETE' }).catch(
      () => null,
    )
  }

  const expMs = new Date(keeper.expirationDateTime).getTime()
  if (expMs - Date.now() < RENEW_IF_EXPIRES_WITHIN_MS) {
    const renewed = await renewSubscription(keeper.id)
    return {
      action: 'renewed',
      subscriptionId: renewed.id,
      expiresAt: renewed.expirationDateTime,
    }
  }

  return {
    action: 'ok',
    subscriptionId: keeper.id,
    expiresAt: keeper.expirationDateTime,
  }
}
