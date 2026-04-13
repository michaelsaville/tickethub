import { getAnthropic, AI_MODEL } from './ai'

const SYSTEM_PROMPT = `You translate natural language questions about MSP support tickets into structured Prisma-compatible search filters.

Return ONLY a JSON object — no prose, no markdown fences:

{
  "where": object,
  "orderBy": object | null,
  "explanation": string
}

## Schema context

The ticket model (TH_Ticket) has these filterable fields:
- title: String
- description: String (nullable)
- status: Enum — NEW, OPEN, IN_PROGRESS, WAITING_CUSTOMER, WAITING_THIRD_PARTY, RESOLVED, CLOSED, CANCELLED
- priority: Enum — URGENT, HIGH, MEDIUM, LOW
- type: Enum — INCIDENT, SERVICE_REQUEST, PROBLEM, CHANGE, MAINTENANCE, INTERNAL
- createdAt: DateTime
- updatedAt: DateTime
- closedAt: DateTime (nullable)
- slaBreached: Boolean
- client: relation — { name: String, shortCode: String? }
- assignedTo: relation — { name: String, email: String }

## Filter syntax (Prisma-style)

Use these operators:
- String contains: { contains: "value", mode: "insensitive" }
- Enum equals: "VALUE"
- Enum in: { in: ["VALUE1", "VALUE2"] }
- Enum notIn: { notIn: ["VALUE1", "VALUE2"] }
- Date gte/lte: { gte: "ISO-DATE" } or { lte: "ISO-DATE" }
- Boolean: true / false
- Relation filter: { client: { name: { contains: "value", mode: "insensitive" } } }
- OR conditions: { OR: [ ... ] }
- AND conditions: { AND: [ ... ] }

## Date handling

Today's date will be provided in the user message. Use it to compute relative dates:
- "last week" → createdAt >= 7 days ago
- "this month" → createdAt >= first day of current month
- "last month" → createdAt between first and last day of previous month
- "today" → createdAt >= start of today

## OrderBy syntax

- { createdAt: "desc" } or { updatedAt: "desc" }
- { priority: "asc" } (URGENT first since it's alphabetically first in the enum)

## Rules

- Always exclude deletedAt != null: add "deletedAt: null" to the where clause
- If the query mentions a client name, use { client: { name: { contains: "...", mode: "insensitive" } } }
- If the query mentions an assignee, use { assignedTo: { name: { contains: "...", mode: "insensitive" } } }
- If the query is about "open" tickets, use status: { notIn: ["CLOSED", "CANCELLED", "RESOLVED"] }
- Keep the explanation under 100 chars — describe what the filter does in plain English
- If the query is ambiguous, prefer a broader search over a narrow one`

export interface SearchFilter {
  where: Record<string, unknown>
  orderBy: Record<string, string> | null
  explanation: string
}

function parseResult(text: string): SearchFilter {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const raw = JSON.parse(cleaned) as Record<string, unknown>

  const where =
    raw.where && typeof raw.where === 'object'
      ? (raw.where as Record<string, unknown>)
      : { deletedAt: null }

  // Ensure deletedAt: null is always present
  if (!('deletedAt' in where)) {
    where.deletedAt = null
  }

  const orderBy =
    raw.orderBy && typeof raw.orderBy === 'object'
      ? (raw.orderBy as Record<string, string>)
      : null

  const explanation =
    typeof raw.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim()
      : 'Search results'

  return { where, orderBy, explanation }
}

export async function buildSearchFilter(
  query: string,
  today: string,
): Promise<SearchFilter> {
  const client = await getAnthropic()
  const resp = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Query: "${query}"`,
      },
    ],
  })

  const textBlock = resp.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text block in response')
  }

  try {
    return parseResult(textBlock.text)
  } catch (e) {
    console.error('[ai-search] parse failed', e, textBlock.text.slice(0, 500))
    throw new Error('Could not parse search filter')
  }
}
