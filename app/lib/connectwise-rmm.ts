import 'server-only'
import { getConfig } from '@/app/lib/settings'

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface CwRmmDevice {
  id: string
  hostname: string
  description?: string
  siteId?: string
  siteName?: string
  operatingSystem?: string
  lastSeen?: string
  status?: string
  ipAddress?: string
  macAddress?: string
  serialNumber?: string
}

export interface CwRmmAlert {
  alertId: string
  alertType: string
  severity: 'critical' | 'warning' | 'info'
  deviceId: string
  deviceName: string
  siteName: string
  message: string
  timestamp: string
  diagnostics?: string
}

// ─── CONFIG ───────────────────────────────────────────────────────────────

/** Returns true when the minimum credentials are present for API calls. */
export async function cwRmmConfigured(): Promise<boolean> {
  const [apiKey, baseUrl] = await Promise.all([
    getConfig('CONNECTWISE_RMM_API_KEY'),
    getConfig('CONNECTWISE_RMM_BASE_URL'),
  ])
  return !!(apiKey && baseUrl)
}

/** Returns true when the webhook secret is set (inbound alert handler). */
export async function cwRmmWebhookConfigured(): Promise<boolean> {
  const secret = await getConfig('CONNECTWISE_RMM_WEBHOOK_SECRET')
  return !!secret
}

// ─── AUTHENTICATED FETCH ──────────────────────────────────────────────────

/**
 * Authenticated fetch against the ConnectWise RMM API.
 * Adds Apikey header and Content-Type automatically.
 */
export async function cwRmmFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const [rawBaseUrl, apiKey] = await Promise.all([
    getConfig('CONNECTWISE_RMM_BASE_URL'),
    getConfig('CONNECTWISE_RMM_API_KEY'),
  ])
  const baseUrl = rawBaseUrl.replace(/\/$/, '')
  if (!baseUrl || !apiKey) {
    throw new Error('ConnectWise RMM API not configured')
  }

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Apikey: apiKey,
      ...(init?.headers ?? {}),
    },
  })
}

// ─── API HELPERS ──────────────────────────────────────────────────────────

/** List devices, optionally scoped to a site. */
export async function getDevices(siteId?: string): Promise<CwRmmDevice[]> {
  const path = siteId
    ? `/v1/sites/${encodeURIComponent(siteId)}/devices`
    : '/v1/devices'
  const res = await cwRmmFetch(path)
  if (!res.ok) {
    console.error('[cw-rmm] getDevices failed', res.status, await res.text().catch(() => ''))
    return []
  }
  return (await res.json()) as CwRmmDevice[]
}

/** Get a single device by ID. */
export async function getDevice(
  deviceId: string,
): Promise<CwRmmDevice | null> {
  const res = await cwRmmFetch(`/v1/devices/${encodeURIComponent(deviceId)}`)
  if (!res.ok) {
    console.error('[cw-rmm] getDevice failed', res.status, await res.text().catch(() => ''))
    return null
  }
  return (await res.json()) as CwRmmDevice
}

/** List active alerts. */
export async function getAlerts(): Promise<CwRmmAlert[]> {
  const res = await cwRmmFetch('/v1/alerts')
  if (!res.ok) {
    console.error('[cw-rmm] getAlerts failed', res.status, await res.text().catch(() => ''))
    return []
  }
  return (await res.json()) as CwRmmAlert[]
}
