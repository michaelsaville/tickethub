import 'server-only'
import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { isAutomationEnabled } from '@/app/lib/settings'
import { ensureCatchAllRule } from './seed'
import type { AutomationEvent } from './events'

/**
 * Emit an automation event.
 *
 * Phase 0 behavior:
 *   - Gated on the `automation.engine.emit` flag (default OFF).
 *   - When enabled, writes one TH_AutomationRun row against the Phase 0
 *     catch-all rule (result = SKIPPED_DRYRUN, action trace = log.debug).
 *   - All errors are swallowed — emission NEVER blocks the source
 *     transaction. Failures log to stderr only.
 *
 * Phase 1 will swap this for the real evaluator: matching rules,
 * condition walk, action execution, chain tracking.
 *
 * Callers should await this at the END of their mutation, after the
 * database write has committed. Do not await inside an open transaction.
 */
export async function emit(event: AutomationEvent): Promise<void> {
  try {
    const enabled = await isAutomationEnabled('automation.engine.emit')
    if (!enabled) return

    const ruleId = await ensureCatchAllRule()
    if (!ruleId) return

    await prisma.tH_AutomationRun.create({
      data: {
        ruleId,
        entityType: event.entityType,
        entityId: event.entityId,
        eventType: event.type,
        eventPayload: (event.payload ?? {}) as Prisma.InputJsonValue,
        eventAt: event.occurredAt ?? new Date(),
        result: 'SKIPPED_DRYRUN',
        actionsRun: [
          { type: 'log.debug', result: 'OK' },
        ] as unknown as Prisma.InputJsonValue,
        chainId: event.chainId ?? randomUUID(),
        chainDepth: event.chainDepth ?? 0,
        parentRunId: event.parentRunId ?? null,
      },
    })
  } catch (err) {
    console.error('[automation.emit] failed:', err)
  }
}
