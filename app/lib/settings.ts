/**
 * DB-backed settings with AES-256-GCM encryption.
 *
 * Integration credentials are stored encrypted in TH_Setting.
 * `getConfig(key)` checks the DB first, falls back to process.env[key].
 */

import 'server-only'
import crypto from 'crypto'
import { prisma } from '@/app/lib/prisma'

// ─── Encryption ─────────────────────────────────────────────────────────

function deriveKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for settings encryption')
  // SHA-256 the secret to get exactly 32 bytes regardless of input length
  return crypto.createHash('sha256').update(secret).digest()
}

/** AES-256-GCM encrypt. Returns `iv:ciphertext:tag` as hex. */
export function encrypt(plaintext: string): string {
  const key = deriveKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
}

/** Decrypt an `iv:ciphertext:tag` hex string. */
export function decrypt(encrypted: string): string {
  const key = deriveKey()
  const [ivHex, cipherHex, tagHex] = encrypted.split(':')
  if (!ivHex || !cipherHex || !tagHex) {
    throw new Error('Invalid encrypted value format')
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

// ─── CRUD ───────────────────────────────────────────────────────────────

/** Read a setting from DB and decrypt. Returns null if not found. */
export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.tH_Setting.findUnique({ where: { key } })
  if (!row) return null
  try {
    return decrypt(row.value)
  } catch {
    console.error(`[settings] Failed to decrypt key "${key}" — removing corrupt row`)
    await prisma.tH_Setting.delete({ where: { key } }).catch(() => {})
    return null
  }
}

/** Encrypt and upsert a setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  const encrypted = encrypt(value)
  await prisma.tH_Setting.upsert({
    where: { key },
    create: { key, value: encrypted },
    update: { value: encrypted },
  })
}

/** Remove a setting. */
export async function deleteSetting(key: string): Promise<void> {
  await prisma.tH_Setting.delete({ where: { key } }).catch(() => {})
}

// ─── Config resolution ──────────────────────────────────────────────────

/**
 * Resolve a config value: DB first, then process.env fallback.
 * Returns empty string if neither source has it.
 */
export async function getConfig(key: string): Promise<string> {
  const dbValue = await getSetting(key)
  if (dbValue) return dbValue
  return process.env[key] ?? ''
}

// ─── Automation flags ───────────────────────────────────────────────────

/**
 * Workflow-automation flags are non-secret booleans stored in the same
 * TH_Setting table (encrypted — yes, for two bytes, but it keeps the
 * storage path uniform). Defaults are applied on read.
 */
const AUTOMATION_DEFAULTS: Record<string, boolean> = {
  'onsite_workflow.enabled': true,
  /// Phase 0 automation engine event emission. When OFF, emit() is a no-op.
  /// Keep OFF in production until the Phase 1 evaluator has been verified.
  'automation.engine.emit': false,
}

export async function isAutomationEnabled(flag: keyof typeof AUTOMATION_DEFAULTS): Promise<boolean> {
  const raw = await getSetting(flag)
  if (raw === null) return AUTOMATION_DEFAULTS[flag]
  return raw === 'true'
}

export async function setAutomationEnabled(
  flag: keyof typeof AUTOMATION_DEFAULTS,
  enabled: boolean,
): Promise<void> {
  await setSetting(flag, enabled ? 'true' : 'false')
}

export type AutomationFlag = keyof typeof AUTOMATION_DEFAULTS

export function listAutomationFlags(): AutomationFlag[] {
  return Object.keys(AUTOMATION_DEFAULTS) as AutomationFlag[]
}

// ─── Allowlist ──────────────────────────────────────────────────────────

export const ALLOWED_SETTING_KEYS = [
  'ANTHROPIC_API_KEY',
  'CONNECTWISE_RMM_API_KEY',
  'CONNECTWISE_RMM_BASE_URL',
  'CONNECTWISE_RMM_COMPANY_ID',
  'CONNECTWISE_RMM_WEBHOOK_SECRET',
  'QBO_CLIENT_ID',
  'QBO_CLIENT_SECRET',
  'AMAZON_ACCESS_KEY',
  'AMAZON_SECRET_KEY',
  'AMAZON_PARTNER_TAG',
  'PUSHOVER_APP_TOKEN',
] as const

export type AllowedSettingKey = (typeof ALLOWED_SETTING_KEYS)[number]

/** Check whether a key is in the allowlist. */
export function isAllowedKey(key: string): key is AllowedSettingKey {
  return (ALLOWED_SETTING_KEYS as readonly string[]).includes(key)
}

// ─── Bulk status (for the admin UI) ─────────────────────────────────────

export interface SettingStatus {
  key: string
  source: 'db' | 'env' | 'none'
  maskedValue: string // last 4 chars or "Not set"
}

/** Return masked status for all allowed keys. */
export async function getAllSettingStatuses(): Promise<SettingStatus[]> {
  const results: SettingStatus[] = []

  for (const key of ALLOWED_SETTING_KEYS) {
    const dbValue = await getSetting(key)
    if (dbValue) {
      results.push({
        key,
        source: 'db',
        maskedValue: dbValue.length > 4 ? `****${dbValue.slice(-4)}` : '****',
      })
      continue
    }

    const envValue = process.env[key]
    if (envValue) {
      results.push({
        key,
        source: 'env',
        maskedValue: envValue.length > 4 ? `****${envValue.slice(-4)}` : '****',
      })
      continue
    }

    results.push({ key, source: 'none', maskedValue: 'Not set' })
  }

  return results
}
