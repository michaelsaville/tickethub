import 'server-only'
import { prisma } from '@/app/lib/prisma'

const TOGGL_API = 'https://api.track.toggl.com/api/v9'

interface TogglTimeEntry {
  id: number
  workspace_id: number
  description: string
  start: string
  stop?: string
  duration: number // seconds, negative while running
}

/** Get the user's Toggl API token. Returns null if not configured. */
async function getTogglToken(userId: string): Promise<string | null> {
  const user = await prisma.tH_User.findUnique({
    where: { id: userId },
    select: { togglToken: true },
  })
  return user?.togglToken?.trim() || null
}

/** Get the user's default Toggl workspace ID. */
async function getWorkspaceId(token: string): Promise<number | null> {
  const res = await fetch(`${TOGGL_API}/me`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${token}:api_token`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) return null
  const me = await res.json()
  return me.default_workspace_id ?? null
}

/**
 * Start a Toggl time entry when the TicketHub timer starts.
 * Returns the Toggl entry ID, or null on failure / no token.
 */
export async function startTogglEntry(
  userId: string,
  description: string,
): Promise<number | null> {
  const token = await getTogglToken(userId)
  if (!token) return null

  try {
    const workspaceId = await getWorkspaceId(token)
    if (!workspaceId) return null

    const now = new Date()
    const res = await fetch(`${TOGGL_API}/workspaces/${workspaceId}/time_entries`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:api_token`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description,
        start: now.toISOString(),
        duration: -1, // negative = running
        workspace_id: workspaceId,
        created_with: 'TicketHub',
      }),
    })

    if (!res.ok) {
      console.error('[toggl] start entry failed', res.status, await res.text())
      return null
    }

    const entry: TogglTimeEntry = await res.json()
    return entry.id
  } catch (e) {
    console.error('[toggl] start entry error', e)
    return null
  }
}

/**
 * Stop the current running Toggl time entry.
 * Returns true on success, false on failure / no token.
 */
export async function stopTogglEntry(userId: string): Promise<boolean> {
  const token = await getTogglToken(userId)
  if (!token) return false

  try {
    const workspaceId = await getWorkspaceId(token)
    if (!workspaceId) return false

    // Get current running entry
    const currentRes = await fetch(`${TOGGL_API}/me/time_entries/current`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:api_token`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    })

    if (!currentRes.ok) return false
    const current = await currentRes.json()
    if (!current || !current.id) return false // No running entry

    // Stop it
    const stopRes = await fetch(
      `${TOGGL_API}/workspaces/${workspaceId}/time_entries/${current.id}/stop`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Basic ${Buffer.from(`${token}:api_token`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      },
    )

    return stopRes.ok
  } catch (e) {
    console.error('[toggl] stop entry error', e)
    return false
  }
}

/** Test the Toggl API token. Returns workspace name on success, null on failure. */
export async function testTogglToken(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${TOGGL_API}/me`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:api_token`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) return null
    const me = await res.json()
    return me.fullname ?? me.email ?? 'Connected'
  } catch {
    return null
  }
}
