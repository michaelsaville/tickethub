import { prisma } from '@/app/lib/prisma'
import type {
  TH_TicketPriority,
  TH_TicketStatus,
  TH_TicketType,
} from '@prisma/client'

export type EnumName = 'TICKET_STATUS' | 'TICKET_PRIORITY' | 'TICKET_TYPE'

export type EnumDisplay = {
  value: string
  label: string
  color: string | null
  hidden: boolean
}

export const TICKET_STATUS_VALUES: TH_TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_THIRD_PARTY',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
]

export const TICKET_PRIORITY_VALUES: TH_TicketPriority[] = [
  'URGENT',
  'HIGH',
  'MEDIUM',
  'LOW',
]

export const TICKET_TYPE_VALUES: TH_TicketType[] = [
  'INCIDENT',
  'SERVICE_REQUEST',
  'PROBLEM',
  'CHANGE',
  'MAINTENANCE',
  'INTERNAL',
]

export function defaultLabel(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

export function valuesFor(name: EnumName): readonly string[] {
  switch (name) {
    case 'TICKET_STATUS':
      return TICKET_STATUS_VALUES
    case 'TICKET_PRIORITY':
      return TICKET_PRIORITY_VALUES
    case 'TICKET_TYPE':
      return TICKET_TYPE_VALUES
  }
}

type Cache = { at: number; rows: Map<string, EnumDisplay> }
const TTL_MS = 60_000
let cache: Cache | null = null

function key(name: EnumName, value: string): string {
  return `${name}::${value}`
}

async function loadCache(): Promise<Cache> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache
  const rows = await prisma.tH_EnumOverride.findMany()
  const m = new Map<string, EnumDisplay>()
  for (const r of rows) {
    m.set(key(r.enumName as EnumName, r.enumValue), {
      value: r.enumValue,
      label: r.label ?? defaultLabel(r.enumValue),
      color: r.color,
      hidden: r.hidden,
    })
  }
  cache = { at: Date.now(), rows: m }
  return cache
}

export function invalidateEnumOverrides(): void {
  cache = null
}

export async function getEnumDisplay(
  name: EnumName,
  value: string,
): Promise<EnumDisplay> {
  const c = await loadCache()
  return (
    c.rows.get(key(name, value)) ?? {
      value,
      label: defaultLabel(value),
      color: null,
      hidden: false,
    }
  )
}

/**
 * Full list of values for an enum, with overrides merged in.
 * `includeHidden` defaults to false — pickers usually don't want hidden
 * values, but the admin settings page does.
 */
export async function listEnumDisplays(
  name: EnumName,
  opts: { includeHidden?: boolean } = {},
): Promise<EnumDisplay[]> {
  const c = await loadCache()
  const values = valuesFor(name)
  const out: EnumDisplay[] = []
  for (const v of values) {
    const merged = c.rows.get(key(name, v)) ?? {
      value: v,
      label: defaultLabel(v),
      color: null,
      hidden: false,
    }
    if (!opts.includeHidden && merged.hidden) continue
    out.push(merged)
  }
  return out
}

export async function getAllEnumDisplays(): Promise<
  Record<EnumName, EnumDisplay[]>
> {
  const [status, priority, type] = await Promise.all([
    listEnumDisplays('TICKET_STATUS', { includeHidden: true }),
    listEnumDisplays('TICKET_PRIORITY', { includeHidden: true }),
    listEnumDisplays('TICKET_TYPE', { includeHidden: true }),
  ])
  return {
    TICKET_STATUS: status,
    TICKET_PRIORITY: priority,
    TICKET_TYPE: type,
  }
}
