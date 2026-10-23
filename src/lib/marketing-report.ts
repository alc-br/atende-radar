import { db } from './db'
import { parseAttribution, type Attribution } from './attribution'
import { dayKey } from './product-events'
import { internalOrgIds } from './internal'
import type { ConversionPayload } from './conversions'

// Admin › Medição (docs/operacao/medicao.md), só leitura e só para o operador:
// - funil por dia × utm_source/medium/campaign: cadastros, ativações, testes vencidos sem contratar, assinaturas pagas,
//   receita e cancelamentos. A campanha é a do cadastro da empresa (Organization.attribution); sem campanha, "(direto)".
// - CSV de conversões offline do Google Ads (importação por arquivo): uma linha por ativação/compra que tem gclid.
// Empresas internas e simuladas ficam fora dos dois.

export const GADS_NAMES_KEY = 'marketing.gads_names'
export const DEFAULT_GADS_NAMES = { activation: 'AtendeRadar - Ativacao', purchase: 'AtendeRadar - Assinatura' }
export type GadsNames = typeof DEFAULT_GADS_NAMES

const clean = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : fallback)

export async function getGadsNames(): Promise<GadsNames> {
  const row = await db.platformSetting.findUnique({ where: { key: GADS_NAMES_KEY } })
  let v: Record<string, unknown> = {}
  try {
    v = row ? JSON.parse(row.value) : {}
  } catch {
    // valor inválido: volta ao padrão
  }
  return { activation: clean(v.activation, DEFAULT_GADS_NAMES.activation), purchase: clean(v.purchase, DEFAULT_GADS_NAMES.purchase) }
}

export async function setGadsNames(input: Partial<Record<keyof GadsNames, unknown>>): Promise<GadsNames> {
  const names = { activation: clean(input.activation, DEFAULT_GADS_NAMES.activation), purchase: clean(input.purchase, DEFAULT_GADS_NAMES.purchase) }
  await db.platformSetting.upsert({ where: { key: GADS_NAMES_KEY }, create: { key: GADS_NAMES_KEY, value: JSON.stringify(names) }, update: { value: JSON.stringify(names) } })
  return names
}

/** Data e hora em Brasília, "AAAA-MM-DD HH:MM:SS" (o fuso vai na 1ª linha do CSV). */
export function brTime(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

const csvCell = (v: string | number) => {
  const s = String(v)
  // fórmula no Excel/Sheets (=, +, -, @) nunca é executada; aspas quando precisa
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
export const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

export interface GadsRow {
  gclid: string
  name: string
  time: string
  value: number | null
  currency: 'BRL'
  kind: 'activation' | 'purchase'
  organizationId: string
}

/** Ativações e compras com gclid no período (pela hora da conversão), sem internas, simuladas e sandbox. */
export async function googleAdsRows(from: Date, to: Date): Promise<GadsRow[]> {
  const names = await getGadsNames()
  const internal = await internalOrgIds()
  const events = await db.conversionEvent.findMany({ where: { kind: { in: ['activation', 'purchase'] }, createdAt: { gte: new Date(from.getTime() - 86400_000) } }, orderBy: { createdAt: 'asc' } })
  const out: GadsRow[] = []
  for (const e of events) {
    if (!e.organizationId || internal.has(e.organizationId)) continue
    let p: ConversionPayload
    try {
      p = JSON.parse(e.payload)
    } catch {
      continue
    }
    const gclid = p.attribution?.gclid
    const at = new Date(p.eventTime * 1000)
    if (!gclid || p.sandbox || at < from || at > to) continue
    const kind = e.kind as GadsRow['kind']
    out.push({ gclid, name: names[kind], time: brTime(at), value: kind === 'purchase' ? Math.round((p.value ?? 0) * 100) / 100 : null, currency: 'BRL', kind, organizationId: e.organizationId })
  }
  return out
}

export function googleAdsCsv(rows: GadsRow[]): string {
  return 'Parameters:TimeZone=America/Sao_Paulo\r\n' + toCsv([
    ['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency'],
    ...rows.map((r) => [r.gclid, r.name, r.time, r.value === null ? '' : r.value.toFixed(2), r.currency]),
  ])
}

// ---------- funil por dia × campanha ----------

export interface FunnelRow {
  day: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  signups: number
  activations: number
  trialsExpiredUnpaid: number
  paidSubscriptions: number
  revenueBrl: number
  cancellations: number
}

const DIRECT = '(direto)'
const campaignOf = (a: Attribution | null) => ({ utm_source: a?.utm_source || (a?.gclid || a?.gbraid || a?.wbraid ? 'google' : a?.fbclid ? 'meta' : DIRECT), utm_medium: a?.utm_medium || (a?.gclid || a?.gbraid || a?.wbraid || a?.fbclid ? 'cpc' : DIRECT), utm_campaign: a?.utm_campaign || DIRECT })

export async function funnelReport(from: Date, to: Date, now = new Date()): Promise<{ rows: FunnelRow[]; consent: { day: string; accept_all: number; reject_all: number; custom: number }[] }> {
  const internal = await internalOrgIds()
  const orgs = new Map((await db.organization.findMany({ select: { id: true, attribution: true } })).map((o) => [o.id, campaignOf(parseAttribution(o.attribution))]))
  const rows = new Map<string, FunnelRow>()
  const add = (orgId: string, at: Date, field: keyof Omit<FunnelRow, 'day' | 'utm_source' | 'utm_medium' | 'utm_campaign'>, n = 1) => {
    if (internal.has(orgId) || at < from || at > to) return
    const c = orgs.get(orgId) ?? campaignOf(null)
    const day = dayKey(at)
    const key = [day, c.utm_source, c.utm_medium, c.utm_campaign].join('\u0000')
    const row = rows.get(key) ?? { day, ...c, signups: 0, activations: 0, trialsExpiredUnpaid: 0, paidSubscriptions: 0, revenueBrl: 0, cancellations: 0 }
    row[field] += n
    rows.set(key, row)
  }
  const range = { gte: from, lte: to }
  for (const m of await db.productMilestone.findMany({ where: { name: { in: ['signup', 'first_connection', 'first_payment'] }, reachedAt: range } })) {
    add(m.organizationId, m.reachedAt, m.name === 'signup' ? 'signups' : m.name === 'first_connection' ? 'activations' : 'paidSubscriptions')
  }
  const paidOrgs = new Set((await db.billingInvoice.findMany({ where: { status: 'paid' }, select: { organizationId: true }, distinct: ['organizationId'] })).map((i) => i.organizationId))
  for (const s of await db.subscription.findMany({ where: { trialEnd: { gte: from, lte: to < now ? to : now } }, select: { organizationId: true, trialEnd: true } })) {
    if (s.trialEnd && !paidOrgs.has(s.organizationId)) add(s.organizationId, s.trialEnd, 'trialsExpiredUnpaid')
  }
  for (const i of await db.billingInvoice.findMany({ where: { status: 'paid', paidAt: range }, select: { organizationId: true, paidAt: true, amountCents: true } })) {
    if (i.paidAt) add(i.organizationId, i.paidAt, 'revenueBrl', i.amountCents / 100)
  }
  for (const a of await db.auditLog.findMany({ where: { action: { in: ['subscription.canceled', 'subscription.withdrawn'] }, createdAt: range }, select: { organizationId: true, createdAt: true } })) {
    add(a.organizationId, a.createdAt, 'cancellations')
  }
  const consentRows = await db.consentChoiceDaily.findMany({ where: { day: { gte: dayKey(from), lte: dayKey(to) } }, orderBy: { day: 'asc' } })
  const consent = new Map<string, { day: string; accept_all: number; reject_all: number; custom: number }>()
  for (const c of consentRows) {
    const r = consent.get(c.day) ?? { day: c.day, accept_all: 0, reject_all: 0, custom: 0 }
    if (c.choice === 'accept_all' || c.choice === 'reject_all' || c.choice === 'custom') r[c.choice] += c.count
    consent.set(c.day, r)
  }
  const sorted = [...rows.values()].map((r) => ({ ...r, revenueBrl: Math.round(r.revenueBrl * 100) / 100 }))
  sorted.sort((a, b) => b.day.localeCompare(a.day) || a.utm_source.localeCompare(b.utm_source) || a.utm_medium.localeCompare(b.utm_medium) || a.utm_campaign.localeCompare(b.utm_campaign))
  return { rows: sorted, consent: [...consent.values()].reverse() }
}

export function funnelCsv(rows: FunnelRow[]): string {
  return toCsv([
    ['dia', 'utm_source', 'utm_medium', 'utm_campaign', 'cadastros', 'ativacoes', 'testes_vencidos_sem_contratar', 'assinaturas_pagas', 'receita_brl', 'cancelamentos'],
    ...rows.map((r) => [r.day, r.utm_source, r.utm_medium, r.utm_campaign, r.signups, r.activations, r.trialsExpiredUnpaid, r.paidSubscriptions, r.revenueBrl.toFixed(2), r.cancellations]),
  ])
}

/** Período em dias de Brasília: ?from=AAAA-MM-DD&to=AAAA-MM-DD (padrão: últimos 30 dias, até 366). */
export function periodFrom(params: URLSearchParams, now = new Date()): { from: Date; to: Date } | null {
  const day = /^\d{4}-\d{2}-\d{2}$/
  const f = params.get('from')
  const t = params.get('to')
  if ((f && !day.test(f)) || (t && !day.test(t))) return null
  const to = t ? new Date(`${t}T23:59:59.999-03:00`) : now
  const from = f ? new Date(`${f}T00:00:00-03:00`) : new Date(to.getTime() - 30 * 86400_000)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to || to.getTime() - from.getTime() > 367 * 86400_000) return null
  return { from, to }
}
