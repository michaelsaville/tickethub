import 'server-only'

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g

/**
 * Extract @mentioned user IDs from a comment body.
 *
 * Word-boundary regex per user name: `(^|\W)@<name>\b` — case-insensitive.
 * The `(^|\W)` prefix prevents `email@somebody.com` from accidentally
 * mentioning a user named "somebody"; the `\b` suffix prevents a user
 * named "Mike S" from matching inside `@Mike Saville`.
 *
 * Names are matched as plain text (no special regex meaning) — they're
 * escaped before being substituted into the regex.
 */
export function findMentionedUserIds(
  body: string,
  users: { id: string; name: string }[],
): string[] {
  if (!body || users.length === 0) return []
  const mentioned = new Set<string>()
  for (const u of users) {
    const escaped = u.name.replace(REGEX_ESCAPE, '\\$&')
    const re = new RegExp(`(?:^|\\W)@${escaped}\\b`, 'i')
    if (re.test(body)) mentioned.add(u.id)
  }
  return Array.from(mentioned)
}
