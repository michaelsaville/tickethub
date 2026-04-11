import type { NextConfig } from 'next'
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
  // Force every /api/* request to go straight to the network with no
  // caching, no background revalidation.
  runtimeCaching: [
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
