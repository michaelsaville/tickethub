'use client'

export function BookmarkletButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      draggable
      onClick={(e) => e.preventDefault()}
      title="Drag this to your bookmarks bar"
      className="th-btn-primary inline-flex select-none cursor-grab items-center gap-2 active:cursor-grabbing"
    >
      <span aria-hidden>+</span> New TicketHub ticket
    </a>
  )
}
