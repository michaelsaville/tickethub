import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import {
  syncroConfigured,
  getUnapprovedEstimates,
  estimateUrl,
} from '@/app/lib/syncro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Polls SyncroMSP for unapproved estimates and creates/updates reminders.
 * Self-throttles to actually poll once per hour even if called every 5 min.
 */

// In-memory last-poll tracker (resets on container restart — that's fine)
let lastPollAt = 0
const POLL_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace(/^Bearer\s+/i, '')
  const secret = process.env.CRON_SECRET
  if (!secret || bearer !== secret) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  }

  if (!syncroConfigured()) {
    return NextResponse.json({
      data: { skipped: 'Syncro not configured — set SYNCRO_API_KEY and SYNCRO_SUBDOMAIN' },
    })
  }

  const now = Date.now()
  if (now - lastPollAt < POLL_INTERVAL_MS) {
    return NextResponse.json({
      data: { skipped: 'Throttled — last poll was less than 1 hour ago' },
    })
  }
  lastPollAt = now

  try {
    const estimates = await getUnapprovedEstimates()

    let created = 0
    let skipped = 0
    let acknowledged = 0

    for (const est of estimates) {
      const externalRef = String(est.id)

      // Check if reminder already exists
      const existing = await prisma.tH_Reminder.findUnique({
        where: {
          source_externalRef: {
            source: 'SYNCRO_ESTIMATE',
            externalRef,
          },
        },
        select: { id: true, status: true },
      })

      if (existing) {
        skipped++
        continue
      }

      // Try to find the client contact by customer name match
      const client = await prisma.tH_Client.findFirst({
        where: {
          OR: [
            { name: { contains: est.customer_name, mode: 'insensitive' } },
            { shortCode: { equals: est.customer_name, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          contacts: {
            where: { isActive: true, isPrimary: true },
            take: 1,
            select: { id: true },
          },
        },
      })

      if (!client || client.contacts.length === 0) {
        // Can't match to a contact — skip (log it)
        console.warn(
          `[syncro-poll] no contact match for estimate ${est.id} (customer: ${est.customer_name})`,
        )
        continue
      }

      await prisma.tH_Reminder.create({
        data: {
          contactId: client.contacts[0].id,
          source: 'SYNCRO_ESTIMATE',
          externalRef,
          title: `Estimate awaiting approval: ${est.name || `#${est.number}`}`,
          body: `Amount: $${est.total}\nCreated: ${new Date(est.created_at).toLocaleDateString()}`,
          actionUrl: estimateUrl(est.id),
          recurrence: 'EVERY_3_DAYS',
          nextNotifyAt: new Date(),
        },
      })
      created++
    }

    // Check for estimates that were approved — acknowledge their reminders
    const activeReminders = await prisma.tH_Reminder.findMany({
      where: {
        source: 'SYNCRO_ESTIMATE',
        status: 'ACTIVE',
        externalRef: { not: null },
      },
      select: { id: true, externalRef: true },
    })

    const activeEstimateIds = new Set(estimates.map((e) => String(e.id)))
    for (const rem of activeReminders) {
      if (rem.externalRef && !activeEstimateIds.has(rem.externalRef)) {
        // Estimate is no longer in "sent" status — it was approved or declined
        await prisma.tH_Reminder.update({
          where: { id: rem.id },
          data: {
            status: 'ACKNOWLEDGED',
            acknowledgedAt: new Date(),
          },
        })
        acknowledged++
      }
    }

    return NextResponse.json({
      data: {
        polledAt: new Date().toISOString(),
        estimatesFound: estimates.length,
        created,
        skipped,
        acknowledged,
      },
    })
  } catch (e) {
    console.error('[syncro-poll] failed', e)
    return NextResponse.json({
      data: null,
      error: e instanceof Error ? e.message : 'Syncro poll failed',
    }, { status: 500 })
  }
}
