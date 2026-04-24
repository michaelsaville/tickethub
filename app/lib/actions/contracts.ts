'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { TH_ContractStatus, TH_ContractType } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { parseCents } from '@/app/lib/billing'
import { spawnMonthlyInvoiceForContract } from '@/app/lib/auto-invoice'

export type ContractResult = { ok: true } | { ok: false; error: string }

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

const TYPES: TH_ContractType[] = [
  'GLOBAL',
  'BLOCK_HOURS',
  'RECURRING',
  'TIME_AND_MATERIAL',
  'PROJECT',
]

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function createContract(
  clientId: string,
  _prev: ContractResult | null,
  formData: FormData,
): Promise<ContractResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }

  const name = (formData.get('name') as string | null)?.trim()
  const type = formData.get('type') as TH_ContractType | null
  const notes = (formData.get('notes') as string | null)?.trim() || null
  const startDate = parseDate(formData.get('startDate') as string)
  const endDate = parseDate(formData.get('endDate') as string)

  if (!name) return { ok: false, error: 'Name is required' }
  if (!type || !TYPES.includes(type)) {
    return { ok: false, error: 'Invalid contract type' }
  }
  if (type === 'GLOBAL') {
    return { ok: false, error: 'GLOBAL is auto-created — cannot add manually' }
  }

  let monthlyFee: number | null = null
  if (type === 'RECURRING') {
    const raw = (formData.get('monthlyFee') as string | null)?.trim() ?? ''
    if (raw) monthlyFee = parseCents(raw)
    if (monthlyFee == null || monthlyFee < 0) {
      return { ok: false, error: 'Monthly fee is required for RECURRING' }
    }
  }

  let blockHours: number | null = null
  if (type === 'BLOCK_HOURS') {
    const raw = (formData.get('blockHours') as string | null)?.trim() ?? ''
    const n = Number.parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, error: 'Block hours must be a positive number' }
    }
    blockHours = n
  }

  // Auto-invoice settings only apply to RECURRING contracts.
  let autoInvoiceEnabled = false
  let autoSendInvoice = false
  let billingDayOfMonth: number | null = null
  if (type === 'RECURRING') {
    autoInvoiceEnabled = formData.get('autoInvoiceEnabled') === 'on'
    autoSendInvoice = formData.get('autoSendInvoice') === 'on'
    const dayRaw = (formData.get('billingDayOfMonth') as string | null)?.trim() ?? ''
    const day = parseInt(dayRaw, 10)
    billingDayOfMonth = Number.isFinite(day) ? Math.max(1, Math.min(28, day)) : 1
  }

  try {
    await prisma.tH_Contract.create({
      data: {
        clientId,
        name,
        type,
        status: 'ACTIVE',
        startDate,
        endDate,
        monthlyFee,
        blockHours,
        notes,
        autoInvoiceEnabled,
        autoSendInvoice,
        billingDayOfMonth,
      },
    })
    revalidatePath(`/clients/${clientId}`)
    revalidatePath(`/clients/${clientId}/contracts`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/contracts] create failed', e)
    return { ok: false, error: 'Failed to create contract' }
  }
}

export async function updateContract(
  contractId: string,
  patch: {
    name?: string
    status?: TH_ContractStatus
    startDate?: Date | null
    endDate?: Date | null
    monthlyFee?: number | null
    blockHours?: number | null
    notes?: string | null
    autoInvoiceEnabled?: boolean
    autoSendInvoice?: boolean
    billingDayOfMonth?: number | null
  },
): Promise<ContractResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  try {
    const contract = await prisma.tH_Contract.findUnique({
      where: { id: contractId },
      select: { id: true, clientId: true, isGlobal: true },
    })
    if (!contract) return { ok: false, error: 'Not found' }
    if (contract.isGlobal && patch.status && patch.status !== 'ACTIVE') {
      return { ok: false, error: 'Global contract cannot be deactivated' }
    }
    await prisma.tH_Contract.update({
      where: { id: contractId },
      data: patch,
    })
    revalidatePath(`/clients/${contract.clientId}`)
    revalidatePath(`/clients/${contract.clientId}/contracts`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/contracts] update failed', e)
    return { ok: false, error: 'Failed to update contract' }
  }
}

export async function runAutoInvoiceNow(
  contractId: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  try {
    const result = await spawnMonthlyInvoiceForContract(contractId)
    if (!result.ok) return { ok: false, error: result.error }
    const contract = await prisma.tH_Contract.findUnique({
      where: { id: contractId },
      select: { clientId: true },
    })
    if (contract) {
      revalidatePath(`/clients/${contract.clientId}`)
      revalidatePath(`/clients/${contract.clientId}/contracts`)
    }
    revalidatePath('/invoices')
    return { ok: true, invoiceId: result.invoiceId }
  } catch (e) {
    console.error('[actions/contracts] run-auto-invoice failed', e)
    return { ok: false, error: 'Failed to spawn invoice' }
  }
}

export async function deleteContract(contractId: string): Promise<ContractResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  try {
    const contract = await prisma.tH_Contract.findUnique({
      where: { id: contractId },
      include: { _count: { select: { charges: true, tickets: true } } },
    })
    if (!contract) return { ok: false, error: 'Not found' }
    if (contract.isGlobal) {
      return { ok: false, error: 'Cannot delete the Global Contract' }
    }
    if (contract._count.charges > 0 || contract._count.tickets > 0) {
      return {
        ok: false,
        error: `Contract has ${contract._count.charges} charges and ${contract._count.tickets} tickets — mark CANCELLED instead`,
      }
    }
    await prisma.tH_Contract.delete({ where: { id: contractId } })
    revalidatePath(`/clients/${contract.clientId}`)
    revalidatePath(`/clients/${contract.clientId}/contracts`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/contracts] delete failed', e)
    return { ok: false, error: 'Failed to delete contract' }
  }
}
