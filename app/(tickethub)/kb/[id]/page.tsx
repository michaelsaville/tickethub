import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

export const dynamic = 'force-dynamic'

export default async function KbArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const { id } = await params
  const article = await prisma.tH_KBArticle.findUnique({
    where: { id },
  })
  if (!article) notFound()

  return (
    <div className="p-6 max-w-3xl">
      <header className="mb-6">
        <Link
          href="/kb"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          &larr; Back to Knowledge Base
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          {article.title}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          {article.tags.map((tag) => (
            <Link
              key={tag}
              href={`/kb?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/25"
            >
              {tag}
            </Link>
          ))}
          {article.sourceTicketId && (
            <Link
              href={`/tickets/${article.sourceTicketId}`}
              className="text-[10px] text-slate-500 hover:text-accent"
            >
              View source ticket &rarr;
            </Link>
          )}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Last updated {new Date(article.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </header>

      <div className="th-card prose prose-invert prose-sm max-w-none">
        {article.body.split('\n').map((line, i) => {
          if (line.startsWith('## ')) {
            return (
              <h2 key={i} className="mt-6 mb-2 font-mono text-lg text-slate-100">
                {line.replace('## ', '')}
              </h2>
            )
          }
          if (line.startsWith('# ')) {
            return (
              <h1 key={i} className="mt-6 mb-2 font-mono text-xl text-slate-100">
                {line.replace('# ', '')}
              </h1>
            )
          }
          if (line.trim() === '') {
            return <br key={i} />
          }
          return (
            <p key={i} className="text-sm text-slate-300 leading-relaxed">
              {line}
            </p>
          )
        })}
      </div>
    </div>
  )
}
