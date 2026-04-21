'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import {
  DEFAULT_INVOICE_TEMPLATE_CONFIG,
  type InvoiceTemplateConfig,
} from '@/app/types/invoice-template'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])

export type InvoiceTemplateResult = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<
  { ok: true } | InvoiceTemplateResult
> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!ADMIN_ROLES.has(session.user.role)) {
    return { ok: false, error: 'Admin role required' }
  }
  return { ok: true }
}

/**
 * Load the active invoice template config. Returns the default config if
 * no template has been saved yet.
 */
export async function getInvoiceTemplateConfig(): Promise<{
  config: InvoiceTemplateConfig
  logoUrl: string | null
}> {
  const row = await prisma.tH_InvoiceTemplate.findFirst({
    where: { isActive: true },
  })
  if (!row) {
    return { config: DEFAULT_INVOICE_TEMPLATE_CONFIG, logoUrl: null }
  }
  return {
    config: row.config as unknown as InvoiceTemplateConfig,
    logoUrl: row.logoUrl,
  }
}

/**
 * Save / upsert the active invoice template config.
 */
export async function saveInvoiceTemplateConfig(
  config: InvoiceTemplateConfig,
  logoUrl?: string | null,
): Promise<InvoiceTemplateResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  // Validate sections
  if (!config.sections || !Array.isArray(config.sections)) {
    return { ok: false, error: 'Invalid template config' }
  }
  if (!config.globalStyles?.primaryColor || !config.globalStyles?.fontFamily) {
    return { ok: false, error: 'Global styles are required' }
  }

  const existing = await prisma.tH_InvoiceTemplate.findFirst({
    where: { isActive: true },
  })

  if (existing) {
    await prisma.tH_InvoiceTemplate.update({
      where: { id: existing.id },
      data: {
        config: config as unknown as object,
        ...(logoUrl !== undefined ? { logoUrl } : {}),
      },
    })
  } else {
    await prisma.tH_InvoiceTemplate.create({
      data: {
        name: 'Default',
        config: config as unknown as object,
        logoUrl: logoUrl ?? null,
        isActive: true,
      },
    })
  }

  revalidatePath('/settings/invoice-template')
  return { ok: true }
}
