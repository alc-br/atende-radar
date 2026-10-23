import { db } from './db'

// Tráfego interno na medição (docs/operacao/medicao.md): empresas do dono, da ALC e de testes não contam como
// cadastro, ativação nem compra para o GA4, a Meta e o Google Ads, e ficam fora do relatório do funil.
// A lista fica no banco (Admin › Medição), não no código: o repositório é público e os e-mails não entram nele.
// Uma empresa é interna quando o e-mail de algum membro (ou o adminEmail) bate com um e-mail ou um domínio da lista.
// A regra vale na hora do envio, então incluir um e-mail depois segura também o que ainda estava na fila.

export const INTERNAL_KEY = 'marketing.internal'
export const INTERNAL_COOKIE = 'ar_internal'

export interface InternalRules {
  emails: string[]
  domains: string[]
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** Limpa a lista digitada: minúsculas, sem espaços, sem "@" na frente do domínio, sem repetidos. */
export function normalizeRules(input: { emails?: unknown; domains?: unknown }): InternalRules {
  const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean)
  const emails = [...new Set(list(input.emails).filter((e) => EMAIL.test(e)))].slice(0, 200)
  const domains = [...new Set(list(input.domains).map((d) => d.replace(/^@/, '')).filter((d) => DOMAIN.test(d)))].slice(0, 100)
  return { emails, domains }
}

export async function getInternalRules(): Promise<InternalRules> {
  const row = await db.platformSetting.findUnique({ where: { key: INTERNAL_KEY } })
  if (!row) return { emails: [], domains: [] }
  try {
    return normalizeRules(JSON.parse(row.value))
  } catch {
    return { emails: [], domains: [] }
  }
}

export async function setInternalRules(rules: { emails?: unknown; domains?: unknown }): Promise<InternalRules> {
  const clean = normalizeRules(rules)
  await db.platformSetting.upsert({ where: { key: INTERNAL_KEY }, create: { key: INTERNAL_KEY, value: JSON.stringify(clean) }, update: { value: JSON.stringify(clean) } })
  return clean
}

export function isInternalEmail(email: string | null | undefined, rules: InternalRules): boolean {
  const e = (email ?? '').trim().toLowerCase()
  if (!e.includes('@')) return false
  const domain = e.slice(e.lastIndexOf('@') + 1)
  return rules.emails.includes(e) || rules.domains.some((d) => domain === d || domain.endsWith(`.${d}`))
}

/** Ids das empresas internas (e as simuladas, que também nunca contam). */
export async function internalOrgIds(rules?: InternalRules): Promise<Set<string>> {
  const r = rules ?? (await getInternalRules())
  const out = new Set<string>()
  for (const o of await db.organization.findMany({ where: { isSimulation: true }, select: { id: true } })) out.add(o.id)
  if (!r.emails.length && !r.domains.length) return out
  for (const o of await db.organization.findMany({ select: { id: true, adminEmail: true } })) if (isInternalEmail(o.adminEmail, r)) out.add(o.id)
  for (const m of await db.organizationMember.findMany({ select: { organizationId: true, email: true } })) if (isInternalEmail(m.email, r)) out.add(m.organizationId)
  return out
}

export async function isInternalOrg(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { isSimulation: true, adminEmail: true } })
  if (!org) return false
  if (org.isSimulation) return true
  const rules = await getInternalRules()
  if (!rules.emails.length && !rules.domains.length) return false
  if (isInternalEmail(org.adminEmail, rules)) return true
  const members = await db.organizationMember.findMany({ where: { organizationId }, select: { email: true } })
  return members.some((m) => isInternalEmail(m.email, rules))
}
