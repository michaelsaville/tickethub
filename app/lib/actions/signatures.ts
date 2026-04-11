'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/uploads'

export type SignatureResult = { ok: true } | { ok: false; error: string }

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

/**
 * Save a captured signature to disk and record a TH_Signature row.
 * `dataUrl` is a PNG data URL produced by the client canvas.
 */
export async function createSignature(
  ticketId: string,
  input: {
    signedByName: string
    dataUrl: string
    gpsLat?: number
    gpsLng?: number
  },
): Promise<SignatureResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const name = input.signedByName?.trim()
  if (!name) return { ok: false, error: 'Signer name required' }
  if (!input.dataUrl?.startsWith('data:image/png;base64,')) {
    return { ok: false, error: 'Invalid signature data' }
  }

  const base64 = input.dataUrl.slice('data:image/png;base64,'.length)
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) {
    return { ok: false, error: 'Empty signature' }
  }
  if (buffer.length > 500 * 1024) {
    return { ok: false, error: 'Signature too large' }
  }

  try {
    const dir = path.join(UPLOADS_DIR, 'signatures', ticketId)
    await fs.mkdir(dir, { recursive: true })
    const filename = `${randomUUID()}.png`
    await fs.writeFile(path.join(dir, filename), buffer)
    const relativePath = path.posix.join('signatures', ticketId, filename)

    await prisma.$transaction(async (tx) => {
      await tx.tH_Signature.create({
        data: {
          ticketId,
          signedByName: name,
          signatureUrl: relativePath,
          gpsLat: input.gpsLat ?? null,
          gpsLng: input.gpsLng ?? null,
        },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: 'SIGNATURE_CAPTURED',
          data: { signedByName: name },
        },
      })
    })

    revalidatePath(`/tickets/${ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/signatures] create failed', e)
    return { ok: false, error: 'Failed to save signature' }
  }
}

export async function deleteSignature(
  signatureId: string,
): Promise<SignatureResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const sig = await prisma.tH_Signature.findUnique({
      where: { id: signatureId },
      select: { id: true, ticketId: true, signatureUrl: true },
    })
    if (!sig) return { ok: false, error: 'Not found' }
    await prisma.tH_Signature.delete({ where: { id: signatureId } })
    try {
      await fs.unlink(path.resolve(UPLOADS_DIR, sig.signatureUrl))
    } catch {
      // file missing is fine
    }
    revalidatePath(`/tickets/${sig.ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/signatures] delete failed', e)
    return { ok: false, error: 'Failed to delete signature' }
  }
}
