'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type ContactResult = { ok: true } | { ok: false; error: string }

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export async function createContact(
  clientId: string,
  _prev: ContactResult | null,
  formData: FormData,
): Promise<ContactResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  const firstName = (formData.get('firstName') as string | null)?.trim()
  const lastName = (formData.get('lastName') as string | null)?.trim()
  const email = (formData.get('email') as string | null)?.trim() || null
  const phone = (formData.get('phone') as string | null)?.trim() || null
  const jobTitle = (formData.get('jobTitle') as string | null)?.trim() || null
  const isPrimary = formData.get('isPrimary') === 'on'

  if (!firstName || !lastName) {
    return { ok: false, error: 'First and last name are required' }
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.tH_Contact.updateMany({
          where: { clientId, isPrimary: true },
          data: { isPrimary: false },
        })
      }
      await tx.tH_Contact.create({
        data: {
          clientId,
          firstName,
          lastName,
          email,
          phone,
          jobTitle,
          isPrimary,
        },
      })
    })

    // Cross-sync: create matching Person in DocHub (public schema)
    try {
      const thClient = await prisma.tH_Client.findUnique({
        where: { id: clientId },
        select: { name: true },
      })
      if (thClient) {
        const fullName = `${firstName} ${lastName}`.trim()
        const dhClients: { id: string }[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM public."Client" WHERE name ILIKE $1 LIMIT 1`,
          thClient.name,
        )
        if (dhClients.length > 0) {
          const existing: { id: string }[] = email
            ? await prisma.$queryRawUnsafe(
                `SELECT id FROM public."Person" WHERE "clientId" = $1 AND email ILIKE $2 LIMIT 1`,
                dhClients[0].id, email,
              )
            : []
          if (existing.length === 0) {
            const cuid = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
            await prisma.$executeRawUnsafe(
              `INSERT INTO public."Person" (id, "clientId", name, email, phone, "jobTitle", "isActive", "isPrimary", "isBilling", "isEscalation", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, true, false, false, false, NOW(), NOW())`,
              cuid, dhClients[0].id, fullName, email, phone, jobTitle,
            )
          }
        }
      }
    } catch (e) {
      console.error('[actions/contacts] DocHub cross-sync failed', e)
    }

    revalidatePath(`/clients/${clientId}`)
    revalidatePath(`/clients/${clientId}/contacts`)
    redirect(`/clients/${clientId}/contacts`)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    console.error('[actions/contacts] create failed', e)
    return { ok: false, error: 'Failed to create contact' }
  }
}

export async function deleteContact(
  clientId: string,
  contactId: string,
): Promise<ContactResult> {
  if (!(await getUserId())) return { ok: false, error: 'Unauthorized' }
  try {
    await prisma.tH_Contact.update({
      where: { id: contactId },
      data: { isActive: false },
    })
    revalidatePath(`/clients/${clientId}`)
    revalidatePath(`/clients/${clientId}/contacts`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/contacts] delete failed', e)
    return { ok: false, error: 'Failed to remove contact' }
  }
}
