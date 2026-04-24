/**
 * Organization details printed on every invoice. These are placeholders —
 * edit them once to match PCC2K's real billing info, or set the
 * corresponding env vars (ORG_NAME, ORG_ADDRESS, ORG_CITY, ORG_STATE,
 * ORG_ZIP, ORG_PHONE, ORG_EMAIL, ORG_WEBSITE) on the container and leave
 * the defaults alone.
 */

function envOr(envKey: string, fallback: string): string {
  return process.env[envKey]?.trim() || fallback
}

export const ORG = {
  name: envOr('ORG_NAME', 'Precision Computers'),
  tagline: envOr('ORG_TAGLINE', 'Precision Computers'),
  address: envOr('ORG_ADDRESS', 'PO Box 128'),
  city: envOr('ORG_CITY', 'Cumberland'),
  state: envOr('ORG_STATE', 'MD'),
  zip: envOr('ORG_ZIP', '21502'),
  phone: envOr('ORG_PHONE', '(814) 322-6908'),
  email: envOr('ORG_EMAIL', 'billing@pcc2k.com'),
  website: envOr('ORG_WEBSITE', 'https://pcc2k.com'),
}
