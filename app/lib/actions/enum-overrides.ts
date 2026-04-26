'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import {
  invalidateEnumOverrides,
  valuesFor,
  type EnumName,
} from '@/app/lib/enum-overrides'

export type EnumOverrideResult = { ok: true } | { ok: false; error: string }

const HEX_RE = /^#[0-9a-fA-F]{6}$/

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: 'Unauthorized' as string | null }
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return { error: 'Admin role required' as string | null }
  }
  return { error: null as string | null }
}

export async function setEnumOverride(input: {
  enumName: EnumName
  enumValue: string
  label?: string | null
  color?: string | null
  hidden?: boolean
}): Promise<EnumOverrideResult> {
  const auth = await requireAdmin()
  if (auth.error) return { ok: false, error: auth.error }

  if (!valuesFor(input.enumName).includes(input.enumValue)) {
    return { ok: false, error: 'Unknown enum value' }
  }
  const label = input.label?.trim() || null
  if (label && label.length > 60) {
    return { ok: false, error: 'Label too long (60 max)' }
  }
  const color = input.color?.trim() || null
  if (color && !HEX_RE.test(color)) {
    return { ok: false, error: 'Color must be a 6-digit hex like #aabbcc' }
  }
  const hidden = !!input.hidden

  await prisma.tH_EnumOverride.upsert({
    where: {
      enumName_enumValue: {
        enumName: input.enumName,
        enumValue: input.enumValue,
      },
    },
    create: {
      enumName: input.enumName,
      enumValue: input.enumValue,
      label,
      color,
      hidden,
    },
    update: { label, color, hidden },
  })

  invalidateEnumOverrides()
  revalidatePath('/settings/enums')
  // Status/priority/type render in many places — punt to a layout-level
  // refresh by revalidating common roots. Cache TTL also flips within 60s.
  revalidatePath('/tickets')
  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  return { ok: true }
}

export async function resetEnumOverride(input: {
  enumName: EnumName
  enumValue: string
}): Promise<EnumOverrideResult> {
  const auth = await requireAdmin()
  if (auth.error) return { ok: false, error: auth.error }

  await prisma.tH_EnumOverride.deleteMany({
    where: { enumName: input.enumName, enumValue: input.enumValue },
  })
  invalidateEnumOverrides()
  revalidatePath('/settings/enums')
  revalidatePath('/tickets')
  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  return { ok: true }
}
