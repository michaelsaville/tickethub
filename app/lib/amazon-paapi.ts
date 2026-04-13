/**
 * Amazon Product Advertising API 5.0 client
 *
 * Uses AWS Signature v4 signing (manual implementation, no external deps).
 * Caches prices in TH_AmazonPriceCache for 4 hours to stay within PA-API
 * rate limits and avoid redundant network calls.
 */

import crypto from 'crypto'
import { prisma } from '@/app/lib/prisma'
import { getConfig } from '@/app/lib/settings'

// ─── Config ──────────────────────────────────────────────────────────────

const PAAPI_HOST = 'webservices.amazon.com'
const PAAPI_REGION = 'us-east-1'
const PAAPI_SERVICE = 'ProductAdvertisingAPI'
const CACHE_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

async function getAmazonConfig() {
  const [accessKey, secretKey, partnerTag] = await Promise.all([
    getConfig('AMAZON_ACCESS_KEY'),
    getConfig('AMAZON_SECRET_KEY'),
    getConfig('AMAZON_PARTNER_TAG'),
  ])
  return {
    accessKey,
    secretKey,
    partnerTag,
    marketplace: process.env.AMAZON_MARKETPLACE ?? 'www.amazon.com',
  }
}

/** Returns true if all required PA-API credentials are set */
export async function amazonConfigured(): Promise<boolean> {
  const { accessKey, secretKey, partnerTag } = await getAmazonConfig()
  return !!(accessKey && secretKey && partnerTag)
}

// ─── Result type ─────────────────────────────────────────────────────────

export interface AmazonProduct {
  asin: string
  title: string
  priceCents: number
  imageUrl: string | null
  productUrl: string
}

// ─── AWS Signature v4 ────────────────────────────────────────────────────

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

/**
 * Signs a PA-API request using AWS Signature Version 4.
 * Returns headers needed for the authenticated request.
 */
function signRequest(
  payload: string,
  path: string,
  operation: string,
  accessKey: string,
  secretKey: string,
): Record<string, string> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dateStamp = amzDate.slice(0, 8)

  // Canonical headers (must be sorted by lowercase header name)
  const headers: Record<string, string> = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host: PAAPI_HOST,
    'x-amz-date': amzDate,
    'x-amz-target': `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`,
  }

  const signedHeaderKeys = Object.keys(headers).sort()
  const signedHeadersStr = signedHeaderKeys.join(';')

  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[k]}\n`)
    .join('')

  const payloadHash = sha256Hex(payload)

  const canonicalRequest = [
    'POST',
    path,
    '', // no query string
    canonicalHeaders,
    signedHeadersStr,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${PAAPI_REGION}/${PAAPI_SERVICE}/aws4_request`

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  // Derive signing key
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp)
  const kRegion = hmacSha256(kDate, PAAPI_REGION)
  const kService = hmacSha256(kRegion, PAAPI_SERVICE)
  const kSigning = hmacSha256(kService, 'aws4_request')

  const signature = hmacSha256(kSigning, stringToSign).toString('hex')

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`

  return {
    ...headers,
    Authorization: authorization,
  }
}

// ─── PA-API calls ────────────────────────────────────────────────────────

/** Convert Amazon price (dollars as float) to cents (integer) */
function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

async function paapiFetch(
  path: string,
  operation: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { accessKey, secretKey } = await getAmazonConfig()
  const payload = JSON.stringify(body)
  const headers = signRequest(payload, path, operation, accessKey, secretKey)

  const url = `https://${PAAPI_HOST}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: payload,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[amazon-paapi] ${operation} ${res.status}: ${text}`)
    throw new Error(`PA-API ${operation} failed: ${res.status}`)
  }

  return res.json()
}

/**
 * Look up a single product by ASIN. Returns product info or null if not found.
 * Result is cached in TH_AmazonPriceCache.
 */
export async function getItemByAsin(
  asin: string,
): Promise<AmazonProduct | null> {
  const { partnerTag, marketplace } = await getAmazonConfig()

  const body = {
    ItemIds: [asin],
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Marketplace: marketplace,
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'Images.Primary.Large',
      'ItemInfo.ExternalIds',
    ],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await paapiFetch('/paapi5/getitems', 'GetItems', body)) as any

  const item = data?.ItemsResult?.Items?.[0]
  if (!item) return null

  const title = item.ItemInfo?.Title?.DisplayValue ?? asin
  const priceAmount =
    item.Offers?.Listings?.[0]?.Price?.Amount ??
    item.Offers?.Listings?.[0]?.Price?.DisplayAmount
  const priceCents =
    typeof priceAmount === 'number' ? dollarsToCents(priceAmount) : 0
  const imageUrl = item.Images?.Primary?.Large?.URL ?? null
  const productUrl = item.DetailPageURL ?? `https://www.amazon.com/dp/${asin}`

  const result: AmazonProduct = {
    asin,
    title,
    priceCents,
    imageUrl,
    productUrl,
  }

  // Upsert into cache
  await prisma.tH_AmazonPriceCache.upsert({
    where: { asin },
    update: {
      title,
      price: priceCents,
      imageUrl,
      productUrl,
      fetchedAt: new Date(),
    },
    create: {
      asin,
      title,
      price: priceCents,
      imageUrl,
      productUrl,
    },
  })

  return result
}

/**
 * Search Amazon for products by keyword.
 * Returns up to 10 results.
 */
export async function searchItems(
  keywords: string,
  category?: string,
): Promise<AmazonProduct[]> {
  const { partnerTag, marketplace } = await getAmazonConfig()

  const body: Record<string, unknown> = {
    Keywords: keywords,
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Marketplace: marketplace,
    ItemCount: 10,
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'Images.Primary.Large',
    ],
  }

  if (category) {
    body.SearchIndex = category
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await paapiFetch(
    '/paapi5/searchitems',
    'SearchItems',
    body,
  )) as any

  const items = data?.SearchResult?.Items ?? []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return items.map((item: any) => {
    const priceAmount =
      item.Offers?.Listings?.[0]?.Price?.Amount ??
      item.Offers?.Listings?.[0]?.Price?.DisplayAmount
    return {
      asin: item.ASIN,
      title: item.ItemInfo?.Title?.DisplayValue ?? item.ASIN,
      priceCents:
        typeof priceAmount === 'number' ? dollarsToCents(priceAmount) : 0,
      imageUrl: item.Images?.Primary?.Large?.URL ?? null,
      productUrl:
        item.DetailPageURL ?? `https://www.amazon.com/dp/${item.ASIN}`,
    } satisfies AmazonProduct
  })
}

/**
 * Returns cached price if less than 4 hours old, otherwise fetches fresh.
 * Returns null if ASIN not found on Amazon.
 */
export async function getCachedPrice(
  asin: string,
): Promise<AmazonProduct | null> {
  const cached = await prisma.tH_AmazonPriceCache.findUnique({
    where: { asin },
  })

  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return {
      asin: cached.asin,
      title: cached.title,
      priceCents: cached.price,
      imageUrl: cached.imageUrl,
      productUrl: cached.productUrl,
    }
  }

  // Cache miss or stale — fetch fresh
  if (!(await amazonConfigured())) {
    // If not configured, return stale cache if available
    if (cached) {
      return {
        asin: cached.asin,
        title: cached.title,
        priceCents: cached.price,
        imageUrl: cached.imageUrl,
        productUrl: cached.productUrl,
      }
    }
    return null
  }

  return getItemByAsin(asin)
}
