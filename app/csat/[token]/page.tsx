import { notFound } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { CsatForm } from './CsatForm'

export const dynamic = 'force-dynamic'

export default async function CsatPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ score?: string }>
}) {
  const { token } = await params
  const { score: scoreParam } = await searchParams
  const initialScore = scoreParam ? parseInt(scoreParam, 10) : null
  const validInitial =
    initialScore && initialScore >= 1 && initialScore <= 5 ? initialScore : null

  const survey = await prisma.tH_CsatSurvey.findUnique({
    where: { token },
    include: {
      ticket: { select: { ticketNumber: true, title: true } },
    },
  })
  if (!survey) notFound()

  const alreadyResponded = !!survey.respondedAt

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-xl p-6 pt-16">
        <header className="mb-8 text-center">
          <h1 className="font-mono text-2xl">How did we do?</h1>
          <p className="mt-2 text-sm text-slate-400">
            Ticket #TH-{survey.ticket.ticketNumber} &mdash; {survey.ticket.title}
          </p>
        </header>

        {alreadyResponded ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="mb-3 text-3xl">{'★'.repeat(survey.score ?? 0)}</div>
            <p className="text-sm text-slate-300">
              Thanks &mdash; we recorded your response on{' '}
              {survey.respondedAt!.toLocaleDateString()}.
            </p>
          </div>
        ) : (
          <CsatForm token={token} initialScore={validInitial} />
        )}
      </div>
    </div>
  )
}
