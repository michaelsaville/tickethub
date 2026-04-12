'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSignature } from '@/app/lib/actions/signatures'
import { enqueueRequest } from '@/app/lib/sync-queue'

type Signature = {
  id: string
  signedByName: string
  createdAt: Date | string
}

export function SignatureCard({
  ticketId,
  initial,
}: {
  ticketId: string
  initial: Signature[]
}) {
  const [showCapture, setShowCapture] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function remove(id: string) {
    if (!confirm('Delete this signature?')) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteSignature(id)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <div className="th-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Signatures ({initial.length})
        </div>
        <button
          type="button"
          onClick={() => setShowCapture(true)}
          className="th-btn-secondary text-xs"
        >
          ✍️ Capture
        </button>
      </div>

      {err && (
        <div className="mb-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}

      {initial.length === 0 ? (
        <p className="text-xs text-th-text-muted">
          No signatures captured yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {initial.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-md border border-th-border bg-th-base p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/signatures/${s.id}`}
                alt={`Signature by ${s.signedByName}`}
                className="h-16 w-auto rounded bg-white"
              />
              <div className="flex-1 text-sm">
                <div className="font-medium text-slate-100">
                  {s.signedByName}
                </div>
                <div className="text-xs text-th-text-muted">
                  {new Date(s.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={isPending}
                className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCapture && (
        <CaptureDialog
          ticketId={ticketId}
          onClose={() => setShowCapture(false)}
        />
      )}
    </div>
  )
}

function CaptureDialog({
  ticketId,
  onClose,
}: {
  ticketId: string
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [signedByName, setSignedByName] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Scale for device pixel ratio so strokes stay crisp
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#0a0f1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    let drawing = false
    let lastX = 0
    let lastY = 0

    function pos(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    function down(e: PointerEvent) {
      e.preventDefault()
      drawing = true
      const { x, y } = pos(e)
      lastX = x
      lastY = y
    }
    function move(e: PointerEvent) {
      if (!drawing) return
      e.preventDefault()
      const { x, y } = pos(e)
      ctx!.beginPath()
      ctx!.moveTo(lastX, lastY)
      ctx!.lineTo(x, y)
      ctx!.stroke()
      lastX = x
      lastY = y
      setHasInk(true)
    }
    function up() {
      drawing = false
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  function save() {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!signedByName.trim()) {
      setErr('Enter signer name')
      return
    }
    if (!hasInk) {
      setErr('Sign in the box first')
      return
    }
    setErr(null)
    const dataUrl = canvas.toDataURL('image/png')
    // Best-effort GPS — don't block on user refusing geolocation
    navigator.geolocation?.getCurrentPosition(
      (p) => submit(dataUrl, p.coords.latitude, p.coords.longitude),
      () => submit(dataUrl),
      { timeout: 2000, enableHighAccuracy: false },
    )
  }

  const router = useRouter()
  function submit(dataUrl: string, gpsLat?: number, gpsLng?: number) {
    startTransition(async () => {
      try {
        const res = await enqueueRequest({
          type: 'CAPTURE_SIGNATURE',
          entityType: 'TICKET',
          entityId: ticketId,
          url: `/api/tickets/${ticketId}/signatures`,
          body: {
            signedByName: signedByName.trim(),
            dataUrl,
            gpsLat,
            gpsLng,
          },
        })
        if (res.synced) router.refresh()
        onClose()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="th-card w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 font-mono text-sm uppercase tracking-wider text-accent">
          Capture Signature
        </h2>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Signer Name
        </label>
        <input
          value={signedByName}
          onChange={(e) => setSignedByName(e.target.value)}
          placeholder="Printed name"
          className="th-input mb-3"
        />
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Sign below
        </div>
        <canvas
          ref={canvasRef}
          className="h-48 w-full touch-none rounded-md border border-th-border bg-white"
          style={{ touchAction: 'none' }}
        />
        {err && (
          <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            {err}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={clear} className="th-btn-ghost text-xs">
            Clear
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="th-btn-ghost"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="th-btn-primary"
              disabled={isPending}
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
