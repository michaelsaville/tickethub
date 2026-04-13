import { NextResponse, type NextRequest } from 'next/server'
import { ensureInboxSubscriptions } from '@/app/lib/m365-subscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Graph change-notification subscription renewer. Run every 6 hours via
// the host crontab (see README / michaels todo.md for the cron line).
// Outlook subscriptions max out at ~70h, so 6h intervals with a 24h
// pre-expiry renewal window means a single failed run can't miss the
// cliff. If this endpoint stops returning 200, check ntfy — the webhook
// will also stop firing.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace(/^Bearer\s+/i, '')
  const secret = process.env.CRON_SECRET
  if (!secret || bearer !== secret) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const results = await ensureInboxSubscriptions()
    return NextResponse.json({ data: results, error: null })
  } catch (e) {
    console.error('[cron/m365-subscription-renew] failed', e)
    return NextResponse.json(
      {
        data: null,
        error: e instanceof Error ? e.message : 'Renewal failed',
      },
      { status: 500 },
    )
  }
}
