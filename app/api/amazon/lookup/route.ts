import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { amazonConfigured, getCachedPrice } from '@/app/lib/amazon-paapi'

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const asin = req.nextUrl.searchParams.get('asin')?.trim()
  if (!asin) {
    return NextResponse.json(
      { error: 'Missing required query param: asin' },
      { status: 400 },
    )
  }

  if (!(await amazonConfigured())) {
    return NextResponse.json(
      { error: 'Amazon PA-API not configured' },
      { status: 503 },
    )
  }

  try {
    const product = await getCachedPrice(asin)
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 },
      )
    }
    return NextResponse.json({ data: product })
  } catch (e) {
    console.error('[api/amazon/lookup]', e)
    return NextResponse.json(
      { error: 'Amazon lookup failed' },
      { status: 500 },
    )
  }
}
