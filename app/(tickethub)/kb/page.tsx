import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

export const dynamic = 'force-dynamic'

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const sp = await searchParams
  const where: Record<string, unknown> = {}
  if (sp.q) {
    where.OR = [
      { title: { contains: sp.q, mode: 'insensitive' } },
      { body: { contains: sp.q, mode: 'insensitive' } },
    ]
  }
  if (sp.tag) {
    where.tags = { has: sp.tag }
  }

  const articles = await prisma.tH_KBArticle.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      tags: true,
      sourceTicketId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  // Get all unique tags for filter chips
  const allTags = [...new Set(articles.flatMap((a) => a.tags))].sort()

  return (
    <div className="p-6 max-w-4xl">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">Knowledge Base</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {articles.length} {articles.length === 1 ? 'article' : 'articles'}
          {sp.q && ` matching "${sp.q}"`}
          {sp.tag && ` tagged "${sp.tag}"`}
        </p>
      </header>

      {/* Search + tag filters */}
      <form className="mb-4 flex gap-2" action="/kb" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Search articles..."
          className="th-input max-w-xs"
        />
        <button type="submit" className="th-btn-primary text-sm">Search</button>
        {(sp.q || sp.tag) && (
          <Link href="/kb" className="rounded border border-th-border px-3 py-1.5 text-xs text-slate-400 hover:bg-th-elevated">
            Clear
          </Link>
        )}
      </form>

      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <Link
              key={tag}
              href={`/kb?tag=${encodeURIComponent(tag)}`}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                sp.tag === tag
                  ? 'bg-amber-500/30 text-amber-300'
                  : 'bg-th-elevated text-slate-400 hover:text-slate-200'
              }`}
            >
              {tag}
            </Link>
          ))}
        </div>
      )}

      {/* Article list */}
      <div className="space-y-2">
        {articles.length === 0 && (
          <div className="th-card py-12 text-center">
            <p className="text-sm text-slate-500">
              No articles yet. Resolve a ticket and click &quot;Convert to KB Article&quot;.
            </p>
          </div>
        )}
        {articles.map((a) => (
          <Link
            key={a.id}
            href={`/kb/${a.id}`}
            className="th-card block hover:border-accent/40 transition-colors"
          >
            <h2 className="text-sm font-medium text-slate-200">{a.title}</h2>
            <div className="mt-1 flex items-center gap-2">
              {a.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300"
                >
                  {tag}
                </span>
              ))}
              {a.sourceTicketId && (
                <span className="text-[10px] text-slate-500">from ticket</span>
              )}
              <span className="text-[10px] text-slate-500 ml-auto">
                {new Date(a.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
