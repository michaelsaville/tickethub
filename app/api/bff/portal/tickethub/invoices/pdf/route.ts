import type { ReactElement } from 'react'
import { NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { prisma } from '@/app/lib/prisma'
import { verifyPortalHmac } from '@/app/lib/bff-hmac'
import { InvoicePdf, type InvoicePdfData } from '@/app/lib/pdf/InvoicePdf'
import { getInvoiceTemplateConfig } from '@/app/lib/actions/invoice-template'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Portal-gated invoice PDF. Verifies HMAC, then verifies the invoice
 * belongs to the named client before rendering and streaming the PDF
 * back. DRAFT invoices are refused — portal never exposes drafts.
 */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get('x-portal-signature'),
    req.headers.get('x-portal-timestamp'),
    process.env.PORTAL_BFF_SECRET ?? '',
  )
  if (!verify.ok) {
    return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })
  }

  let payload: { clientName: string; invoiceId: string }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 })
  }
  if (!payload.clientName || !payload.invoiceId) {
    return NextResponse.json(
      { ok: false, error: 'clientName + invoiceId required' },
      { status: 400 },
    )
  }

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true },
  })
  if (!client) {
    return NextResponse.json({ ok: false, error: 'client not found' }, { status: 404 })
  }

  const invoice = await prisma.tH_Invoice.findFirst({
    where: {
      id: payload.invoiceId,
      clientId: client.id,
      deletedAt: null,
      status: { not: 'DRAFT' },
    },
    include: {
      client: { select: { name: true, billingState: true } },
      charges: {
        orderBy: { workDate: 'asc' },
        include: {
          item: { select: { name: true } },
          ticket: { select: { ticketNumber: true, title: true } },
        },
      },
    },
  })
  if (!invoice) {
    return NextResponse.json({ ok: false, error: 'invoice not found' }, { status: 404 })
  }

  const data: InvoicePdfData = {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    subtotal: invoice.subtotal,
    taxableSubtotal: invoice.taxableSubtotal,
    taxState: invoice.taxState,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    notes: invoice.notes,
    client: invoice.client,
    lineItems: invoice.charges.map((c) => ({
      itemName: c.item.name,
      description: c.description,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      totalPrice: c.totalPrice,
      timeChargedMinutes: c.timeChargedMinutes,
      ticket: c.ticket
        ? { ticketNumber: c.ticket.ticketNumber, title: c.ticket.title }
        : null,
    })),
  }

  try {
    const { config: templateConfig, logoUrl } = await getInvoiceTemplateConfig()
    const element = InvoicePdf({ data, templateConfig, logoUrl }) as ReactElement<DocumentProps>
    const buffer = await renderToBuffer(element)
    const filename = `invoice-${invoice.invoiceNumber}.pdf`
    return new NextResponse(
      new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(buffer.length),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      },
    )
  } catch (e) {
    console.error('[bff portal invoices/pdf] render failed', e)
    return NextResponse.json(
      { ok: false, error: 'Failed to render PDF' },
      { status: 500 },
    )
  }
}
