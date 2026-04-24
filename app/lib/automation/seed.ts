import 'server-only'
import { prisma } from '@/app/lib/prisma'

const CATCH_ALL_NAME = '__phase0_catch_all__'

let cachedRuleId: string | null = null

/**
 * Returns the ID of the Phase 0 catch-all rule, creating it on first use.
 *
 * The catch-all logs every emitted event to TH_AutomationRun so we can
 * verify event plumbing is wired correctly. It has `dryRun=true` so
 * no actions execute — the Phase 1 evaluator will replace this with
 * real, user-defined rules.
 *
 * If no admin user exists yet (fresh DB), returns null and the emit
 * call becomes a no-op. The next attempt after an admin is seeded
 * succeeds.
 */
export async function ensureCatchAllRule(): Promise<string | null> {
  if (cachedRuleId) return cachedRuleId

  const existing = await prisma.tH_AutomationRule.findFirst({
    where: { name: CATCH_ALL_NAME },
    select: { id: true },
  })
  if (existing) {
    cachedRuleId = existing.id
    return existing.id
  }

  const sysUser = await prisma.tH_User.findFirst({
    where: {
      role: { in: ['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'] },
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!sysUser) return null

  try {
    const rule = await prisma.tH_AutomationRule.create({
      data: {
        name: CATCH_ALL_NAME,
        description:
          'Phase 0: logs every emitted event for verification. Replaced when Phase 1 evaluator ships.',
        enabled: true,
        dryRun: true,
        priority: 999,
        triggerType: 'EVENT',
        triggerConfig: { event: '*' },
        conditions: {},
        actions: [{ type: 'log.debug', params: {} }],
        tags: ['system', 'phase-0'],
        createdById: sysUser.id,
      },
      select: { id: true },
    })
    cachedRuleId = rule.id
    return rule.id
  } catch {
    // Race: another concurrent emit won. Re-read.
    const again = await prisma.tH_AutomationRule.findFirst({
      where: { name: CATCH_ALL_NAME },
      select: { id: true },
    })
    if (again) {
      cachedRuleId = again.id
      return again.id
    }
    return null
  }
}

/** Test hook: reset the module-level cache. */
export function __resetCatchAllCache() {
  cachedRuleId = null
}
