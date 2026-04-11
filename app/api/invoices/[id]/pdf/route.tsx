import type { ReactElement } from 'react'
import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { InvoicePdf, type InvoicePdfData } from '@/app/lib/pdf/InvoicePdf'

// Force the Node runtime — @react-pdf/renderer needs Node's Buffer +
// fs-level font loading, not the Edge runtime.
export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const invoice = await prisma.tH_Invoice.findUnique({
    where: { id },
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
    return NextResponse.json(
      { data: null, error: 'Not found' },
      { status: 404 },
    )
  }

  const data: InvoicePdfData = {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
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
    // InvoicePdf returns a <Document>. Call it as a function to get a
    // Document element directly — @react-pdf/renderer's renderToBuffer
    // expects ReactElement<DocumentProps>, not an arbitrary component
    // wrapper. This also avoids the React error #31 that can come from
    // the new JSX transform producing incompatible element shapes.
    const element = InvoicePdf({ data }) as ReactElement<DocumentProps>
    const buffer = await renderToBuffer(element)
    const download = req.nextUrl.searchParams.get('download') === '1'
    const filename = `invoice-${invoice.invoiceNumber}.pdf`
    return new NextResponse(
      new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      },
    )
  } catch (e) {
    console.error('[api/invoices/pdf] render failed', e)
    return NextResponse.json(
      {
        data: null,
        error: `Failed to render PDF: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    )
  }
}
