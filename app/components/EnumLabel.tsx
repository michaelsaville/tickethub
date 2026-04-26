'use client'

import { useEnumDisplay } from './EnumOverridesProvider'
import type { EnumName } from '@/app/lib/enum-overrides'

/**
 * Renders the customized label for an enum value. Wraps `useEnumDisplay`
 * with a stable element, so callers can drop this in place of inline
 * rendering without restructuring layout.
 */
export function EnumLabel({
  name,
  value,
  className,
}: {
  name: EnumName
  value: string
  className?: string
}) {
  const d = useEnumDisplay(name, value)
  return <span className={className}>{d.label}</span>
}
