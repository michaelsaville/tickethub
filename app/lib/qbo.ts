import { prisma } from '@/app/lib/prisma'
import { getConfig } from '@/app/lib/settings'

// ─── Configuration ─────────────────────────────────────────────────────────

const QBO_AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2'
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

export async function qboConfigured(): Promise<boolean> {
  const [clientId, clientSecret] = await Promise.all([
    getConfig('QBO_CLIENT_ID'),
    getConfig('QBO_CLIENT_SECRET'),
  ])
  return !!(clientId && clientSecret)
}

export function getQboBaseUrl(): string {
  return process.env.QBO_ENVIRONMENT === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com'
}

// ─── OAuth helpers ─────────────────────────────────────────────────────────

export async function getAuthUrl(state: string): Promise<string> {
  const clientId = await getConfig('QBO_CLIENT_ID')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: process.env.QBO_REDIRECT_URI!,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  })
  return `${QBO_AUTH_BASE}/authorize?${params.toString()}`
}

async function basicAuth(): Promise<string> {
  const [clientId, clientSecret] = await Promise.all([
    getConfig('QBO_CLIENT_ID'),
    getConfig('QBO_CLIENT_SECRET'),
  ])
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

export async function exchangeCode(
  code: string,
  realmId: string,
): Promise<void> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${await basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QBO token exchange failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  await prisma.tH_QboToken.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      realmId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
    update: {
      realmId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  })
}

export async function refreshTokens(): Promise<void> {
  const token = await prisma.tH_QboToken.findUnique({
    where: { id: 'singleton' },
  })
  if (!token) throw new Error('No QBO tokens found — authorize first')

  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${await basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QBO token refresh failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  await prisma.tH_QboToken.update({
    where: { id: 'singleton' },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  })
}

// ─── Authenticated fetch ───────────────────────────────────────────────────

/**
 * Fetch from the QBO API with automatic token refresh.
 * `path` should start with `/v3/company/...` or similar.
 */
export async function qboFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await prisma.tH_QboToken.findUnique({
    where: { id: 'singleton' },
  })
  if (!token) throw new Error('No QBO tokens found — authorize first')

  // Refresh if within 5 minutes of expiry
  const FIVE_MIN = 5 * 60 * 1000
  if (token.expiresAt.getTime() - Date.now() < FIVE_MIN) {
    await refreshTokens()
  }

  // Re-read in case we just refreshed
  const current = await prisma.tH_QboToken.findUniqueOrThrow({
    where: { id: 'singleton' },
  })

  const base = getQboBaseUrl()
  const url = `${base}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${current.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  return res
}

// ─── Customer mapping ──────────────────────────────────────────────────────

interface QboClient {
  id: string
  name: string
  billingEmail?: string | null
  qboCustomerId?: string | null
}

export async function findOrCreateCustomer(
  client: QboClient,
): Promise<string> {
  // Return cached ID if present
  if (client.qboCustomerId) return client.qboCustomerId

  const token = await prisma.tH_QboToken.findUniqueOrThrow({
    where: { id: 'singleton' },
  })

  // Search for existing customer by display name
  const query = encodeURIComponent(
    `SELECT * FROM Customer WHERE DisplayName = '${client.name.replace(/'/g, "\\'")}'`,
  )
  const searchRes = await qboFetch(
    `/v3/company/${token.realmId}/query?query=${query}`,
  )
  const searchData = await searchRes.json()

  let qboCustomerId: string | undefined
  const customers = searchData?.QueryResponse?.Customer
  if (customers && customers.length > 0) {
    qboCustomerId = String(customers[0].Id)
  }

  // Create if not found
  if (!qboCustomerId) {
    const createRes = await qboFetch(
      `/v3/company/${token.realmId}/customer`,
      {
        method: 'POST',
        body: JSON.stringify({
          DisplayName: client.name,
          PrimaryEmailAddr: client.billingEmail
            ? { Address: client.billingEmail }
            : undefined,
        }),
      },
    )
    if (!createRes.ok) {
      const text = await createRes.text()
      throw new Error(`QBO create customer failed (${createRes.status}): ${text}`)
    }
    const createData = await createRes.json()
    qboCustomerId = String(createData.Customer.Id)
  }

  // Cache on TH_Client
  await prisma.tH_Client.update({
    where: { id: client.id },
    data: { qboCustomerId },
  })

  return qboCustomerId!
}

// ─── Invoice sync ──────────────────────────────────────────────────────────

/** Map TH_Charge type to a QBO SalesItemLineDetail item name */
function chargeTypeToQboItemName(type: string): string {
  switch (type) {
    case 'LABOR':
      return 'Labor'
    case 'PART':
      return 'Parts'
    case 'EXPENSE':
      return 'Expense'
    case 'CONTRACT_FEE':
      return 'Contract Fee'
    default:
      return 'Services'
  }
}

/**
 * Sync a TH_Invoice to QuickBooks Online.
 * Creates the invoice in QBO and stores the QBO invoice ID in externalRef.
 * Skips if externalRef is already set (already synced).
 * Returns the QBO invoice ID.
 */
export async function syncInvoice(invoiceId: string): Promise<string> {
  const invoice = await prisma.tH_Invoice.findUnique({
    where: { id: invoiceId },
    include: {
      charges: true,
      client: true,
    },
  })

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)
  if (invoice.externalRef) {
    return invoice.externalRef // already synced
  }

  const token = await prisma.tH_QboToken.findUniqueOrThrow({
    where: { id: 'singleton' },
  })

  // Find or create the QBO customer
  const qboCustomerId = await findOrCreateCustomer(invoice.client)

  // Map charges to QBO line items (cents -> dollars)
  const lines = invoice.charges.map((charge, idx) => ({
    LineNum: idx + 1,
    Amount: charge.totalPrice / 100, // cents to dollars
    DetailType: 'SalesItemLineDetail',
    Description: charge.description ?? chargeTypeToQboItemName(charge.type),
    SalesItemLineDetail: {
      ItemRef: { name: chargeTypeToQboItemName(charge.type) },
      Qty: charge.quantity,
      UnitPrice: charge.unitPrice / 100,
    },
  }))

  // Add tax line if applicable
  const body: Record<string, unknown> = {
    CustomerRef: { value: qboCustomerId },
    DocNumber: String(invoice.invoiceNumber),
    Line: lines,
    DueDate: invoice.dueDate?.toISOString().split('T')[0],
    CustomerMemo: invoice.notes ? { value: invoice.notes } : undefined,
  }

  // If there's tax, add TxnTaxDetail
  if (invoice.taxAmount > 0) {
    body.TxnTaxDetail = {
      TotalTax: invoice.taxAmount / 100,
    }
  }

  const createRes = await qboFetch(
    `/v3/company/${token.realmId}/invoice`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`QBO create invoice failed (${createRes.status}): ${text}`)
  }

  const createData = await createRes.json()
  const qboInvoiceId = String(createData.Invoice.Id)

  // Store QBO invoice ID in externalRef
  await prisma.tH_Invoice.update({
    where: { id: invoiceId },
    data: { externalRef: qboInvoiceId },
  })

  return qboInvoiceId
}

// ─── Payment status check ──────────────────────────────────────────────────

/**
 * Fetch the QBO invoice and check if it's fully paid (Balance === 0).
 * Updates TH_Invoice.paidAt if fully paid and not already set.
 */
export async function checkPaymentStatus(invoiceId: string): Promise<{
  paid: boolean
  balance: number
}> {
  const invoice = await prisma.tH_Invoice.findUnique({
    where: { id: invoiceId },
  })
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)
  if (!invoice.externalRef) {
    throw new Error(`Invoice ${invoiceId} has not been synced to QBO`)
  }

  const token = await prisma.tH_QboToken.findUniqueOrThrow({
    where: { id: 'singleton' },
  })

  const res = await qboFetch(
    `/v3/company/${token.realmId}/invoice/${invoice.externalRef}`,
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QBO fetch invoice failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  const balance = data.Invoice.Balance ?? 0
  const paid = balance === 0

  if (paid && !invoice.paidAt) {
    await prisma.tH_Invoice.update({
      where: { id: invoiceId },
      data: {
        paidAt: new Date(),
        status: 'PAID',
      },
    })
  }

  return { paid, balance }
}
