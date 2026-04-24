import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TicketHub',
  description: 'MSP Ticketing & Operations — Precision Computers',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#F97316',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-th-base text-slate-200 antialiased">
        {children}
      </body>
    </html>
  )
}
