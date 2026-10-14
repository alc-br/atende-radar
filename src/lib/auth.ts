import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from './db'
import { hashPassword, verifyPassword } from './passwords'
import { allow, exceeded, ipFromHeaders } from './rate-limit'
import { demoOrgId, isSimulationEmail } from './sandbox'

const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15
const DEMO_PASSWORD = 'demo123'
// Por IP: muitas senhas erradas em contas diferentes (ataque de "uma senha em muitas contas") bloqueiam o IP por 15 min.
const IP_FAILS = () => Number(process.env.LOGIN_FAILS_PER_IP || 30)
const IP_WINDOW = 15 * 60000

// Modo demonstração (até o B7 separar o ambiente demo): a senha pública só vale na organização de demonstração.
const demoEnabled = () => process.env.DEMO_AUTH_ENABLED !== 'false'

// Hash "de mentira" para gastar o mesmo tempo quando o e-mail não existe.
const DUMMY_HASH = hashPassword('nao-e-uma-senha-de-verdade')

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null
        const h = (req?.headers ?? {}) as Record<string, string | undefined>
        const ip = ipFromHeaders((n) => h[n])
        // sem IP (só fora de produção: testes locais sem proxy) não há como atribuir as tentativas
        const ipKey = ip === 'unknown' && process.env.NODE_ENV !== 'production' ? null : `login-fail:${ip}`
        if (ipKey && exceeded(ipKey, IP_FAILS(), IP_WINDOW)) return null
        const r = await check(credentials.email, credentials.password)
        if (!r && ipKey) allow(ipKey, Number.MAX_SAFE_INTEGER, IP_WINDOW) // conta a falha
        return r
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        ;(session.user as any).id = token.sub || ''
        ;(session.user as any).role = token.role
        ;(session.user as any).name = token.name
        ;(session.user as any).sv = token.sv ?? 0
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        ;(token as any).role = (user as any).role
        ;(token as any).name = (user as any).name
        ;(token as any).sv = (user as any).sv ?? 0
        ;(token as any).demo = !!(user as any).demo
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7, // a sessão expira em 7 dias
  },
}

async function check(rawEmail: string, password: string) {
  const email = rawEmail.trim().toLowerCase()
  // Membros sintéticos das empresas simuladas (@sim.invalid) nunca entram pelo login comum.
  if (isSimulationEmail(email)) {
    verifyPassword(password, DUMMY_HASH)
    return null
  }

  const member = await db.organizationMember.findFirst({ where: { email } })

  if (!member) {
    verifyPassword(password, DUMMY_HASH)
    // Demonstração: e-mail novo + senha pública cria um usuário SÓ na organização de demonstração.
    if (demoEnabled() && password === DEMO_PASSWORD) {
      const org = await db.organization.findUnique({ where: { id: demoOrgId() } })
      if (!org) return null
      const created = await db.organizationMember.create({
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
      return { id: created.id, email: created.email, name: created.name, role: created.role, sv: created.sessionVersion, demo: true }
    }
    return null
  }

  if (member.status !== 'active') {
    verifyPassword(password, DUMMY_HASH)
    return null
  }
  if (member.lockedUntil && member.lockedUntil > new Date()) {
    verifyPassword(password, DUMMY_HASH)
    return null
  }

  const ok = member.passwordHash
    ? verifyPassword(password, member.passwordHash)
    : demoEnabled() && member.organizationId === demoOrgId() && password === DEMO_PASSWORD

  if (!ok) {
    const failed = member.failedLogins + 1
    await db.organizationMember.update({
      where: { id: member.id },
      data: failed >= MAX_FAILED_LOGINS
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) }
        : { failedLogins: failed },
    })
    return null
  }

  // REQUIRE_EMAIL_VERIFICATION=true exige e-mail confirmado (ligar quando houver provedor de e-mail).
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && member.passwordHash && !member.emailVerifiedAt) return null

  await db.organizationMember.update({
    where: { id: member.id },
    data: { failedLogins: 0, lockedUntil: null, lastAccessAt: new Date() },
  })
  // entrou pela senha pública de demonstração (sem senha própria) → sessão somente leitura
  return { id: member.id, email: member.email, name: member.name, role: member.role, sv: member.sessionVersion, demo: !member.passwordHash }
}
