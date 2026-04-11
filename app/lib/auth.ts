import type { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { prisma } from '@/app/lib/prisma'

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user, profile }) {
      if (!user.email) return false
      const entraId = (profile as { oid?: string } | undefined)?.oid
      try {
        const existing = await prisma.tH_User.findUnique({
          where: { email: user.email },
        })
        if (existing) {
          if (entraId && existing.entraId !== entraId) {
            await prisma.tH_User.update({
              where: { id: existing.id },
              data: { entraId },
            })
          }
          return existing.isActive
        }
        // First-time sign-in: auto-provision as TECH. Admin promotes later.
        if (!entraId) return false
        await prisma.tH_User.create({
          data: {
            entraId,
            email: user.email,
            name: user.name ?? user.email,
            role: 'TECH',
          },
        })
        return true
      } catch (e) {
        console.error('[auth] signIn error', e)
        return false
      }
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.tH_User.findUnique({
          where: { email: user.email },
        })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
}
