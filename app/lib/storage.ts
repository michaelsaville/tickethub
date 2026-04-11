import 'server-only'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/uploads'

/**
 * Local filesystem attachment storage. Files are stored at
 * `{UPLOADS_DIR}/tickets/{ticketId}/{random}-{safename}`. The filename is
 * preserved (sanitized) so downloads default to something meaningful.
 * Paths returned from storeFile() are relative to UPLOADS_DIR and should
 * be saved on TH_Attachment.fileUrl; retrieveFile() re-resolves them.
 */

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160) || 'file'
}

export async function storeTicketAttachment(
  ticketId: string,
  buffer: Buffer,
  originalName: string,
): Promise<{ relativePath: string; filename: string }> {
  const filename = sanitizeFilename(originalName)
  const dir = path.join(UPLOADS_DIR, 'tickets', ticketId)
  await fs.mkdir(dir, { recursive: true })
  const stored = `${randomUUID()}-${filename}`
  const abs = path.join(dir, stored)
  await fs.writeFile(abs, buffer)
  const relativePath = path.posix.join('tickets', ticketId, stored)
  return { relativePath, filename }
}

export function resolveStoredPath(relativePath: string): string {
  // Resolve against UPLOADS_DIR and verify the result still lives under
  // UPLOADS_DIR — blocks any `..` shenanigans even if DB state is bad.
  const abs = path.resolve(UPLOADS_DIR, relativePath)
  const root = path.resolve(UPLOADS_DIR)
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error('Path escapes uploads dir')
  }
  return abs
}

export async function readStoredFile(relativePath: string): Promise<Buffer> {
  const abs = resolveStoredPath(relativePath)
  return fs.readFile(abs)
}

export async function deleteStoredFile(relativePath: string): Promise<void> {
  try {
    await fs.unlink(resolveStoredPath(relativePath))
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') throw e
  }
}
