import { NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { qboConfigured, syncInvoice } from '@/app/lib/qbo'

export async function POST(req: Request) {
  const { error } = await requireAuth('TICKETHUB_ADMIN')
  if (error) return error

  if (!(await qboConfigured())) {
    return NextResponse.json(
      { error: 'QBO integration is not configured' },
      { status: 500 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body?.invoiceId || typeof body.invoiceId !== 'string') {
    return NextResponse.json(
      { error: 'Missing invoiceId in request body' },
      { status: 400 },
    )
  }

  try {
    const qboInvoiceId = await syncInvoice(body.invoiceId)
    return NextResponse.json({ success: true, qboInvoiceId })
  } catch (e: any) {
    console.error('QBO invoice sync failed:', e)
    return NextResponse.json(
      { error: e.message ?? 'Sync failed' },
      { status: 500 },
    )
  }
}
