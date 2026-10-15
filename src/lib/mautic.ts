import { db } from './db'
import { isDemoOrg, isSimulationEmail, isSimulationOrg, REAL_ORGS } from './sandbox'

/*
 * Contatos no Mautic (mautic.alc.srv.br, usuário de API próprio do AtendeRadar).
 *
 * Todo membro de empresa real (cadastro, convite, troca de e-mail) vira contato lá, com sistema_origem "atenderadar",
 * as tags "atenderadar" + "atenderadar-membro" e os campos ar_* (papel, plano, assinatura...) que alimentam os segmentos
 * "[AtendeRadar] …" (catálogo em mautic-catalog.ts, criado por scripts/mautic-setup.ts). Quem só recebe e-mail
 * (relatório para endereço extra) entra com a tag "atenderadar-destinatario".
 * E-mail transacional sai pelo Brevo (mailer.ts); e-mail de marketing, se houver, sai pelo Mautic.
 * Demonstração e simulação ficam de fora. Sem MAUTIC_URL/USUARIO/SENHA nada é enviado (testes, desenvolvimento).
 * Falha do Mautic nunca atrapalha o cadastro: só vai para o log; o deploy e um job a cada 6 h ressincronizam todos.
 */

export const MAUTIC_SYSTEM = 'atenderadar'
export const MAUTIC_TAG = 'atenderadar'
export const MAUTIC_TAG_MEMBER = 'atenderadar-membro'
export const MAUTIC_TAG_RECIPIENT = 'atenderadar-destinatario'

type Config = { base: string; auth: string }

function config(): Config | null {
  const url = process.env.MAUTIC_URL?.trim()
  const user = process.env.MAUTIC_USUARIO?.trim()
  const pass = process.env.MAUTIC_SENHA
  if (!url || !user || !pass) return null
  return { base: url.replace(/\/$/, ''), auth: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') }
}

export const mauticEnabled = () => config() !== null

export interface MauticContact {
  email: string
  name?: string | null
  company?: string | null
  /** Tags extras além de "atenderadar". */
  tags?: string[]
  /** Campos ar_* (ver memberFields). */
  fields?: Record<string, string | number | null>
}

/** "Maria da Silva" → firstname "Maria", lastname "da Silva". */
export function splitName(name: string | null | undefined): { firstname?: string; lastname?: string } {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return {}
  return parts.length === 1 ? { firstname: parts[0] } : { firstname: parts[0], lastname: parts.slice(1).join(' ') }
}

/** sistema_origem é multi-seleção compartilhada com outros sistemas: acrescenta o nosso sem tirar os deles. */
export function mergeSystems(current: unknown): string[] {
  const list = Array.isArray(current) ? current.map(String) : typeof current === 'string' ? current.split('|') : []
  const clean = list.map((s) => s.trim()).filter(Boolean)
  return clean.includes(MAUTIC_SYSTEM) ? clean : [...clean, MAUTIC_SYSTEM]
}

/** Monta o corpo do POST /api/contacts/new (o Mautic atualiza o contato que já tem o e-mail). */
export function contactPayload(c: MauticContact, currentSystems: unknown) {
  return {
    email: c.email.trim().toLowerCase(),
    ...splitName(c.name),
    ...(c.company ? { company: c.company } : {}),
    ...(c.fields ?? {}),
    sistema_origem: mergeSystems(currentSystems),
    tags: [MAUTIC_TAG, ...(c.tags ?? [])],
    overwriteWithBlank: false,
  }
}

// Datas no horário de Brasília, no formato que o Mautic espera ("2026-10-15 09:30:00" / "2026-10-15").
const brt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
export const mauticDateTime = (d: Date | null | undefined) => (d ? brt.format(d) : null)
export const mauticDate = (d: Date | null | undefined) => (d ? brt.format(d).slice(0, 10) : null)

const MEMBER_STATUS: Record<string, string> = { active: 'ativo', invited: 'convidado', suspended: 'suspenso' }

export interface MemberSnapshot {
  role: string
  status: string
  createdAt: Date
  lastAccessAt: Date | null
  emailVerifiedAt: Date | null
  organizationId: string
  subscription: { status: string; trialEnd: Date | null; cancelAtPeriodEnd: boolean; plan: { code: string } | null } | null
}

/** Situação da assinatura em uma palavra (valores de AR_SUBSCRIPTION). */
export function subscriptionState(s: MemberSnapshot['subscription'], now = new Date()): string {
  if (!s) return 'sem_assinatura'
  if (s.status === 'canceled') return 'cancelada'
  if (s.status === 'past_due') return 'inadimplente'
  if (s.status === 'trialing') return s.trialEnd && s.trialEnd < now ? 'teste_vencido' : 'teste'
  if (s.status === 'active') return s.cancelAtPeriodEnd ? 'cancelamento_agendado' : 'ativa'
  return 'sem_assinatura'
}

/** Campos ar_* de um membro (catálogo em mautic-catalog.ts). */
export function memberFields(m: MemberSnapshot, now = new Date()): Record<string, string | number | null> {
  return {
    ar_papel: m.role,
    ar_membro: MEMBER_STATUS[m.status] ?? m.status,
    ar_plano: m.subscription?.plan?.code ?? null,
    ar_assinatura: subscriptionState(m.subscription, now),
    ar_teste_fim: m.subscription?.status === 'trialing' ? mauticDate(m.subscription.trialEnd) : null,
    ar_cadastro: mauticDateTime(m.createdAt),
    ar_ultimo_acesso: mauticDateTime(m.lastAccessAt),
    ar_email_confirmado: m.emailVerifiedAt ? 1 : 0,
    ar_empresa_id: m.organizationId,
  }
}

async function call(cfg: Config, path: string, init: RequestInit = {}) {
  const res = await fetch(`${cfg.base}/api${path}`, {
    ...init,
    headers: { Authorization: cfg.auth, 'Content-Type': 'application/json', accept: 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Mautic HTTP ${res.status} em ${path.split('?')[0]}`)
  return res.json() as Promise<Record<string, unknown>>
}

/** Cria ou atualiza o contato. Devolve o id no Mautic. Lança erro se o Mautic falhar. */
export async function upsertMauticContact(c: MauticContact): Promise<number | null> {
  const cfg = config()
  if (!cfg || !c.email || isSimulationEmail(c.email)) return null
  const email = c.email.trim().toLowerCase()
  const q = new URLSearchParams({ 'where[0][col]': 'email', 'where[0][expr]': 'eq', 'where[0][val]': email, limit: '1' })
  const found = await call(cfg, `/contacts?${q}`)
  const existing = Object.values((found.contacts as Record<string, { fields?: { all?: Record<string, unknown> } }>) || {})[0]
  const saved = await call(cfg, '/contacts/new', { method: 'POST', body: JSON.stringify(contactPayload(c, existing?.fields?.all?.sistema_origem)) })
  return ((saved.contact as { id?: number }) || {}).id ?? null
}

const memberSelect = {
  id: true, email: true, name: true, role: true, status: true, invitedAt: true, lastAccessAt: true, emailVerifiedAt: true, organizationId: true,
  organization: { select: { name: true, displayName: true, subscription: { select: { status: true, trialEnd: true, cancelAtPeriodEnd: true, plan: { select: { code: true } } } } } },
} as const

// invitedAt = entrada na empresa (cadastro do dono ou convite do membro); OrganizationMember não tem createdAt
type MemberRow = { email: string; name: string; invitedAt: Date; organization: { name: string; displayName: string | null; subscription: MemberSnapshot['subscription'] } } & Omit<MemberSnapshot, 'subscription' | 'createdAt'>

function memberContact(m: MemberRow): MauticContact {
  return {
    email: m.email,
    name: m.name,
    company: m.organization.displayName || m.organization.name,
    tags: [MAUTIC_TAG_MEMBER],
    fields: memberFields({ ...m, createdAt: m.invitedAt, subscription: m.organization.subscription }),
  }
}

/** Sincroniza um membro (empresa real) com o Mautic. Nunca lança: falha vai para o log. */
export async function syncMemberToMautic(memberId: string): Promise<void> {
  if (!mauticEnabled()) return
  try {
    const m = await db.organizationMember.findUnique({ where: { id: memberId }, select: memberSelect })
    if (!m || isDemoOrg(m.organizationId) || (await isSimulationOrg(m.organizationId))) return
    await upsertMauticContact(memberContact(m))
  } catch (e) {
    console.warn(`[mautic] membro ${memberId} não sincronizado: ${e instanceof Error ? e.message : 'erro'}`)
  }
}

/** Dispara a sincronização sem esperar (cadastro e convite não ficam mais lentos). */
export function queueMemberSync(memberId: string | null | undefined): void {
  if (memberId && mauticEnabled()) void syncMemberToMautic(memberId)
}

/**
 * Ressincroniza todos os membros de empresas reais (deploy e job a cada 6 h): mantém papel, plano e assinatura em dia
 * no Mautic sem espalhar chamadas pelo código de cobrança. Nunca lança.
 */
export async function syncAllMembersToMautic(): Promise<{ ok: number; failed: number; total: number; errors: string[] }> {
  const out = { ok: 0, failed: 0, total: 0, errors: [] as string[] }
  if (!mauticEnabled()) return out
  const members = await db.organizationMember.findMany({ where: { status: { in: ['active', 'invited', 'suspended'] }, organization: REAL_ORGS() }, select: memberSelect })
  out.total = members.length
  for (const m of members) {
    try {
      await upsertMauticContact(memberContact(m))
      out.ok++
    } catch (e) {
      out.failed++
      if (out.errors.length < 3) out.errors.push(e instanceof Error ? e.message.trim().split('\n').pop()!.slice(0, 300) : 'erro')
    }
  }
  return out
}

// Destinatários de e-mail (relatórios, alertas para endereços extras): cada endereço vai ao Mautic uma vez por processo.
const seenRecipients = new Set<string>()

/** Garante o destinatário de um e-mail como contato no Mautic (sem esperar; nunca lança). */
export function queueRecipientSync(email: string | null | undefined): void {
  const e = email?.trim().toLowerCase()
  if (!e || !mauticEnabled() || isSimulationEmail(e) || seenRecipients.has(e)) return
  if (seenRecipients.size > 20_000) seenRecipients.clear()
  seenRecipients.add(e)
  ;(async () => {
    // Quem já é membro fica só com a tag de membro (o sync de membros cuida dele).
    const member = await db.organizationMember.findFirst({ where: { email: e }, select: { id: true } })
    if (member) return
    await upsertMauticContact({ email: e, tags: [MAUTIC_TAG_RECIPIENT] })
  })().catch((err) => {
    seenRecipients.delete(e)
    console.warn(`[mautic] destinatário não sincronizado: ${err instanceof Error ? err.message : 'erro'}`)
  })
}
