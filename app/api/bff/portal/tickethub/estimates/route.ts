import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { verifyPortalHmac } from "@/app/lib/bff-hmac"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: { clientName: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientName) return NextResponse.json({ ok: false, error: "clientName required" }, { status: 400 })

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true, name: true },
  })
  if (!client) return NextResponse.json({ ok: true, client: null, estimates: [] })

  const estimates = await prisma.tH_Estimate.findMany({
    where: { clientId: client.id, status: { not: "DRAFT" } },
    select: {
      id: true,
      estimateNumber: true,
      title: true,
      status: true,
      totalAmount: true,
      validUntil: true,
      sentAt: true,
      approvedAt: true,
      declinedAt: true,
      convertedAt: true,
      createdAt: true,
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  })

  return NextResponse.json({ ok: true, client, estimates })
}
