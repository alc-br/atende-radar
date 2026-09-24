import { db } from './db'
import { hashToken, newToken } from './passwords'

export type TokenType = 'reset' | 'invite' | 'verify'

const TTL_MS: Record<TokenType, number> = {
  reset: 60 * 60 * 1000, // 1 hora
  invite: 7 * 24 * 60 * 60 * 1000, // 7 dias
  verify: 3 * 24 * 60 * 60 * 1000, // 3 dias
}

/** Cria um token de uso único e invalida os anteriores do mesmo tipo para o membro. Devolve o token em claro (só vai por e-mail). */
export async function issueToken(memberId: string, type: TokenType): Promise<string> {
  const { token, tokenHash } = newToken()
  await db.authToken.updateMany({ where: { memberId, type, usedAt: null }, data: { usedAt: new Date() } })
  await db.authToken.create({ data: { memberId, type, tokenHash, expiresAt: new Date(Date.now() + TTL_MS[type]) } })
  return token
}

/** Consome o token (uso único). Devolve o memberId, ou null se inválido/expirado/já usado. */
export async function consumeToken(token: string, type: TokenType): Promise<string | null> {
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null
  const claimed = await db.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
  return claimed.count === 1 ? row.memberId : null
}
