import 'server-only'
import { graphFetch, m365Configured, inboundMailboxes } from '@/app/lib/m365'

/**
 * Graph change-notification subscription management. One subscription
 * per monitored mailbox, on
 * `users/{upn}/mailFolders('Inbox')/messages` with changeType=created.
 * Renewed by /api/cron/m365-subscription-renew.
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

function inboxResource(upn: string): string {
  return `/users/${encodeURIComponent(upn)}/mailFolders('Inbox')/messages`
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

async function createSubscription(upn: string): Promise<GraphSubscription> {
  const res = await graphFetch('/subscriptions', {
    method: 'POST',
    body: {
      changeType: 'created',
      notificationUrl: notificationUrl(),
      resource: inboxResource(upn),
      expirationDateTime: computeExpiration(),
      clientState: subscriptionClientState(),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph create subscription failed (${upn}): ${res.status} ${text}`)
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
  mailbox?: string
  subscriptionId?: string
  expiresAt?: string
  reason?: string
}

/**
 * In-memory map from Graph subscription ID → mailbox UPN.
 * Populated by ensureInboxSubscriptions() and queried by the webhook
 * to resolve which mailbox a notification belongs to (Graph sends a
 * user GUID in the resource, not the UPN we subscribed with).
 */
const subscriptionMailboxMap = new Map<string, string>()

/**
 * Look up the mailbox for a subscription ID. On first call after
 * process start the map will be empty — hydrate it from Graph.
 */
let hydratePromise: Promise<void> | null = null

export async function mailboxForSubscription(
  subscriptionId: string,
): Promise<string | null> {
  if (subscriptionMailboxMap.size === 0 && !hydratePromise) {
    hydratePromise = hydrateSubscriptionMap()
  }
  if (hydratePromise) await hydratePromise
  return subscriptionMailboxMap.get(subscriptionId) ?? null
}

/**
 * Fetch all our subscriptions from Graph and populate the map by
 * parsing the UPN out of each subscription's resource field.
 */
async function hydrateSubscriptionMap(): Promise<void> {
  try {
    if (!m365Configured()) return
    const url = (() => {
      const base = process.env.APP_BASE_URL ?? 'https://tickethub.pcc2k.com'
      return `${base.replace(/\/$/, '')}/api/webhooks/m365/email`
    })()
    const res = await graphFetch('/subscriptions')
    if (!res.ok) return
    const json = (await res.json()) as { value: GraphSubscription[] }
    const ours = (json.value ?? []).filter((s) => s.notificationUrl === url)
    for (const sub of ours) {
      // resource looks like /users/helpdesk%40pcc2k.com/mailFolders('Inbox')/messages
      const match = sub.resource.match(/\/users\/([^/]+)\//)
      if (match) {
        subscriptionMailboxMap.set(sub.id, decodeURIComponent(match[1]))
      }
    }
    console.log(
      '[m365-subscribe] hydrated subscription map:',
      Object.fromEntries(subscriptionMailboxMap),
    )
  } catch (e) {
    console.error('[m365-subscribe] failed to hydrate subscription map', e)
  }
}

/**
 * Manage a single mailbox subscription — create if missing, renew if
 * close to expiring, dedupe if multiples exist for this resource.
 */
async function ensureMailboxSubscription(
  upn: string,
  allSubs: GraphSubscription[],
): Promise<SubscribeResult> {
  const resource = inboxResource(upn)
  const matching = allSubs.filter((s) => s.resource === resource)

  if (matching.length === 0) {
    const sub = await createSubscription(upn)
    subscriptionMailboxMap.set(sub.id, upn)
    return {
      action: 'created',
      mailbox: upn,
      subscriptionId: sub.id,
      expiresAt: sub.expirationDateTime,
    }
  }

  // Dedupe: keep the one with the latest expiry, delete the others.
  matching.sort(
    (a, b) =>
      new Date(b.expirationDateTime).getTime() -
      new Date(a.expirationDateTime).getTime(),
  )
  const keeper = matching[0]
  for (const extra of matching.slice(1)) {
    await graphFetch(`/subscriptions/${extra.id}`, { method: 'DELETE' }).catch(
      () => null,
    )
  }

  const expMs = new Date(keeper.expirationDateTime).getTime()
  if (expMs - Date.now() < RENEW_IF_EXPIRES_WITHIN_MS) {
    const renewed = await renewSubscription(keeper.id)
    subscriptionMailboxMap.set(renewed.id, upn)
    return {
      action: 'renewed',
      mailbox: upn,
      subscriptionId: renewed.id,
      expiresAt: renewed.expirationDateTime,
    }
  }

  subscriptionMailboxMap.set(keeper.id, upn)
  return {
    action: 'ok',
    mailbox: upn,
    subscriptionId: keeper.id,
    expiresAt: keeper.expirationDateTime,
  }
}

/**
 * Idempotent entry point — ensures one subscription per monitored
 * mailbox. Creates missing ones, renews expiring ones, dedupes extras.
 */
export async function ensureInboxSubscriptions(): Promise<SubscribeResult[]> {
  if (!m365Configured()) {
    return [{ action: 'skipped', reason: 'm365 not configured' }]
  }
  if (!process.env.M365_WEBHOOK_SECRET) {
    return [{ action: 'skipped', reason: 'M365_WEBHOOK_SECRET not set' }]
  }

  const mailboxes = inboundMailboxes()
  if (mailboxes.length === 0) {
    return [{ action: 'skipped', reason: 'no inbound mailboxes configured' }]
  }

  // Fetch all our subscriptions once, then partition by mailbox.
  const allSubs = await listOurSubscriptions()

  const results: SubscribeResult[] = []
  for (const upn of mailboxes) {
    results.push(await ensureMailboxSubscription(upn, allSubs))
  }

  // Clean up subscriptions for mailboxes we no longer monitor.
  const activeResources = new Set(mailboxes.map((u) => inboxResource(u)))
  const orphans = allSubs.filter((s) => !activeResources.has(s.resource))
  for (const orphan of orphans) {
    await graphFetch(`/subscriptions/${orphan.id}`, { method: 'DELETE' }).catch(
      () => null,
    )
  }

  return results
}
