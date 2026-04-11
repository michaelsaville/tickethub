import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error
  void session

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === '1'

  const clients = await prisma.tH_Client.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { shortCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      shortCode: true,
      isActive: true,
      _count: { select: { contacts: true, sites: true, tickets: true } },
    },
  })
  return NextResponse.json({ data: clients, error: null })
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error
  void session

  let body: { name?: string; shortCode?: string; internalNotes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Invalid JSON' },
      { status: 400 },
    )
  }
  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json(
      { data: null, error: 'Name is required' },
      { status: 400 },
    )
  }
  const shortCode = body.shortCode?.trim().toUpperCase() || null

  try {
    const created = await prisma.$transaction(async (tx) => {
      const client = await tx.tH_Client.create({
        data: {
          name,
          shortCode,
          internalNotes: body.internalNotes?.trim() || null,
        },
      })
      await tx.tH_Contract.create({
        data: {
          clientId: client.id,
          name: 'Global',
          type: 'GLOBAL',
          status: 'ACTIVE',
          isGlobal: true,
          notes: 'Auto-created on client creation.',
        },
      })
      return client
    })
    return NextResponse.json({ data: created, error: null }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unique constraint') && msg.includes('shortCode')) {
      return NextResponse.json(
        { data: null, error: `Short code "${shortCode}" already in use` },
        { status: 409 },
      )
    }
    console.error('[api/clients] create failed', e)
    return NextResponse.json(
      { data: null, error: 'Failed to create client' },
      { status: 500 },
    )
  }
}
