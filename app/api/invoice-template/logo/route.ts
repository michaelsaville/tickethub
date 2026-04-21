import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'

const MAX_SIZE = 200_000 // 200 KB
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
])

/**
 * POST /api/invoice-template/logo
 *
 * Accepts multipart/form-data with a `logo` field. Returns the logo as a
 * base64 data URL so it can be stored directly in the template config and
 * used by @react-pdf/renderer without filesystem access.
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
    return new NextResponse('Logo must be under 200KB', { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const dataUrl = `data:${file.type};base64,${base64}`

  return NextResponse.json({ url: dataUrl })
}
