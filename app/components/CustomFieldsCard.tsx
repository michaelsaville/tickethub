import { getCustomFieldsForEntity } from '@/app/lib/actions/custom-fields'
import type { TH_CustomFieldEntity } from '@prisma/client'
import { CustomFieldsEditor } from './CustomFieldsEditor'

/**
 * Server-side card. Fetches all visible custom-field defs + values for a
 * ticket or client and hands them to the client editor. Renders nothing
 * when no defs exist for the entity, so the card disappears entirely on
 * deployments without custom fields.
 */
export async function CustomFieldsCard({
  entity,
  entityId,
}: {
  entity: TH_CustomFieldEntity
  entityId: string
}) {
  const fields = await getCustomFieldsForEntity({ entity, entityId })
  if (fields.length === 0) return null

  return (
    <div className="th-card mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Custom Fields
        </h3>
      </div>
      <CustomFieldsEditor entity={entity} entityId={entityId} fields={fields} />
    </div>
  )
}
