import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  void session

  const { id } = await params
  const client = await prisma.tH_Client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }] },
      sites: { orderBy: { name: 'asc' } },
      contracts: { orderBy: [{ isGlobal: 'desc' }, { createdAt: 'desc' }] },
      tickets: {
        where: {
          status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
          deletedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      },
    },
  })
  if (!client) {
    return NextResponse.json(
      { data: null, error: 'Not found' },
      { status: 404 },
    )
  }
  return NextResponse.json({ data: client, error: null })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  void session

  const { id } = await params
  let body: {
    name?: string
    shortCode?: string | null
    internalNotes?: string | null
    isActive?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Invalid JSON' },
      { status: 400 },
    )
  }

  try {
    const updated = await prisma.tH_Client.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.shortCode !== undefined
          ? { shortCode: body.shortCode?.trim().toUpperCase() || null }
          : {}),
        ...(body.internalNotes !== undefined
          ? { internalNotes: body.internalNotes?.trim() || null }
          : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    })
    return NextResponse.json({ data: updated, error: null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unique constraint') && msg.includes('shortCode')) {
      return NextResponse.json(
        { data: null, error: 'Short code already in use' },
        { status: 409 },
      )
    }
    if (msg.includes('Record to update not found')) {
      return NextResponse.json(
        { data: null, error: 'Not found' },
        { status: 404 },
      )
    }
    console.error('[api/clients/:id] update failed', e)
    return NextResponse.json(
      { data: null, error: 'Failed to update client' },
      { status: 500 },
    )
  }
}
