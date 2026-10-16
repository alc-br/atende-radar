import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from './db'
import { hashPassword, verifyPassword } from './passwords'
import { allow, exceeded, ipFromHeaders } from './rate-limit'
import { isSimulationEmail } from './sandbox'

const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15
// Por IP: muitas senhas erradas em contas diferentes (ataque de "uma senha em muitas contas") bloqueiam o IP por 15 min.
const IP_FAILS = () => Number(process.env.LOGIN_FAILS_PER_IP || 30)
const IP_WINDOW = 15 * 60000

// Hash "de mentira" para gastar o mesmo tempo quando o e-mail não existe.
const DUMMY_HASH = hashPassword('nao-e-uma-senha-de-verdade')

/**
 * Bloqueio temporário: o authorize lança este erro e o NextAuth o devolve ao navegador em `result.error`
 * ("locked:<minutos>"); a tela de entrar mostra "Muitas tentativas. Tente novamente em X minutos."
 */
const LOCKED_PREFIX = 'locked:'
class LockedError extends Error {
  constructor(until: Date) {
    super(`${LOCKED_PREFIX}${Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000))}`)
  }
}

// E-mails sem conta ativa (inexistente ou suspensa) contam as falhas em memória e bloqueiam igual a uma conta real,
// para o bloqueio não revelar quais e-mails existem.
const ghostFails = new Map<string, { n: number; lockedUntil?: number }>()
function ghostLocked(email: string): Date | null {
  const g = ghostFails.get(email)
  if (!g?.lockedUntil) return null
  if (g.lockedUntil > Date.now()) return new Date(g.lockedUntil)
  ghostFails.delete(email)
  return null
}
function ghostFail(email: string): Date | null {
  const g = ghostFails.get(email) ?? { n: 0 }
  g.n += 1
  if (g.n >= MAX_FAILED_LOGINS) {
    g.n = 0
    g.lockedUntil = Date.now() + LOCK_MINUTES * 60000
  }
  ghostFails.set(email, g)
  if (ghostFails.size > 5000) {
    for (const [k, v] of ghostFails) if (!v.lockedUntil || v.lockedUntil < Date.now()) ghostFails.delete(k)
  }
  return g.lockedUntil ? new Date(g.lockedUntil) : null
}
/** Falha de um e-mail sem conta ativa: null como sempre, ou o mesmo aviso de bloqueio na 5ª falha. */
function ghostFailure(email: string): null {
  const locked = ghostFail(email)
  if (locked) throw new LockedError(locked)
  return null
}

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
        if (ipKey && exceeded(ipKey, IP_FAILS(), IP_WINDOW)) throw new LockedError(new Date(Date.now() + IP_WINDOW))
        let r: Awaited<ReturnType<typeof check>> = null
        try {
          r = await check(credentials.email, credentials.password)
        } finally {
          if (!r && ipKey) allow(ipKey, Number.MAX_SAFE_INTEGER, IP_WINDOW) // conta a falha (também a que bloqueia)
        }
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

  if (!member || member.status !== 'active') {
    const locked = ghostLocked(email)
    if (locked) {
      verifyPassword(password, DUMMY_HASH)
      throw new LockedError(locked)
    }
  }

  if (!member) {
    verifyPassword(password, DUMMY_HASH)
    return ghostFailure(email)
  }

  if (member.status !== 'active') {
    verifyPassword(password, DUMMY_HASH)
    return ghostFailure(email)
  }
  if (member.lockedUntil && member.lockedUntil > new Date()) {
    verifyPassword(password, DUMMY_HASH)
    throw new LockedError(member.lockedUntil)
  }

  // sem senha própria (convite ainda não aceito) não entra; gasta o mesmo tempo de uma senha errada
  const ok = verifyPassword(password, member.passwordHash ?? DUMMY_HASH) && !!member.passwordHash

  if (!ok) {
    const failed = member.failedLogins + 1
    const lockedUntil = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null
    await db.organizationMember.update({
      where: { id: member.id },
      data: lockedUntil ? { failedLogins: 0, lockedUntil } : { failedLogins: failed },
    })
    if (lockedUntil) throw new LockedError(lockedUntil) // a 5ª falha já avisa do bloqueio
    return null
  }

  // REQUIRE_EMAIL_VERIFICATION=true exige e-mail confirmado (ligar quando houver provedor de e-mail).
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && member.passwordHash && !member.emailVerifiedAt) return null

  await db.organizationMember.update({
    where: { id: member.id },
    data: { failedLogins: 0, lockedUntil: null, lastAccessAt: new Date() },
  })
  return { id: member.id, email: member.email, name: member.name, role: member.role, sv: member.sessionVersion }
}
