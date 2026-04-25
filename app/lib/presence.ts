export type PresenceStatus = 'active' | 'idle' | 'away'

const ACTIVE_MS = 90_000          // ≤ 90s since last heartbeat
const IDLE_MS = 5 * 60_000        // ≤ 5 min

export function statusFromHeartbeat(
  lastHeartbeatAt: Date | string | null | undefined,
  now: Date = new Date(),
): PresenceStatus {
  if (!lastHeartbeatAt) return 'away'
  const ts = typeof lastHeartbeatAt === 'string'
    ? new Date(lastHeartbeatAt).getTime()
    : lastHeartbeatAt.getTime()
  const age = now.getTime() - ts
  if (age <= ACTIVE_MS) return 'active'
  if (age <= IDLE_MS) return 'idle'
  return 'away'
}
