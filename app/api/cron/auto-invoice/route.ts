import { NextResponse, type NextRequest } from 'next/server'
import { runAutoInvoiceSweep } from '@/app/lib/auto-invoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Daily sweep for contracts with `autoInvoiceEnabled=true` whose
 * `billingDayOfMonth` equals today's day-of-month in America/New_York.
 * Creates a DRAFT invoice per eligible contract; admin reviews and sends.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace(/^Bearer\s+/i, '')
  const secret = process.env.CRON_SECRET
  if (!secret || bearer !== secret) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  }

  const summary = await runAutoInvoiceSweep()
  return NextResponse.json({ data: summary, error: null })
}
