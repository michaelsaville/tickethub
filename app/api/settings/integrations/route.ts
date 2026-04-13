import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import {
  getAllSettingStatuses,
  setSetting,
  deleteSetting,
  isAllowedKey,
} from '@/app/lib/settings'

// ─── GET: return masked setting statuses ────────────────────────────────

export async function GET() {
  const { error } = await requireAuth('GLOBAL_ADMIN')
  if (error) return error

  const statuses = await getAllSettingStatuses()
  return NextResponse.json(statuses)
}

// ─── PUT: set a single key ──────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const { error } = await requireAuth('GLOBAL_ADMIN')
  if (error) return error

  const body = await req.json()
  const { key, value } = body as { key?: string; value?: string }

  if (!key || typeof value !== 'string') {
    return NextResponse.json(
      { error: 'key (string) and value (string) are required' },
      { status: 400 },
    )
  }

  if (!isAllowedKey(key)) {
    return NextResponse.json(
      { error: `Key "${key}" is not in the allowlist` },
      { status: 400 },
    )
  }

  if (!value.trim()) {
    return NextResponse.json(
      { error: 'Value cannot be empty — use DELETE to clear' },
      { status: 400 },
    )
  }

  await setSetting(key, value.trim())
  return NextResponse.json({ ok: true })
}

// ─── DELETE: remove a key ───────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { error } = await requireAuth('GLOBAL_ADMIN')
  if (error) return error

  const body = await req.json()
  const { key } = body as { key?: string }

  if (!key) {
    return NextResponse.json(
      { error: 'key is required' },
      { status: 400 },
    )
  }

  if (!isAllowedKey(key)) {
    return NextResponse.json(
      { error: `Key "${key}" is not in the allowlist` },
      { status: 400 },
    )
  }

  await deleteSetting(key)
  return NextResponse.json({ ok: true })
}
