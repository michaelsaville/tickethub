'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import {
  DEFAULT_ESTIMATE_TEMPLATE_CONFIG,
  type EstimateTemplateConfig,
} from '@/app/types/estimate-template'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])

export type EstimateTemplateResult = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<
  { ok: true } | EstimateTemplateResult
> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!ADMIN_ROLES.has(session.user.role)) {
    return { ok: false, error: 'Admin role required' }
  }
  return { ok: true }
}

export async function getEstimateTemplateConfig(): Promise<{
  config: EstimateTemplateConfig
}> {
  const row = await prisma.tH_EstimateTemplate.findFirst({
    where: { isActive: true },
  })
  if (!row) {
    return { config: DEFAULT_ESTIMATE_TEMPLATE_CONFIG }
  }
  return {
    config: row.config as unknown as EstimateTemplateConfig,
  }
}

export async function saveEstimateTemplateConfig(
  config: EstimateTemplateConfig,
): Promise<EstimateTemplateResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (!config.sections || !Array.isArray(config.sections)) {
    return { ok: false, error: 'Invalid template config' }
  }
  if (!config.globalStyles?.primaryColor || !config.globalStyles?.fontFamily) {
    return { ok: false, error: 'Global styles are required' }
  }

  const existing = await prisma.tH_EstimateTemplate.findFirst({
    where: { isActive: true },
  })

  if (existing) {
    await prisma.tH_EstimateTemplate.update({
      where: { id: existing.id },
      data: { config: config as unknown as object },
    })
  } else {
    await prisma.tH_EstimateTemplate.create({
      data: {
        name: 'Default',
        config: config as unknown as object,
        isActive: true,
      },
    })
  }

  revalidatePath('/settings/estimate-template')
  return { ok: true }
}
