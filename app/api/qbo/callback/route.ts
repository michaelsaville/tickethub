import { NextResponse, type NextRequest } from 'next/server'
import { exchangeCode } from '@/app/lib/qbo'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const realmId = url.searchParams.get('realmId')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    const desc = url.searchParams.get('error_description') ?? errorParam
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?qbo_error=${encodeURIComponent(desc)}`,
        process.env.NEXTAUTH_URL,
      ),
    )
  }

  if (!code || !realmId || !state) {
    return NextResponse.redirect(
      new URL(
        '/settings/integrations?qbo_error=Missing+code+or+realmId',
        process.env.NEXTAUTH_URL,
      ),
    )
  }

  // Validate state
  const storedState = req.cookies.get('qbo_oauth_state')?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(
        '/settings/integrations?qbo_error=Invalid+state+parameter',
        process.env.NEXTAUTH_URL,
      ),
    )
  }

  try {
    await exchangeCode(code, realmId)
  } catch (e: any) {
    console.error('QBO OAuth exchange failed:', e)
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?qbo_error=${encodeURIComponent(e.message ?? 'Token exchange failed')}`,
        process.env.NEXTAUTH_URL,
      ),
    )
  }

  const res = NextResponse.redirect(
    new URL(
      '/settings/integrations?qbo_success=Connected+to+QuickBooks',
      process.env.NEXTAUTH_URL,
    ),
  )
  // Clear the state cookie
  res.cookies.delete('qbo_oauth_state')

  return res
}
