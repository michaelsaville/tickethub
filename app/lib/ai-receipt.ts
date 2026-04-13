import { getAnthropic, AI_MODEL } from './ai'

export type ReceiptLineItem = {
  description: string
  quantity: number | null
  unitPriceCents: number | null
  totalCents: number | null
}

export type ReceiptScanResult = {
  vendor: string | null
  /** ISO yyyy-mm-dd if parseable from the receipt, else null. */
  date: string | null
  currency: string | null
  subtotalCents: number | null
  taxCents: number | null
  totalCents: number | null
  lineItems: ReceiptLineItem[]
  notes: string | null
}

const SYSTEM_PROMPT = `You extract structured data from photos of paper receipts.

Return ONLY a JSON object matching this TypeScript type — no prose, no markdown
fences, no commentary:

{
  "vendor": string | null,         // store/merchant name as printed
  "date": string | null,           // ISO yyyy-mm-dd of the transaction, null if unreadable
  "currency": string | null,       // ISO 4217 (e.g. "USD"), null if unknown
  "subtotalCents": number | null,  // integer cents
  "taxCents": number | null,       // integer cents
  "totalCents": number | null,     // integer cents — the grand total the customer paid
  "lineItems": Array<{
    "description": string,
    "quantity": number | null,
    "unitPriceCents": number | null,
    "totalCents": number | null
  }>,
  "notes": string | null           // anything noteworthy: payment method, tip, card last4, etc.
}

Rules:
- All money values are integer CENTS. $12.99 → 1299. Never return dollars.
- If a field is unreadable, use null. Never guess.
- If the image is not a receipt, return every field as null and lineItems: [].
- Keep the response under 4 KB.`

function parseResultText(text: string): ReceiptScanResult {
  // Strip any accidental markdown fencing before parsing.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const raw = JSON.parse(cleaned) as Partial<ReceiptScanResult> & {
    lineItems?: Partial<ReceiptLineItem>[]
  }
  const toIntOrNull = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    return Math.round(v)
  }
  const toStrOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null
  return {
    vendor: toStrOrNull(raw.vendor),
    date: toStrOrNull(raw.date),
    currency: toStrOrNull(raw.currency),
    subtotalCents: toIntOrNull(raw.subtotalCents),
    taxCents: toIntOrNull(raw.taxCents),
    totalCents: toIntOrNull(raw.totalCents),
    notes: toStrOrNull(raw.notes),
    lineItems: Array.isArray(raw.lineItems)
      ? raw.lineItems.slice(0, 50).map((li) => ({
          description: toStrOrNull(li?.description) ?? '',
          quantity:
            typeof li?.quantity === 'number' && Number.isFinite(li.quantity)
              ? li.quantity
              : null,
          unitPriceCents: toIntOrNull(li?.unitPriceCents),
          totalCents: toIntOrNull(li?.totalCents),
        }))
      : [],
  }
}

const SUPPORTED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

export async function scanReceipt(
  imageBase64: string,
  mimeType: string,
): Promise<ReceiptScanResult> {
  const mediaType = SUPPORTED_MEDIA_TYPES.has(mimeType) ? mimeType : 'image/jpeg'
  const client = await getAnthropic()
  const resp = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as
                | 'image/jpeg'
                | 'image/png'
                | 'image/gif'
                | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Extract the receipt as JSON per the schema.',
          },
        ],
      },
    ],
  })
  const textBlock = resp.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text block in Claude response')
  }
  try {
    return parseResultText(textBlock.text)
  } catch (e) {
    console.error('[ai-receipt] parse failed', e, textBlock.text.slice(0, 500))
    throw new Error('Could not parse receipt data from model output')
  }
}
