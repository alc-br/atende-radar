import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from './db'

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        // Demo auth: accept any email with password 'demo123'
        // In production, this would check against User model
        if (!credentials?.email || !credentials?.password) return null
        if (credentials.password !== 'demo123') return null
        const email = credentials.email.trim().toLowerCase()

        // Find or create user in our OrganizationMember table
        const member = await db.organizationMember.findFirst({
          where: { email, status: 'active' },
        })

        if (!member) {
          // Auto-create for demo — sempre na organização de demonstração, nunca na de um cliente (até o B1/B7)
          const org = await db.organization.findUnique({ where: { id: process.env.DEMO_ORG_ID || 'org_seed_1' } })
          if (!org) return null
          // e-mail suspenso não pode "renascer" como demo
          if (await db.organizationMember.findFirst({ where: { email } })) return null
          const newMember = await db.organizationMember.create({
            data: {
              organizationId: org.id,
              userId: email,
              name: email.split('@')[0],
              email,
              role: 'gestor',
              team: 'Recepção',
              status: 'active',
            },
          })
          return {
            id: newMember.id,
            email: newMember.email,
            name: newMember.name,
            role: newMember.role,
          }
        }

        return {
          id: member.id,
          email: member.email,
          name: member.name,
          role: member.role,
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub || ''
        ;(session.user as any).role = token.role
        ;(session.user as any).name = token.name
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        ;(token as any).role = (user as any).role
        ;(token as any).name = (user as any).name
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
}