import 'server-only'

/**
 * Microsoft 365 / Graph API app-only integration. Uses the client
 * credentials grant against the existing Entra ID app registration to
 * get a tenant-wide access token, then calls Graph sendMail on behalf
 * of a configured sender mailbox.
 *
 * REQUIRED ONE-TIME AZURE SETUP (done by a tenant admin):
 *   1. Azure Portal → App registrations → the TicketHub/DocHub app
 *   2. API permissions → Add a permission → Microsoft Graph →
 *      Application permissions → Mail.Send
 *   3. "Grant admin consent for <tenant>" (must be a Global Admin)
 *   4. Set M365_SENDER_UPN=billing@pcc2k.com on the container env
 *
 * HARDENING (recommended):
 *   Mail.Send (application) lets the app send as ANY mailbox in the
 *   tenant. Scope it to just the sender mailbox with an Exchange
 *   Application Access Policy:
 *     Connect-ExchangeOnline
 *     New-ApplicationAccessPolicy -AppId <clientId> `
 *       -PolicyScopeGroupId billing@pcc2k.com `
 *       -AccessRight RestrictAccess `
 *       -Description "Restrict TicketHub to billing mailbox only"
 */

interface TokenCache {
  accessToken: string
  expiresAt: number // epoch ms
}
let cachedToken: TokenCache | null = null

export function m365Configured(): boolean {
  return Boolean(
    process.env.AZURE_AD_TENANT_ID &&
      process.env.AZURE_AD_CLIENT_ID &&
      process.env.AZURE_AD_CLIENT_SECRET &&
      process.env.M365_SENDER_UPN,
  )
}

export function senderUpn(): string {
  return process.env.M365_SENDER_UPN ?? ''
}

async function getAppOnlyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken
  }
  const tenant = process.env.AZURE_AD_TENANT_ID
  const clientId = process.env.AZURE_AD_CLIENT_ID
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET
  if (!tenant || !clientId || !clientSecret) {
    throw new Error('Azure AD credentials not configured')
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`M365 token fetch failed: ${res.status} ${text}`)
  }
  const json = (await res.json()) as {
    access_token: string
    expires_in: number
    token_type: string
  }
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  return json.access_token
}

export interface MailAttachment {
  filename: string
  contentType: string
  contentBytes: string // base64
}

export interface SendMailInput {
  to: string[]
  cc?: string[]
  subject: string
  html: string
  attachments?: MailAttachment[]
  saveToSentItems?: boolean
}

/**
 * Send mail via Graph `/users/{sender}/sendMail`. Returns nothing on
 * success and throws on failure (route handler catches and surfaces).
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  if (!m365Configured()) {
    throw new Error('M365 not configured — set M365_SENDER_UPN and ensure Mail.Send application permission is granted')
  }
  const token = await getAppOnlyToken()
  const sender = senderUpn()

  const payload = {
    message: {
      subject: input.subject,
      body: { contentType: 'HTML', content: input.html },
      toRecipients: input.to.map((address) => ({
        emailAddress: { address },
      })),
      ccRecipients: (input.cc ?? []).map((address) => ({
        emailAddress: { address },
      })),
      attachments: (input.attachments ?? []).map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename,
        contentType: a.contentType,
        contentBytes: a.contentBytes,
      })),
    },
    saveToSentItems: input.saveToSentItems ?? true,
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph sendMail failed: ${res.status} ${text}`)
  }
}
