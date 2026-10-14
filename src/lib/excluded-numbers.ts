import { db } from './db'
import { phoneHash } from './phone-hash'
import { excludeContacts } from './privacy'

// Configurações › Privacidade › "Números excluídos do monitoramento" (um por linha). A comparação é pelo HMAC do
// telefone (o mesmo que o contato guarda), nunca pelo número em claro. Aceita o número com ou sem 55 e com ou sem o
// nono dígito do celular (o WhatsApp de contas antigas às vezes manda sem o 9).

/** Formas do mesmo número brasileiro que o WhatsApp pode mandar (só dígitos). Número estrangeiro fica como veio. */
export function numberVariants(raw: string): string[] {
  const d = raw.replace(/\D/g, '')
  if (d.length < 8) return []
  const national = (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
  if (national.length !== 10 && national.length !== 11) return [d]
  const nationals = new Set([national])
  if (national.length === 11 && national[2] === '9') nationals.add(national.slice(0, 2) + national.slice(3))
  if (national.length === 10 && /[6-9]/.test(national[2])) nationals.add(`${national.slice(0, 2)}9${national.slice(2)}`)
  return [...new Set([d, ...[...nationals].flatMap((n) => [n, `55${n}`])])]
}

/** As linhas do campo (texto livre) → hashes de todas as formas de cada número. */
export function excludedHashes(orgId: string, text: unknown): Set<string> {
  if (typeof text !== 'string' || !text.trim()) return new Set()
  const lines = text.split(/[\n,;]+/).slice(0, 2000)
  return new Set(lines.flatMap((l) => numberVariants(l)).map((v) => phoneHash(orgId, v)))
}

const settingsOf = (json: string | null | undefined): Record<string, unknown> => {
  try {
    return json ? (JSON.parse(json) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** O telefone (já em hash) está na lista de números excluídos da empresa? */
export async function isExcludedNumber(orgId: string, hash: string): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { settingsJson: true } })
  const list = settingsOf(org?.settingsJson).privExcluded
  if (typeof list !== 'string' || !list.trim()) return false
  return excludedHashes(orgId, list).has(hash)
}

/**
 * Ao salvar a lista: contatos que já existiam com esses números param de ser monitorados como no "Parar de monitorar"
 * da conversa (somem das telas e das análises, alertas abertos são dispensados). Devolve quantos contatos mudaram.
 * Tirar um número da lista não volta a monitorar quem já foi excluído.
 */
export async function applyExcludedNumbers(orgId: string, text: unknown): Promise<number> {
  const hashes = excludedHashes(orgId, text)
  if (hashes.size === 0) return 0
  const contacts = await db.contact.findMany({ where: { organizationId: orgId, excluded: false, phoneHash: { in: [...hashes] } }, select: { id: true } })
  return excludeContacts(orgId, contacts.map((c) => c.id))
}
