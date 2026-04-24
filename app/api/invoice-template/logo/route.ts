import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import { DEFAULT_INVOICE_TEMPLATE_CONFIG } from '@/app/types/invoice-template'

const MAX_SIZE = 5_000_000 // 5 MB
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
])

/**
 * POST /api/invoice-template/logo
 *
 * Accepts multipart/form-data with a `logo` field. Stores the logo as a
 * base64 data URL directly on the active invoice-template row so the PDF
 * pipeline can render it without filesystem access. Persisting here (as
 * opposed to via a server action) keeps the large payload off Next's
 * flight protocol, which rejects deeply nested / very large arguments.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return new NextResponse('Admin role required', { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  if (!file) {
    return new NextResponse('No file provided', { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return new NextResponse('Only PNG, JPEG, and SVG files are allowed', {
      status: 400,
    })
  }

  if (file.size > MAX_SIZE) {
    return new NextResponse('Logo must be under 5MB', { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const dataUrl = `data:${file.type};base64,${base64}`

  const existing = await prisma.tH_InvoiceTemplate.findFirst({
    where: { isActive: true },
  })
  if (existing) {
    await prisma.tH_InvoiceTemplate.update({
      where: { id: existing.id },
      data: { logoUrl: dataUrl },
    })
  } else {
    await prisma.tH_InvoiceTemplate.create({
      data: {
        name: 'Default',
        config: DEFAULT_INVOICE_TEMPLATE_CONFIG as unknown as object,
        logoUrl: dataUrl,
        isActive: true,
      },
    })
  }

  return NextResponse.json({ url: dataUrl })
}

/**
 * DELETE /api/invoice-template/logo
 * Clears the logo from the active invoice-template row.
 */
export async function DELETE() {
  const { session, error } = await requireAuth()
  if (error) return error
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return new NextResponse('Admin role required', { status: 403 })
  }

  const existing = await prisma.tH_InvoiceTemplate.findFirst({
    where: { isActive: true },
  })
  if (existing) {
    await prisma.tH_InvoiceTemplate.update({
      where: { id: existing.id },
      data: { logoUrl: null },
    })
  }

  return NextResponse.json({ ok: true })
}
