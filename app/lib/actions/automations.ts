'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import {
  isAutomationEnabled,
  listAutomationFlags,
  setAutomationEnabled,
  type AutomationFlag,
} from '@/app/lib/settings'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!ADMIN_ROLES.has(session.user.role)) {
    return { ok: false, error: 'Admin role required' }
  }
  return { ok: true }
}

export async function setAutomationFlag(
  flag: AutomationFlag,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!listAutomationFlags().includes(flag)) {
    return { ok: false, error: 'Unknown automation flag' }
  }
  await setAutomationEnabled(flag, enabled)
  revalidatePath('/settings/automations')
  revalidatePath('/schedule')
  return { ok: true }
}

export async function getAutomationSnapshot(): Promise<Record<AutomationFlag, boolean>> {
  const flags = listAutomationFlags()
  const entries = await Promise.all(flags.map(async (f) => [f, await isAutomationEnabled(f)] as const))
  return Object.fromEntries(entries) as Record<AutomationFlag, boolean>
}
