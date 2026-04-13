import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

// GET /api/estimates/[id] — estimate detail
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, billingEmail: true, billingState: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      contract: { select: { id: true, name: true, type: true } },
      items: {
        include: { item: { select: { id: true, name: true, type: true, code: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(estimate)
}

// PATCH /api/estimates/[id] — update estimate (DRAFT only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const body = await req.json()

  const estimate = await prisma.tH_Estimate.findUnique({ where: { id }, select: { status: true } })
  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (estimate.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Can only edit DRAFT estimates' }, { status: 400 })
  }

  const data: any = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.contactId !== undefined) data.contactId = body.contactId || null
  if (body.contractId !== undefined) data.contractId = body.contractId || null
  if (body.validUntil !== undefined) data.validUntil = body.validUntil ? new Date(body.validUntil) : null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null

  const updated = await prisma.tH_Estimate.update({
    where: { id },
    data,
    include: {
      client: { select: { id: true, name: true } },
      items: { include: { item: true }, orderBy: { sortOrder: 'asc' } },
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/estimates/[id] — delete estimate (DRAFT only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const estimate = await prisma.tH_Estimate.findUnique({ where: { id }, select: { status: true } })
  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (estimate.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Can only delete DRAFT estimates' }, { status: 400 })
  }

  await prisma.tH_Estimate.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
