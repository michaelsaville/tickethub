export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-th-base">
      <header className="border-b border-th-border bg-th-surface px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <span className="font-mono text-lg text-accent">PCC2K</span>
          <span className="ml-2 text-sm text-th-text-secondary">
            Pending Items
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-8">{children}</main>
    </div>
  )
}
