import type { ReactElement } from 'react'
import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { requireAuth } from '@/app/lib/api-auth'
import { QbrPdf, type QbrPdfData } from '@/app/lib/pdf/QbrPdf'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { error } = await requireAuth('TICKETHUB_ADMIN')
  if (error) return error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')

  if (!clientId || !start || !end) {
    return NextResponse.json(
      { error: 'clientId, start, and end required' },
      { status: 400 },
    )
  }

  // Fetch the same data as the JSON endpoint by calling it internally
  const dataUrl = new URL(`/api/reports/client-qbr?clientId=${clientId}&start=${start}&end=${end}`, req.url)
  const dataRes = await fetch(dataUrl.toString(), {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  })

  if (!dataRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch report data' }, { status: 500 })
  }

  const json = await dataRes.json()
  if (!json.data) {
    return NextResponse.json({ error: 'No data' }, { status: 404 })
  }

  const data: QbrPdfData = json.data

  const buf = await renderToBuffer(
    QbrPdf({ data }) as ReactElement<DocumentProps>,
  )

  const filename = `qbr-${data.client.shortCode ?? 'client'}-${start}-${end}.pdf`

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
