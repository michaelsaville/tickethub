import { getAnthropic, AI_MODEL } from './ai'

const SYSTEM_PROMPT = `You are an MSP support assistant. Given a ticket's title, description, and a list of similar resolved tickets with their resolution notes, suggest actionable resolution steps.

Return ONLY a JSON object — no prose, no markdown fences:

{
  "steps": string[],
  "similarTicketNumbers": number[],
  "confidence": string
}

## Rules

- steps: 3-7 concise action items the tech should try, ordered from most likely fix to least likely. Each step should be a direct instruction ("Check X", "Reset Y", "Verify Z"), not a question.
- similarTicketNumbers: which of the provided similar tickets informed your suggestions (by ticket number). Empty array if none were relevant.
- confidence: "high" if strong pattern match from past tickets, "medium" if partial match, "low" if mostly guessing from the title/description alone.
- If no similar tickets are provided or none are relevant, suggest generic troubleshooting steps based on the ticket title/description.
- Keep each step under 120 chars.
- Do NOT suggest "contact vendor" or "escalate" as first steps — those are last resorts.
- Focus on what a field tech can do immediately.`

export interface ResolutionSuggestion {
  steps: string[]
  similarTicketNumbers: number[]
  confidence: 'high' | 'medium' | 'low'
}

function parseResult(text: string): ResolutionSuggestion {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const raw = JSON.parse(cleaned) as Record<string, unknown>

  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 7)
    : []

  const similarTicketNumbers = Array.isArray(raw.similarTicketNumbers)
    ? raw.similarTicketNumbers.filter(
        (n): n is number => typeof n === 'number' && Number.isFinite(n),
      )
    : []

  const confidence =
    raw.confidence === 'high' || raw.confidence === 'medium'
      ? raw.confidence
      : 'low'

  return { steps, similarTicketNumbers, confidence }
}

export async function suggestResolution(input: {
  title: string
  description: string | null
  similarTickets: Array<{
    ticketNumber: number
    title: string
    resolution: string | null
  }>
}): Promise<ResolutionSuggestion> {
  const client = await getAnthropic()

  const similarBlock = input.similarTickets.length
    ? input.similarTickets
        .map(
          (t) =>
            `#${t.ticketNumber}: ${t.title}${t.resolution ? `\n  Resolution: ${t.resolution}` : ''}`,
        )
        .join('\n')
    : 'No similar resolved tickets found.'

  const userMessage = [
    `Current ticket title: ${input.title}`,
    input.description
      ? `Description: ${input.description.slice(0, 1500)}`
      : null,
    '',
    `Similar resolved tickets:`,
    similarBlock,
  ]
    .filter((l) => l !== null)
    .join('\n')

  const resp = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const textBlock = resp.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text block in response')
  }

  try {
    return parseResult(textBlock.text)
  } catch (e) {
    console.error(
      '[ai-resolution] parse failed',
      e,
      textBlock.text.slice(0, 500),
    )
    throw new Error('Could not parse resolution suggestions')
  }
}
