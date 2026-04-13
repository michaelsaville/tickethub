import 'server-only'
import { prisma } from '@/app/lib/prisma'

const TODOIST_API = 'https://api.todoist.com/rest/v2'

/** Get the user's Todoist API token. Returns null if not configured. */
async function getTodoistToken(userId: string): Promise<string | null> {
  const user = await prisma.tH_User.findUnique({
    where: { id: userId },
    select: { todoistToken: true },
  })
  return user?.todoistToken?.trim() || null
}

/**
 * Create a Todoist task from a ticket.
 * Returns the Todoist task ID on success, null on failure / no token.
 */
export async function createTodoistTask(
  userId: string,
  input: {
    title: string
    description?: string
    ticketUrl: string
    priority?: number // 1=normal, 4=urgent (Todoist inverts: p1=urgent in UI = priority 4 in API)
  },
): Promise<string | null> {
  const token = await getTodoistToken(userId)
  if (!token) return null

  try {
    // Map TicketHub priority to Todoist priority
    // Todoist: 1=normal, 2=medium, 3=high, 4=urgent
    const priority = input.priority ?? 1

    const res = await fetch(`${TODOIST_API}/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: input.title,
        description: `${input.description ?? ''}\n\n[Open in TicketHub](${input.ticketUrl})`.trim(),
        priority,
      }),
    })

    if (!res.ok) {
      console.error('[todoist] create task failed', res.status, await res.text())
      return null
    }

    const task = await res.json()
    return task.id
  } catch (e) {
    console.error('[todoist] create task error', e)
    return null
  }
}

/** Test the Todoist API token. Returns user's name on success, null on failure. */
export async function testTodoistToken(token: string): Promise<string | null> {
  try {
    // Todoist Sync API for user info (REST v2 doesn't have a /me endpoint)
    const res = await fetch('https://api.todoist.com/sync/v9/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sync_token: '*',
        resource_types: ['user'],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.user?.full_name ?? data.user?.email ?? 'Connected'
  } catch {
    return null
  }
}
