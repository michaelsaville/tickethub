import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { verifyPortalHmac } from "@/app/lib/bff-hmac"
import { readStoredFile } from "@/app/lib/storage"

export const dynamic = "force-dynamic"

/**
 * Portal-gated attachment download. Verifies HMAC, then verifies that
 * the attachment belongs to a ticket owned by the named client before
 * streaming the bytes back. Portal proxies these onward to the end
 * user; this endpoint is never hit by a browser directly.
 */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: { clientName: string; attachmentId: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientName || !payload.attachmentId) {
    return NextResponse.json({ ok: false, error: "clientName + attachmentId required" }, { status: 400 })
  }

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 })

  const att = await prisma.tH_Attachment.findFirst({
    where: {
      id: payload.attachmentId,
      ticket: { clientId: client.id, deletedAt: null },
    },
    select: { filename: true, fileUrl: true, mimeType: true, sizeBytes: true },
  })
  if (!att) return NextResponse.json({ ok: false, error: "attachment not found" }, { status: 404 })

  try {
    const buf = await readStoredFile(att.fileUrl)
    const blob = new Blob([new Uint8Array(buf)], {
      type: att.mimeType || "application/octet-stream",
    })
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": att.mimeType || "application/octet-stream",
        "Content-Length": String(att.sizeBytes),
        "Content-Disposition": `attachment; filename="${att.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (e) {
    console.error("[bff portal attachments] read failed", e)
    return NextResponse.json({ ok: false, error: "file missing on disk" }, { status: 410 })
  }
}
