import 'server-only'
import { m365Configured, sendMail } from '@/app/lib/m365'

export interface ReminderEmailInput {
  toEmail: string
  toName: string
  title: string
  body: string | null
  actionUrl: string | null
  actionLabel?: string
  portalUrl: string | null
  notifyCount: number
}

export function buildReminderHtml(input: ReminderEmailInput): string {
  const greeting = `Hi ${input.toName},`
  const ordinal =
    input.notifyCount === 0
      ? ''
      : ` (reminder #${input.notifyCount + 1})`

  const actionButton = input.actionUrl
    ? `<p style="margin:16px 0"><a href="${escapeHtml(input.actionUrl)}" style="background:#F97316;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(input.actionLabel ?? 'Take Action')}</a></p>`
    : ''

  const portalLink = input.portalUrl
    ? `<p style="margin:12px 0;font-size:13px;color:#888"><a href="${escapeHtml(input.portalUrl)}" style="color:#F97316">View all your pending items →</a></p>`
    : ''

  const bodyText = input.body
    ? `<p style="margin:12px 0;color:#ccc;white-space:pre-wrap">${escapeHtml(input.body)}</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#1a1a2e;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
  <div style="background:#16213e;border:1px solid #333;border-radius:8px;padding:24px">
    <p style="margin:0 0 16px;color:#e0e0e0;font-size:15px">${escapeHtml(greeting)}</p>
    <h2 style="margin:0 0 8px;color:#F97316;font-size:18px">
      ${escapeHtml(input.title)}${ordinal}
    </h2>
    ${bodyText}
    ${actionButton}
    ${portalLink}
  </div>
  <p style="margin:16px 0 0;font-size:11px;color:#666;text-align:center">
    This is an automated reminder from PCC2K. Reply to this email if you have questions.
  </p>
</div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Send a reminder email. Returns null on success, error string on failure.
 */
export async function sendReminderEmail(
  input: ReminderEmailInput,
): Promise<string | null> {
  if (!m365Configured()) {
    return 'M365 not configured'
  }

  try {
    const subject = `Reminder: ${input.title}`
    const html = buildReminderHtml(input)

    await sendMail({
      to: [input.toEmail],
      subject,
      html,
      saveToSentItems: true,
    })

    return null
  } catch (e) {
    console.error('[reminder-email] send failed', e)
    return e instanceof Error ? e.message : 'Unknown error'
  }
}
