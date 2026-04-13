import Anthropic from '@anthropic-ai/sdk'
import { getConfig } from '@/app/lib/settings'

let client: Anthropic | null = null
let clientKeyHash: string | null = null

export async function getAnthropic(): Promise<Anthropic> {
  const apiKey = await getConfig('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  // Recreate client if key changed (e.g. updated via admin UI)
  const keyHash = apiKey.slice(-8)
  if (!client || clientKeyHash !== keyHash) {
    client = new Anthropic({ apiKey })
    clientKeyHash = keyHash
  }
  return client
}

export const AI_MODEL = 'claude-sonnet-4-6'
