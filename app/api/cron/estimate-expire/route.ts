import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Estimate expiry cron — run daily (or every few hours) via host crontab.
// Example entry:
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     https://tickethub.pcc2k.com/api/cron/estimate-expire

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace(/^Bearer\s+/i, '')
  const secret = process.env.CRON_SECRET
  if (!secret || bearer !== secret) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const now = new Date()

  // Find all SENT estimates past their validUntil date
  const expiredEstimates = await prisma.tH_Estimate.findMany({
    where: {
      status: 'SENT',
      validUntil: { lt: now },
    },
    select: { id: true, estimateNumber: true },
  })

  let expiredCount = 0

  for (const estimate of expiredEstimates) {
    // Mark estimate as EXPIRED
    await prisma.tH_Estimate.update({
      where: { id: estimate.id },
      data: { status: 'EXPIRED' },
    })

    // Auto-acknowledge any associated TICKETHUB_ESTIMATE reminders
    await prisma.tH_Reminder.updateMany({
      where: {
        source: 'TICKETHUB_ESTIMATE',
        externalRef: estimate.id,
        status: 'ACTIVE',
      },
      data: { status: 'ACKNOWLEDGED' },
    })

    expiredCount++
  }

  return NextResponse.json({
    data: {
      checkedAt: now.toISOString(),
      expiredCount,
    },
    error: null,
  })
}
