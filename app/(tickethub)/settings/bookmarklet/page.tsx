import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'
import { BookmarkletButton } from './BookmarkletButton'

export const dynamic = 'force-dynamic'

const TH_ORIGIN = process.env.NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com'

// Bookmarklet source — minified inline for the href. Captures:
//   - Page title  → ?title=
//   - Selected text (or page URL alone) → ?description=
// Then opens a new TicketHub /tickets/new tab with both prefilled.
// The single-quote literal inside is escaped for inclusion in JSX `href`.
const BOOKMARKLET = `javascript:(function(){var s=getSelection().toString(),t=(document.title||s.split('\\n')[0]||'').slice(0,80),d=s?s+'\\n\\nSource: '+location.href:'Source: '+location.href;open('${TH_ORIGIN}/tickets/new?title='+encodeURIComponent(t)+'&description='+encodeURIComponent(d),'_blank')})();`

export default async function BookmarkletPage() {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/settings"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Create-from-Email Bookmarklet
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          A one-click way to turn whatever you&apos;re reading — an Outlook /
          Gmail message, a vendor advisory, a forum thread — into a TicketHub
          ticket. The page title becomes the ticket title; selected text
          becomes the description.
        </p>
      </header>

      <section className="th-card max-w-3xl space-y-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Drag this button to your bookmarks bar
          </p>
          <div className="mt-3">
            <BookmarkletButton href={BOOKMARKLET} />
          </div>
          <p className="mt-2 text-xs text-th-text-muted">
            Clicking it here does nothing — drag it to your browser&apos;s
            bookmarks bar so it&apos;s available everywhere.
          </p>
        </div>

        <details className="rounded-md border border-th-border bg-th-base/40">
          <summary className="cursor-pointer px-3 py-2 text-xs font-mono uppercase tracking-wider text-th-text-muted">
            Or copy the bookmarklet code
          </summary>
          <pre className="overflow-x-auto px-3 py-2 text-[11px] text-slate-300">
            {BOOKMARKLET}
          </pre>
          <p className="px-3 pb-3 text-[11px] text-th-text-muted">
            Add a new bookmark in your browser, paste the code above as the URL,
            and name it something like &ldquo;New Ticket from this page.&rdquo;
          </p>
        </details>
      </section>

      <section className="mt-6 max-w-3xl space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          How to use
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-th-text-secondary">
          <li>
            Open the email (or web page) you want to turn into a ticket.
          </li>
          <li>
            Select the relevant text — error messages, the customer&apos;s
            quoted body, the parts of a vendor advisory that matter. Or
            select nothing; the page URL alone is fine.
          </li>
          <li>
            Click the bookmark. A new TicketHub tab opens with the title +
            description filled in, the &ldquo;Source&rdquo; URL appended.
          </li>
          <li>
            Pick the client (if not already auto-matched), tweak fields,
            submit.
          </li>
        </ol>
      </section>

      <section className="mt-6 max-w-3xl space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          What it captures
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-th-text-secondary">
          <li>
            <span className="font-mono text-accent">title</span> ← the page
            title (or first selected line if there is no title).
          </li>
          <li>
            <span className="font-mono text-accent">description</span> ← your
            selection (if any), with the page&apos;s URL appended as
            &ldquo;Source:&rdquo;.
          </li>
          <li>
            <span className="font-mono text-accent">contactEmail</span> ←
            <em> not</em> auto-extracted in v1; we found the regex match too
            unreliable across email clients. You can pass it manually by
            adding{' '}
            <code className="font-mono text-[11px]">
              &amp;contactEmail=foo@bar.com
            </code>{' '}
            to the URL — TicketHub will pre-select that contact&apos;s client.
          </li>
        </ul>
      </section>

      <section className="mt-6 max-w-3xl space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Mobile (iOS Safari, Android Chrome)
        </h2>
        <p className="text-sm text-th-text-secondary">
          Bookmarklets work on mobile but installing them is fiddly:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-th-text-secondary">
          <li>Bookmark this page (any easy-to-edit page works).</li>
          <li>
            Open the bookmark editor and replace the URL with the bookmarklet
            code above.
          </li>
          <li>
            Rename it. From any page, type the bookmark&apos;s name in the
            address bar and tap it to fire.
          </li>
        </ol>
        <p className="text-xs text-th-text-muted">
          On iOS, share-sheet → &ldquo;Add to Reading List&rdquo; doesn&apos;t
          work; you must edit a saved bookmark.
        </p>
      </section>
    </div>
  )
}
