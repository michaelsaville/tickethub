'use client'

import { createContext, useContext, useMemo } from 'react'
import type { EnumDisplay, EnumName } from '@/app/lib/enum-overrides'

type EnumMap = Record<EnumName, EnumDisplay[]>

const EnumContext = createContext<EnumMap | null>(null)

export function EnumOverridesProvider({
  value,
  children,
}: {
  value: EnumMap
  children: React.ReactNode
}) {
  return <EnumContext.Provider value={value}>{children}</EnumContext.Provider>
}

function fallbackLabel(v: string): string {
  return v
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

export function useEnumDisplay(name: EnumName, value: string): EnumDisplay {
  const ctx = useContext(EnumContext)
  if (ctx) {
    const found = ctx[name]?.find((d) => d.value === value)
    if (found) return found
  }
  return { value, label: fallbackLabel(value), color: null, hidden: false }
}

export function useEnumList(
  name: EnumName,
  opts: { includeHidden?: boolean } = {},
): EnumDisplay[] {
  const ctx = useContext(EnumContext)
  const list = ctx?.[name] ?? []
  return useMemo(
    () =>
      opts.includeHidden ? list : list.filter((d) => !d.hidden),
    [list, opts.includeHidden],
  )
}
