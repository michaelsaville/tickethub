'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'
import type {
  TH_CustomFieldEntity,
  TH_CustomFieldType,
} from '@prisma/client'

export type CustomFieldOption = { value: string; label: string }

export type CustomFieldDefDTO = {
  id: string
  key: string
  label: string
  entity: TH_CustomFieldEntity
  type: TH_CustomFieldType
  helpText: string | null
  options: CustomFieldOption[]
  required: boolean
  sortOrder: number
  archivedAt: Date | null
}

export type CustomFieldWithValue = CustomFieldDefDTO & { value: string | null }

export type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/
const ENTITY_VALUES = new Set<TH_CustomFieldEntity>(['TICKET', 'CLIENT'])
const TYPE_VALUES = new Set<TH_CustomFieldType>([
  'TEXT',
  'MULTILINE',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'URL',
])

function toDTO(d: {
  id: string
  key: string
  label: string
  entity: TH_CustomFieldEntity
  type: TH_CustomFieldType
  helpText: string | null
  options: unknown
  required: boolean
  sortOrder: number
  archivedAt: Date | null
}): CustomFieldDefDTO {
  return {
    id: d.id,
    key: d.key,
    label: d.label,
    entity: d.entity,
    type: d.type,
    helpText: d.helpText,
    options: parseOptions(d.options),
    required: d.required,
    sortOrder: d.sortOrder,
    archivedAt: d.archivedAt,
  }
}

function parseOptions(raw: unknown): CustomFieldOption[] {
  if (!Array.isArray(raw)) return []
  const out: CustomFieldOption[] = []
  for (const r of raw) {
    if (
      r &&
      typeof r === 'object' &&
      'value' in r &&
      'label' in r &&
      typeof (r as { value: unknown }).value === 'string' &&
      typeof (r as { label: unknown }).label === 'string'
    ) {
      out.push({
        value: (r as { value: string }).value,
        label: (r as { label: string }).label,
      })
    }
  }
  return out
}

async function requireAdmin(): Promise<{ error: string | null }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: 'Unauthorized' }
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return { error: 'Admin role required' }
  }
  return { error: null }
}

export async function listCustomFieldDefs(input?: {
  entity?: TH_CustomFieldEntity
  includeArchived?: boolean
}): Promise<CustomFieldDefDTO[]> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return []
  const rows = await prisma.tH_CustomFieldDef.findMany({
    where: {
      ...(input?.entity ? { entity: input.entity } : {}),
      ...(input?.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
  })
  return rows.map(toDTO)
}

export async function getCustomFieldsForEntity(input: {
  entity: TH_CustomFieldEntity
  entityId: string
}): Promise<CustomFieldWithValue[]> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return []
  const defs = await prisma.tH_CustomFieldDef.findMany({
    where: { entity: input.entity, archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  })
  if (defs.length === 0) return []
  const values = await prisma.tH_CustomFieldValue.findMany({
    where: {
      entityType: input.entity,
      entityId: input.entityId,
      defId: { in: defs.map((d) => d.id) },
    },
  })
  const byDefId = new Map(values.map((v) => [v.defId, v.value]))
  return defs.map((d) => ({ ...toDTO(d), value: byDefId.get(d.id) ?? null }))
}

export async function createCustomFieldDef(input: {
  key: string
  label: string
  entity: TH_CustomFieldEntity
  type: TH_CustomFieldType
  helpText?: string | null
  options?: CustomFieldOption[]
  required?: boolean
  sortOrder?: number
}): Promise<Result<{ id: string }>> {
  const auth = await requireAdmin()
  if (auth.error) return { ok: false, error: auth.error }

  const key = input.key.trim().toLowerCase()
  const label = input.label.trim()
  if (!KEY_RE.test(key)) {
    return {
      ok: false,
      error:
        'Key must start with a letter and contain only lowercase a–z, 0–9, underscore (max 40 chars).',
    }
  }
  if (!label || label.length > 80) {
    return { ok: false, error: 'Label is required (max 80 chars).' }
  }
  if (!ENTITY_VALUES.has(input.entity)) {
    return { ok: false, error: 'Invalid entity.' }
  }
  if (!TYPE_VALUES.has(input.type)) {
    return { ok: false, error: 'Invalid type.' }
  }
  if (input.helpText && input.helpText.length > 500) {
    return { ok: false, error: 'Help text too long (max 500).' }
  }

  let options: CustomFieldOption[] = []
  if (input.type === 'SELECT') {
    options = (input.options ?? []).filter(
      (o) => o.value.trim() && o.label.trim(),
    )
    if (options.length === 0) {
      return { ok: false, error: 'SELECT fields need at least one option.' }
    }
    const seen = new Set<string>()
    for (const o of options) {
      if (seen.has(o.value)) {
        return { ok: false, error: `Duplicate option value "${o.value}".` }
      }
      seen.add(o.value)
    }
  }

  try {
    const created = await prisma.tH_CustomFieldDef.create({
      data: {
        key,
        label,
        entity: input.entity,
        type: input.type,
        helpText: input.helpText?.trim() || null,
        options: input.type === 'SELECT' ? options : undefined,
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? 0,
      },
      select: { id: true },
    })
    revalidatePath('/settings/custom-fields')
    return { ok: true, data: { id: created.id } }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unique constraint')) {
      return { ok: false, error: `Key "${key}" already exists for ${input.entity}.` }
    }
    console.error('[actions/custom-fields] create failed', e)
    return { ok: false, error: 'Failed to create custom field.' }
  }
}

export async function updateCustomFieldDef(input: {
  id: string
  label?: string
  helpText?: string | null
  options?: CustomFieldOption[]
  required?: boolean
  sortOrder?: number
}): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { ok: false, error: auth.error }

  const existing = await prisma.tH_CustomFieldDef.findUnique({
    where: { id: input.id },
  })
  if (!existing) return { ok: false, error: 'Not found.' }

  const data: Record<string, unknown> = {}
  if (input.label !== undefined) {
    const label = input.label.trim()
    if (!label || label.length > 80) return { ok: false, error: 'Invalid label.' }
    data.label = label
  }
  if (input.helpText !== undefined) {
    if (input.helpText && input.helpText.length > 500) {
      return { ok: false, error: 'Help text too long.' }
    }
    data.helpText = input.helpText?.trim() || null
  }
  if (input.required !== undefined) data.required = input.required
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  if (input.options !== undefined && existing.type === 'SELECT') {
    const opts = input.options.filter((o) => o.value.trim() && o.label.trim())
    if (opts.length === 0) {
      return { ok: false, error: 'SELECT fields need at least one option.' }
    }
    const seen = new Set<string>()
    for (const o of opts) {
      if (seen.has(o.value)) {
        return { ok: false, error: `Duplicate option value "${o.value}".` }
      }
      seen.add(o.value)
    }
    data.options = opts
  }

  try {
    await prisma.tH_CustomFieldDef.update({ where: { id: input.id }, data })
    revalidatePath('/settings/custom-fields')
    return { ok: true }
  } catch (e) {
    console.error('[actions/custom-fields] update failed', e)
    return { ok: false, error: 'Failed to update.' }
  }
}

export async function archiveCustomFieldDef(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { ok: false, error: auth.error }
  await prisma.tH_CustomFieldDef.update({
    where: { id },
    data: { archivedAt: new Date() },
  })
  revalidatePath('/settings/custom-fields')
  return { ok: true }
}

export async function unarchiveCustomFieldDef(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (auth.error) return { ok: false, error: auth.error }
  await prisma.tH_CustomFieldDef.update({
    where: { id },
    data: { archivedAt: null },
  })
  revalidatePath('/settings/custom-fields')
  return { ok: true }
}

/**
 * Validate a string-encoded value against a def. Returns the normalized
 * value to store, or null when the input is empty (caller deletes the row).
 */
function validateValue(
  def: { type: TH_CustomFieldType; options: unknown; required: boolean; label: string },
  raw: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    if (def.required) return { ok: false, error: `${def.label} is required.` }
    return { ok: true, value: null }
  }
  switch (def.type) {
    case 'NUMBER': {
      const n = Number(trimmed)
      if (!Number.isFinite(n)) return { ok: false, error: `${def.label} must be a number.` }
      return { ok: true, value: String(n) }
    }
    case 'DATE': {
      const d = new Date(trimmed)
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: `${def.label} must be a valid date.` }
      }
      // Store as YYYY-MM-DD when input is date-only, else ISO.
      const value = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? trimmed
        : d.toISOString()
      return { ok: true, value }
    }
    case 'BOOLEAN': {
      const v = trimmed.toLowerCase()
      if (v !== 'true' && v !== 'false') {
        return { ok: false, error: `${def.label} must be true or false.` }
      }
      return { ok: true, value: v }
    }
    case 'SELECT': {
      const opts = parseOptions(def.options)
      if (!opts.some((o) => o.value === trimmed)) {
        return { ok: false, error: `${def.label}: not a valid option.` }
      }
      return { ok: true, value: trimmed }
    }
    case 'URL': {
      try {
        new URL(trimmed)
      } catch {
        return { ok: false, error: `${def.label} must be a valid URL.` }
      }
      return { ok: true, value: trimmed }
    }
    case 'TEXT':
      if (trimmed.length > 500) return { ok: false, error: `${def.label}: too long (max 500).` }
      return { ok: true, value: trimmed }
    case 'MULTILINE':
      if (trimmed.length > 5000) return { ok: false, error: `${def.label}: too long (max 5000).` }
      return { ok: true, value: trimmed }
    default:
      return { ok: false, error: 'Unknown field type.' }
  }
}

export async function setCustomFieldValue(input: {
  defId: string
  entity: TH_CustomFieldEntity
  entityId: string
  value: string
}): Promise<Result> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }

  const def = await prisma.tH_CustomFieldDef.findUnique({
    where: { id: input.defId },
  })
  if (!def) return { ok: false, error: 'Field not found.' }
  if (def.archivedAt) return { ok: false, error: 'Field is archived.' }
  if (def.entity !== input.entity) {
    return { ok: false, error: 'Field does not match entity.' }
  }

  const validated = validateValue(def, input.value)
  if (!validated.ok) return validated

  // Look up existing value for event logging diff.
  const prev = await prisma.tH_CustomFieldValue.findUnique({
    where: {
      defId_entityType_entityId: {
        defId: def.id,
        entityType: input.entity,
        entityId: input.entityId,
      },
    },
  })

  if (validated.value === null) {
    if (prev) {
      await prisma.tH_CustomFieldValue.delete({ where: { id: prev.id } })
    }
  } else {
    await prisma.tH_CustomFieldValue.upsert({
      where: {
        defId_entityType_entityId: {
          defId: def.id,
          entityType: input.entity,
          entityId: input.entityId,
        },
      },
      create: {
        defId: def.id,
        entityType: input.entity,
        entityId: input.entityId,
        value: validated.value,
      },
      update: { value: validated.value },
    })
  }

  if (input.entity === 'TICKET' && (prev?.value ?? null) !== validated.value) {
    await prisma.tH_TicketEvent.create({
      data: {
        ticketId: input.entityId,
        userId: session.user.id,
        type: 'CUSTOM_FIELD_CHANGED',
        data: {
          defId: def.id,
          key: def.key,
          label: def.label,
          from: prev?.value ?? null,
          to: validated.value,
        },
      },
    })
  }

  if (input.entity === 'TICKET') {
    revalidatePath(`/tickets/${input.entityId}`)
  } else if (input.entity === 'CLIENT') {
    revalidatePath(`/clients/${input.entityId}`)
  }
  return { ok: true }
}
