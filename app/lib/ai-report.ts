import { getAnthropic, AI_MODEL } from './ai'

const SYSTEM_PROMPT = `You translate natural language report requests about MSP operations into structured Prisma queries for ticket data.

Return ONLY a JSON object — no prose, no markdown fences:

{
  "queryType": "tickets" | "summary",
  "where": object,
  "orderBy": object | object[] | null,
  "groupBy": string | null,
  "select": object | null,
  "limit": number,
  "explanation": string,
  "columns": string[]
}

## Schema context

TH_Ticket model fields:
- id, ticketNumber (Int, unique), title, description (String?)
- status: NEW | OPEN | IN_PROGRESS | WAITING_CUSTOMER | WAITING_THIRD_PARTY | RESOLVED | CLOSED | CANCELLED
- priority: URGENT | HIGH | MEDIUM | LOW
- type: INCIDENT | SERVICE_REQUEST | PROBLEM | CHANGE | MAINTENANCE | INTERNAL
- createdAt, updatedAt, closedAt (DateTime?)
- slaBreached (Boolean)
- estimatedMinutes (Int?)
- deletedAt (DateTime?) — always filter where deletedAt: null
- client: { name, shortCode }
- assignedTo: { name, email }
- charges: [{ amountCents, type, status }]
- comments: [{ createdAt, isInternal }]

## queryType
- "tickets": return matching ticket rows. columns = which fields to display.
- "summary": return aggregate data (counts, sums). The server will execute a groupBy or count.

## columns
Array of display column names for the results table. Choose from:
"ticketNumber", "title", "client", "assignee", "status", "priority", "type", "created", "updated", "closed", "slaBreached"

## Rules
- Always include deletedAt: null in where
- limit: default 50, max 200
- For "this quarter" use the current quarter boundaries
- For time-based reports, order by the relevant date field
- groupBy only for summary queries — use field name like "status", "priority", "client", "assignedTo"
- explanation: one sentence under 100 chars describing the report
- For "resolution time" queries, note that closedAt - createdAt gives resolution duration
- Keep filters practical — don't over-constrain`

export interface ReportQuery {
  queryType: 'tickets' | 'summary'
  where: Record<string, unknown>
  orderBy: Record<string, string> | Record<string, string>[] | null
  groupBy: string | null
  limit: number
  explanation: string
  columns: string[]
}

function parseResult(text: string): ReportQuery {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const raw = JSON.parse(cleaned) as Record<string, unknown>

  const where =
    raw.where && typeof raw.where === 'object'
      ? (raw.where as Record<string, unknown>)
      : {}
  if (!('deletedAt' in where)) where.deletedAt = null

  const queryType = raw.queryType === 'summary' ? 'summary' : 'tickets'

  const orderBy = raw.orderBy ?? null

  const groupBy =
    typeof raw.groupBy === 'string' && raw.groupBy.trim()
      ? raw.groupBy.trim()
      : null

  const limit =
    typeof raw.limit === 'number' && raw.limit > 0
      ? Math.min(raw.limit, 200)
      : 50

  const explanation =
    typeof raw.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim()
      : 'Report results'

  const columns = Array.isArray(raw.columns)
    ? raw.columns.filter(
        (c): c is string => typeof c === 'string' && c.trim().length > 0,
      )
    : ['ticketNumber', 'title', 'client', 'status', 'priority']

  return {
    queryType,
    where: where as Record<string, unknown>,
    orderBy: orderBy as ReportQuery['orderBy'],
    groupBy,
    limit,
    explanation,
    columns,
  }
}

export async function buildReportQuery(
  prompt: string,
  today: string,
): Promise<ReportQuery> {
  const client = await getAnthropic()
  const resp = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Report request: "${prompt}"`,
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
    console.error(
      '[ai-report] parse failed',
      e,
      textBlock.text.slice(0, 500),
    )
    throw new Error('Could not build report query')
  }
}
