import { createHmac } from 'node:crypto'

/** O telefone nunca é guardado em claro: só HMAC (para reconhecer o mesmo contato) e os 4 últimos dígitos (para exibir). */
export function phoneHash(orgId: string, digits: string): string {
  const key = process.env.PHONE_HASH_SECRET || process.env.NEXTAUTH_SECRET || 'atenderadar-dev-only'
  return createHmac('sha256', key).update(`${orgId}:${digits}`).digest('hex')
}
