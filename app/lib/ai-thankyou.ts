import { getAnthropic, AI_MODEL } from './ai'

export type ReplyIntent = 'thank_you' | 'action_required'

const SYSTEM_PROMPT = `You classify whether a customer email reply to a closed/resolved support ticket requires further action or is simply an acknowledgement/thank-you.

Return ONLY a JSON object — no prose, no markdown fences:

{
  "intent": "thank_you" | "action_required",
  "confidence": number,
  "reason": string
}

## Classification rules

**thank_you** — the reply does NOT need further work. Examples:
- "Thanks!", "Thank you", "Got it", "Perfect", "Looks good"
- "Appreciate the help", "That fixed it", "All set now"
- Thumbs up, emoji-only responses, "+1"
- "Thanks, we're good" even with extra pleasantries
- Auto-signatures / disclaimers after a short thank-you

**action_required** — the reply needs a tech to look at it. Examples:
- "Actually it's still not working"
- "One more thing..."
- New questions or new issues
- "The same problem came back"
- Requests for documentation, follow-up, or scheduling
- Any reply longer than ~3 sentences that describes a problem

When in doubt, lean toward action_required — it's safer to reopen a ticket unnecessarily than to miss a real issue.

confidence: 0.0 to 1.0. If the email is ambiguous, set confidence below 0.7.
reason: One sentence, under 80 chars.`

function parseResult(text: string): {
  intent: ReplyIntent
  confidence: number
  reason: string
} {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const raw = JSON.parse(cleaned) as Record<string, unknown>

  const intent =
    raw.intent === 'thank_you' ? 'thank_you' : 'action_required'
  const confidence =
    typeof raw.confidence === 'number' &&
    Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.5
  const reason =
    typeof raw.reason === 'string' && raw.reason.trim()
      ? raw.reason.trim()
      : ''

  return { intent, confidence, reason }
}

/**
 * Classify a customer reply on a closed ticket.
 * Returns intent + confidence. Caller decides the threshold.
 * Falls back to "action_required" on any AI error so we never
 * silently swallow a real issue.
 */
export async function classifyReplyIntent(emailBody: string): Promise<{
  intent: ReplyIntent
  confidence: number
  reason: string
}> {
  // Short-circuit obvious thank-yous without burning an API call
  const trimmed = emailBody.trim()
  const shortMsg = trimmed.split(/\s+/).length <= 8
  if (shortMsg) {
    const lower = trimmed.toLowerCase().replace(/[^a-z\s]/g, '')
    const thankPatterns = [
      'thanks',
      'thank you',
      'thx',
      'ty',
      'got it',
      'perfect',
      'looks good',
      'all set',
      'appreciate it',
      'that worked',
      'fixed',
    ]
    if (thankPatterns.some((p) => lower.includes(p))) {
      return {
        intent: 'thank_you',
        confidence: 0.95,
        reason: 'Short message with clear thank-you pattern',
      }
    }
  }

  try {
    const client = getAnthropic()
    // Truncate very long emails — classification only needs the first bit
    const truncated =
      emailBody.length > 2000
        ? emailBody.slice(0, 2000) + '\n[truncated]'
        : emailBody

    const resp = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Customer reply to a closed ticket:\n\n${truncated}`,
        },
      ],
    })

    const textBlock = resp.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text block in response')
    }
    return parseResult(textBlock.text)
  } catch (e) {
    console.error('[ai-thankyou] classification failed, defaulting to action_required', e)
    return {
      intent: 'action_required',
      confidence: 0,
      reason: 'AI classification failed — treating as action required',
    }
  }
}
