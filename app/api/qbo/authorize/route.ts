import { NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { qboConfigured, getAuthUrl } from '@/app/lib/qbo'
import { randomBytes } from 'crypto'

export async function GET() {
  const { error } = await requireAuth('TICKETHUB_ADMIN')
  if (error) return error

  if (!(await qboConfigured())) {
    return NextResponse.json(
      { error: 'QBO client ID and secret are not configured' },
      { status: 500 },
    )
  }

  const state = randomBytes(24).toString('hex')
  const url = await getAuthUrl(state)

  const res = NextResponse.redirect(url)
  res.cookies.set('qbo_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  })

  return res
}
