import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * HMAC verification for inter-app BFF calls (currently: portal → TicketHub).
 *
 * Signing scheme (kept deliberately simple — easy to get right on both sides):
 *   canonical = `${timestampMs}.${rawBody}`
 *   signature = HMAC-SHA256(secret, canonical) as lowercase hex
 *   headers:
 *     X-Portal-Timestamp: <unix-ms>
 *     X-Portal-Signature: sha256=<hex>
 *
 * Replay window is ±5 minutes. Raw body (not parsed JSON) is what's signed
 * so both sides compare bytes without worrying about key ordering.
 */

const REPLAY_WINDOW_MS = 5 * 60 * 1000
const SIGNATURE_PREFIX = "sha256="

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; status: number }

export function verifyPortalHmac(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret: string,
): VerifyResult {
  if (!secret) return { ok: false, reason: "BFF secret not configured on server", status: 500 }
  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: "missing signature or timestamp header", status: 401 }
  }
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return { ok: false, reason: "unsupported signature format", status: 401 }
  }

  const ts = parseInt(timestampHeader, 10)
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid timestamp", status: 401 }
  const skew = Math.abs(Date.now() - ts)
  if (skew > REPLAY_WINDOW_MS) {
    return { ok: false, reason: `timestamp outside ±${REPLAY_WINDOW_MS / 1000}s window`, status: 401 }
  }

  const expected = createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex")
  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length)

  const expectedBuf = Buffer.from(expected, "hex")
  const providedBuf = Buffer.from(provided, "hex")
  if (expectedBuf.length !== providedBuf.length) {
    return { ok: false, reason: "signature mismatch", status: 401 }
  }
  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, reason: "signature mismatch", status: 401 }
  }

  return { ok: true }
}
