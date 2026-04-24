import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const DOCHUB_URL =
  process.env.NEXT_PUBLIC_DOCHUB_URL || 'https://dochub.pcc2k.com'

export default function AssetsPage() {
  redirect(`${DOCHUB_URL}/assets`)
}
