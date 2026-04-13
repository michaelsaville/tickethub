import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { amazonConfigured, searchItems } from '@/app/lib/amazon-paapi'

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) {
    return NextResponse.json(
      { error: 'Missing required query param: q' },
      { status: 400 },
    )
  }

  if (!(await amazonConfigured())) {
    return NextResponse.json(
      { error: 'Amazon PA-API not configured' },
      { status: 503 },
    )
  }

  const category = req.nextUrl.searchParams.get('category')?.trim() || undefined

  try {
    const results = await searchItems(q, category)
    return NextResponse.json({ data: { results } })
  } catch (e) {
    console.error('[api/amazon/search]', e)
    return NextResponse.json(
      { error: 'Amazon search failed' },
      { status: 500 },
    )
  }
}
