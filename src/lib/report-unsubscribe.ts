import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from './db'
import { appUrl } from './mailer'

// "Parar de receber relatórios" sem login: o link do e-mail do relatório agendado leva um token assinado com a empresa
// e o endereço do destinatário (que pode nem ser usuário do sistema). Usar o link tira o endereço de TODOS os
// relatórios agendados daquela empresa. Formato "r.<dados>.<assinatura>": o prefixo separa dos tokens de alerta.

const PREFIX = 'r.'
const secret = () => process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''
const sign = (payload: string, key: string) => createHmac('sha256', key).update(`unsub-report:${payload}`).digest('base64url')
const payloadOf = (orgId: string, email: string) => `${orgId}\n${email.trim().toLowerCase()}`

export const isReportUnsubscribeToken = (token: string | null | undefined) => !!token && token.startsWith(PREFIX)

export function reportUnsubscribeToken(orgId: string, email: string): string | null {
  const key = secret()
  if (!key) return null
  const payload = payloadOf(orgId, email)
  return `${PREFIX}${Buffer.from(payload).toString('base64url')}.${sign(payload, key)}`
}

/** Empresa e endereço do token, se ele for válido; senão null. */
export function verifyReportUnsubscribeToken(token: string | null | undefined): { orgId: string; email: string } | null {
  const key = secret()
  if (!key || !token || token.length > 600 || !token.startsWith(PREFIX)) return null
  const [dataPart, sig] = token.slice(PREFIX.length).split('.')
  if (!dataPart || !sig) return null
  const payload = Buffer.from(dataPart, 'base64url').toString('utf8')
  const [orgId, email] = payload.split('\n')
  if (!orgId || !email) return null
  const expected = Buffer.from(sign(payload, key))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given) ? { orgId, email } : null
}

/** Link da página de confirmação (vai no texto do e-mail) e cabeçalhos do clique único (RFC 8058, Gmail e outros). */
export function reportUnsubscribe(orgId: string, email: string): { url: string; headers: Record<string, string> } | null {
  const token = reportUnsubscribeToken(orgId, email)
  if (!token) return null
  return {
    url: `${appUrl()}/descadastrar?token=${token}`,
    headers: { 'List-Unsubscribe': `<${appUrl()}/api/public/unsubscribe?token=${token}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }
}

/** Tira o endereço dos destinatários de todos os relatórios da empresa. Devolve quantos relatórios mudaram. */
export async function removeReportRecipient(orgId: string, email: string): Promise<number> {
  const target = email.trim().toLowerCase()
  const defs = await db.reportDefinition.findMany({ where: { organizationId: orgId }, select: { id: true, recipients: true } })
  let changed = 0
  for (const def of defs) {
    let list: unknown
    try {
      list = JSON.parse(def.recipients ?? '[]')
    } catch {
      continue
    }
    if (!Array.isArray(list)) continue
    const kept = list.filter((r) => !(typeof r === 'string' && r.trim().toLowerCase() === target))
    if (kept.length === list.length) continue
    await db.reportDefinition.update({ where: { id: def.id }, data: { recipients: JSON.stringify(kept) } })
    changed++
  }
  return changed
}
