'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'

/**
 * Global keyboard shortcuts:
 *   j / k  — move row focus down / up across [data-shortcut-row] elements (e.g. ticket list rows)
 *   Enter  — open the focused row (uses its data-shortcut-href)
 *   c      — compose a new ticket (navigates to /tickets/new)
 *   r      — focus the comment composer when on a ticket detail page
 *   ?      — toggle the cheatsheet
 *
 * All shortcuts are ignored when the user is typing in an input / textarea /
 * contenteditable, when a modifier (cmd/ctrl/alt) is held, or when the
 * Cmd+K palette is already handling the keystroke.
 */
export function ShortcutHandler() {
  const router = useRouter()
  const pathname = usePathname()
  const activeIdxRef = useRef<number | null>(null)
  const cheatsheetRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null) {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (t.isContentEditable) return true
      return false
    }

    function getRows(): HTMLElement[] {
      return Array.from(
        document.querySelectorAll<HTMLElement>('[data-shortcut-row]')
      )
    }

    function setActive(idx: number | null) {
      const rows = getRows()
      rows.forEach((r, i) => {
        if (i === idx) r.setAttribute('data-shortcut-active', 'true')
        else r.removeAttribute('data-shortcut-active')
      })
      activeIdxRef.current = idx
      if (idx !== null && rows[idx]) {
        rows[idx].scrollIntoView({ block: 'nearest' })
      }
    }

    function toggleCheatsheet() {
      const existing = document.getElementById('th-shortcut-cheatsheet')
      if (existing) {
        existing.remove()
        cheatsheetRef.current = null
        return
      }
      const overlay = document.createElement('div')
      overlay.id = 'th-shortcut-cheatsheet'
      overlay.className =
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4'
      overlay.innerHTML = `
        <div class="w-full max-w-md rounded-lg border border-th-border bg-th-surface p-5 shadow-2xl">
          <div class="mb-3 text-sm font-semibold text-slate-100">Keyboard shortcuts</div>
          <table class="w-full text-sm">
            <tbody class="divide-y divide-th-border">
              <tr><td class="py-1.5 font-mono text-xs text-th-text-muted">⌘K / Ctrl+K</td><td class="py-1.5 text-slate-300">Open command palette</td></tr>
              <tr><td class="py-1.5 font-mono text-xs text-th-text-muted">/</td><td class="py-1.5 text-slate-300">Open command palette</td></tr>
              <tr><td class="py-1.5 font-mono text-xs text-th-text-muted">j / k</td><td class="py-1.5 text-slate-300">Next / previous row</td></tr>
              <tr><td class="py-1.5 font-mono text-xs text-th-text-muted">Enter</td><td class="py-1.5 text-slate-300">Open focused row</td></tr>
              <tr><td class="py-1.5 font-mono text-xs text-th-text-muted">c</td><td class="py-1.5 text-slate-300">Compose new ticket</td></tr>
              <tr><td class="py-1.5 font-mono text-xs text-th-text-muted">r</td><td class="py-1.5 text-slate-300">Reply (focus comment box)</td></tr>
              <tr><td class="py-1.5 font-mono text-xs text-th-text-muted">?</td><td class="py-1.5 text-slate-300">Toggle this cheatsheet</td></tr>
              <tr><td class="py-1.5 font-mono text-xs text-th-text-muted">Esc</td><td class="py-1.5 text-slate-300">Close overlays</td></tr>
            </tbody>
          </table>
          <div class="mt-3 text-[10px] text-th-text-muted">Shortcuts are ignored while typing in inputs.</div>
        </div>
      `
      overlay.addEventListener('click', () => overlay.remove())
      document.body.appendChild(overlay)
      cheatsheetRef.current = overlay
    }

    function onKey(e: KeyboardEvent) {
      // Defer to the palette / global modifier combos
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      // Don't fight the palette modal
      if (document.querySelector('[data-shortcut-skip="true"]')) return

      const key = e.key
      if (key === '?') {
        e.preventDefault()
        toggleCheatsheet()
        return
      }
      if (key === 'Escape') {
        const cs = document.getElementById('th-shortcut-cheatsheet')
        if (cs) {
          cs.remove()
          return
        }
      }
      if (key === 'j' || key === 'k') {
        const rows = getRows()
        if (rows.length === 0) return
        e.preventDefault()
        const cur = activeIdxRef.current
        let next: number
        if (cur === null) next = key === 'j' ? 0 : rows.length - 1
        else if (key === 'j') next = Math.min(rows.length - 1, cur + 1)
        else next = Math.max(0, cur - 1)
        setActive(next)
        return
      }
      if (key === 'Enter') {
        const cur = activeIdxRef.current
        if (cur === null) return
        const rows = getRows()
        const href = rows[cur]?.getAttribute('data-shortcut-href')
        if (href) {
          e.preventDefault()
          router.push(href)
        }
        return
      }
      if (key === 'c') {
        e.preventDefault()
        router.push('/tickets/new')
        return
      }
      if (key === 'r') {
        const composer = document.querySelector<HTMLTextAreaElement>(
          '[data-comment-composer]'
        )
        if (composer) {
          e.preventDefault()
          composer.focus()
          composer.scrollIntoView({ block: 'center' })
        }
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  // Reset row focus when route changes
  useEffect(() => {
    activeIdxRef.current = null
    document
      .querySelectorAll<HTMLElement>('[data-shortcut-row][data-shortcut-active]')
      .forEach((r) => r.removeAttribute('data-shortcut-active'))
  }, [pathname])

  return null
}
