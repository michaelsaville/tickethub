import type { NextConfig } from 'next'

// Workbox Background Sync — mutating requests to /api/tickets/* that fail
// while the tab is closed get parked in the browser's sync queue and
// replayed by the service worker when connectivity returns, even if no
// tab is open. The in-tab Dexie queue still handles the common "offline
// mid-session" case; every server endpoint behind these URLs enforces
// clientOpId idempotency, so double-replay via both queues is safe.
const MUTATION_PATTERN =
  /^https?:\/\/[^/]+\/api\/(tickets|attachments|signatures|timer)(\/|$)/i

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Never precache API routes — the service worker was intercepting
  // /api/auth/callback/azure-ad and replaying it, which triggers
  // AADSTS54005 "authorization code was already redeemed" because
  // Entra's codes are single-use.
  exclude: [/\/api\//, /middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: MUTATION_PATTERN,
      method: 'POST',
      handler: 'NetworkOnly',
      options: {
        backgroundSync: {
          name: 'tickethub-mutations',
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    {
      urlPattern: MUTATION_PATTERN,
      method: 'PATCH',
      handler: 'NetworkOnly',
      options: {
        backgroundSync: {
          name: 'tickethub-mutations',
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    {
      urlPattern: MUTATION_PATTERN,
      method: 'DELETE',
      handler: 'NetworkOnly',
      options: {
        backgroundSync: {
          name: 'tickethub-mutations',
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    // Everything else under /api/* still goes straight to the network
    // with no caching. Keeps auth callbacks / GET reads unmolested.
    {
      urlPattern: /^https?.*\/api\/.*$/i,
      handler: 'NetworkOnly',
    },
  ],
})

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazon.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3001'],
    },
  },
}

module.exports = withPWA(nextConfig)
