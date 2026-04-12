import 'server-only'

export function syncroConfigured(): boolean {
  return !!(process.env.SYNCRO_API_KEY && process.env.SYNCRO_SUBDOMAIN)
}

function baseUrl(): string {
  const subdomain = process.env.SYNCRO_SUBDOMAIN
  if (!subdomain) throw new Error('SYNCRO_SUBDOMAIN not set')
  return `https://${subdomain}.syncromsp.com/api/v1`
}

export async function syncroFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const apiKey = process.env.SYNCRO_API_KEY
  if (!apiKey) throw new Error('SYNCRO_API_KEY not set')

  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...init?.headers,
    },
  })
}

export interface SyncroEstimate {
  id: number
  name: string
  number: string
  customer_id: number
  customer_name: string
  status: string // 'draft' | 'sent' | 'approved' | 'declined'
  total: string  // dollar string e.g. "1234.56"
  created_at: string
  updated_at: string
}

/**
 * Fetch estimates from Syncro that are in 'sent' status (waiting for approval).
 * Paginated — fetches up to 3 pages (75 estimates).
 */
export async function getUnapprovedEstimates(): Promise<SyncroEstimate[]> {
  const all: SyncroEstimate[] = []
  for (let page = 1; page <= 3; page++) {
    const res = await syncroFetch(
      `/estimates?status=sent&page=${page}`,
    )
    if (!res.ok) {
      console.error(
        '[syncro] estimate fetch failed',
        res.status,
        await res.text().catch(() => ''),
      )
      break
    }
    const json = (await res.json()) as {
      estimates?: SyncroEstimate[]
      meta?: { total_pages?: number }
    }
    const estimates = json.estimates ?? []
    all.push(...estimates)
    if (!json.meta?.total_pages || page >= json.meta.total_pages) break
  }
  return all
}

/**
 * Get the customer-facing URL for a Syncro estimate.
 */
export function estimateUrl(estimateId: number): string {
  const subdomain = process.env.SYNCRO_SUBDOMAIN ?? ''
  return `https://${subdomain}.syncromsp.com/estimates/${estimateId}`
}
