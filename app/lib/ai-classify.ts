import { getAnthropic, AI_MODEL } from './ai'

export interface ClassificationResult {
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  type:
    | 'INCIDENT'
    | 'SERVICE_REQUEST'
    | 'PROBLEM'
    | 'CHANGE'
    | 'MAINTENANCE'
    | 'INTERNAL'
  category: string
  suggestedAssigneeName: string | null
  reasoning: string
}

const SYSTEM_PROMPT = `You are an MSP ticket classifier for a small managed-service-provider (MSP).
Given a ticket title, description, client name, and a list of available technicians,
return structured classification.

Return ONLY a JSON object matching this schema — no prose, no markdown fences:

{
  "priority": "URGENT" | "HIGH" | "MEDIUM" | "LOW",
  "type": "INCIDENT" | "SERVICE_REQUEST" | "PROBLEM" | "CHANGE" | "MAINTENANCE" | "INTERNAL",
  "category": string,
  "suggestedAssigneeName": string | null,
  "reasoning": string
}

## Priority rules
- URGENT: total outage, security breach, data loss, server down, all users affected
- HIGH: major degradation, single critical system down, VIP user affected, SLA at risk
- MEDIUM: partial issue, workaround exists, single user non-critical, scheduled work
- LOW: cosmetic, nice-to-have, informational, documentation request

## Type rules
- INCIDENT: something is broken or not working as expected
- SERVICE_REQUEST: user asking for something new (access, setup, install, account creation)
- PROBLEM: recurring root-cause investigation across multiple incidents
- CHANGE: planned infrastructure or configuration change
- MAINTENANCE: scheduled upkeep, patching, updates, cleanups
- INTERNAL: internal team task, not client-facing

## Category
Pick a short category label (2-4 words) that describes the domain. Examples:
"Network Connectivity", "Email/Exchange", "Printer Issue", "Server Down",
"User Access", "VPN/Remote Access", "Backup Failure", "Security Incident",
"Hardware Replacement", "Software Install", "Account Setup", "Phone System",
"Cloud/M365", "Firewall/DNS", "Workstation Issue", "Data Recovery",
"Virus/Malware", "Performance", "Monitoring Alert", "General Request"

## Assignee suggestion
If the tech list includes someone whose name suggests a specialty match (e.g. a
network issue and a tech whose role is network-focused), suggest them. Otherwise
return null. Only suggest from the provided list. Use the exact name string.

## Reasoning
One sentence explaining your classification. Keep under 120 chars.`

function parseResult(text: string): ClassificationResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const raw = JSON.parse(cleaned) as Record<string, unknown>

  const PRIORITIES = new Set(['URGENT', 'HIGH', 'MEDIUM', 'LOW'])
  const TYPES = new Set([
    'INCIDENT',
    'SERVICE_REQUEST',
    'PROBLEM',
    'CHANGE',
    'MAINTENANCE',
    'INTERNAL',
  ])

  const priority = PRIORITIES.has(raw.priority as string)
    ? (raw.priority as ClassificationResult['priority'])
    : 'MEDIUM'
  const type = TYPES.has(raw.type as string)
    ? (raw.type as ClassificationResult['type'])
    : 'INCIDENT'

  return {
    priority,
    type,
    category:
      typeof raw.category === 'string' && raw.category.trim()
        ? raw.category.trim()
        : 'General',
    suggestedAssigneeName:
      typeof raw.suggestedAssigneeName === 'string' &&
      raw.suggestedAssigneeName.trim()
        ? raw.suggestedAssigneeName.trim()
        : null,
    reasoning:
      typeof raw.reasoning === 'string' && raw.reasoning.trim()
        ? raw.reasoning.trim()
        : '',
  }
}

export async function classifyTicket(input: {
  title: string
  description: string | null
  clientName: string
  techNames: string[]
}): Promise<ClassificationResult> {
  const client = getAnthropic()

  const userMessage = [
    `Title: ${input.title}`,
    input.description ? `Description: ${input.description}` : null,
    `Client: ${input.clientName}`,
    `Available techs: ${input.techNames.length ? input.techNames.join(', ') : 'none listed'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const resp = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const textBlock = resp.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text block in Claude response')
  }

  try {
    return parseResult(textBlock.text)
  } catch (e) {
    console.error(
      '[ai-classify] parse failed',
      e,
      textBlock.text.slice(0, 500),
    )
    throw new Error('Could not parse classification from model output')
  }
}
