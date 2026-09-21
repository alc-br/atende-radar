import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import { db } from './db'
import { can, type Permission } from './permissions'

export interface AuthContext {
  memberId: string
  orgId: string
  role: string
  email: string
  name: string
}

export type Guard = { ok: true; auth: AuthContext } | { ok: false; res: NextResponse }

/**
 * Porta única de entrada das rotas de API:
 *  - exige sessão E membro ativo no banco (membro removido/suspenso perde acesso na hora);
 *  - o papel vem do banco, não do cookie (mudança de papel vale sem novo login);
 *  - a organização vem da sessão, nunca do corpo da requisição;
 *  - `permission` (opcional) → 403 se o papel não tem.
 */
export async function guard(permission?: Permission): Promise<Guard> {
  const session = await getServerSession(authOptions)
  const memberId = (session?.user as { id?: string } | undefined)?.id
  if (!memberId) return { ok: false, res: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }

  const member = await db.organizationMember.findUnique({ where: { id: memberId } })
  if (!member || member.status !== 'active') {
    return { ok: false, res: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  }

  if (permission && !can(member.role, permission)) {
    return { ok: false, res: NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 }) }
  }

  return {
    ok: true,
    auth: { memberId: member.id, orgId: member.organizationId, role: member.role, email: member.email, name: member.name },
  }
}

/** Operador da plataforma = e-mail listado em PLATFORM_ADMIN_EMAILS (separados por vírgula). */
export function isPlatformOperator(email: string | null | undefined): boolean {
  if (!email) return false
  const list = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

/** Atendente enxerga só o que é dele (conversas do agente com o mesmo e-mail). Demais papéis: sem filtro extra. */
export function isOwnScopeOnly(auth: AuthContext): boolean {
  return auth.role === 'atendente'
}

export const notFound = (what: string) => NextResponse.json({ error: `${what} not found` }, { status: 404 })
export const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

// ---- escopo de dados por organização (+ "só os meus" para atendente) ----
export const conversationScope = (a: AuthContext): Prisma.ConversationWhereInput =>
  isOwnScopeOnly(a) ? { organizationId: a.orgId, agent: { email: a.email } } : { organizationId: a.orgId }

export const alertScope = (a: AuthContext): Prisma.AlertWhereInput =>
  isOwnScopeOnly(a) ? { organizationId: a.orgId, conversation: { agent: { email: a.email } } } : { organizationId: a.orgId }

export const recoveryScope = (a: AuthContext): Prisma.RecoveryItemWhereInput =>
  isOwnScopeOnly(a) ? { organizationId: a.orgId, agent: { email: a.email } } : { organizationId: a.orgId }
