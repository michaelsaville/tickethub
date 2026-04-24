import type { ReactElement } from 'react'
import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { EstimatePdf, type EstimatePdfData } from '@/app/lib/pdf/EstimatePdf'
import { getInvoiceTemplateConfig } from '@/app/lib/actions/invoice-template'
import { getEstimateTemplateConfig } from '@/app/lib/actions/estimate-template'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, billingState: true } },
      contact: { select: { firstName: true, lastName: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { item: { select: { name: true, type: true } } },
      },
    },
  })

  if (!estimate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const data: EstimatePdfData = {
    estimateNumber: estimate.estimateNumber,
    status: estimate.status,
    createdAt: estimate.createdAt,
    validUntil: estimate.validUntil,
    title: estimate.title,
    description: estimate.description,
    subtotal: estimate.subtotal,
    taxState: estimate.taxState,
    taxRate: estimate.taxRate,
    taxAmount: estimate.taxAmount,
    totalAmount: estimate.totalAmount,
    notes: estimate.notes,
    client: estimate.client,
    contact: estimate.contact,
    lineItems: estimate.items.map(i => ({
      itemName: i.item.name,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
    })),
  }

  const [{ logoUrl }, { config: templateConfig }] = await Promise.all([
    getInvoiceTemplateConfig(),
    getEstimateTemplateConfig(),
  ])
  const element = EstimatePdf({ data, logoUrl, templateConfig }) as ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)

  const download = req.nextUrl.searchParams.get('download') === '1'
  return new NextResponse(
    new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="Estimate_${estimate.estimateNumber}.pdf"`,
      },
    }
  )
}
