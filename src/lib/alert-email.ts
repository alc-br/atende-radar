import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from './db'
import { can } from './permissions'
import { alertScope, type AuthContext } from './api-auth'
import { appUrl, sendMailRow } from './mailer'
import { isOpenAt, localParts, scheduleFrom, type HoursSettings } from './analysis/business-hours'
import { isIsolatedOrg } from './sandbox'

/*
 * Alertas por e-mail (regras com o canal "email").
 *
 * 1. O motor chama queueAlertEmails ao abrir um alerta: cria um AlertEmailItem (pendente) por destinatário.
 *    Destinatário = membro ativo da empresa, com "alertas por e-mail" ligado, cujo papel vê alertas e que enxerga
 *    ESTE alerta no seu escopo (atendente: só conversas dele; supervisor com equipe: a equipe + sem atendente).
 * 2. flushAlertEmails (a cada minuto e no POST /api/gateway/tick) junta os pendentes por (membro, regra) e envia:
 *    - intervalo: no máximo 1 e-mail por membro e regra a cada N min (notifDigestFreq, padrão 15); o que chegar
 *      nesse meio-tempo vai num resumo único quando o intervalo acabar. Resumo desligado (notifDigestEnabled=false) = sem espera.
 *    - silêncio: entre silenceStart e silenceEnd (fuso da empresa); sem horário definido, fora do expediente da empresa.
 *      Alerta crítico ignora o silêncio (salvo notifImmediate=false). O que ficou retido sai quando o silêncio acaba.
 *      Não há horário de silêncio por pessoa: vale o da empresa.
 *    - pendente com mais de 72 h, ou cujo alerta já foi resolvido/dispensado, é descartado (skipped).
 * O e-mail não leva texto de mensagem, nome nem telefone do cliente: só regra, gravidade, horário e o link do painel.
 */

const SEVERITY_PT: Record<string, string> = { critical: 'crítica', high: 'alta', medium: 'média', low: 'baixa' }
const OPEN_ALERT = ['new', 'acknowledged', 'in_progress']
const MAX_PENDING_MS = 72 * 3600_000
export const DEFAULT_DIGEST_MINUTES = 15

const parseJson = <T,>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

// ---------- link "parar de receber" (token assinado, sem expiração: só desliga a preferência) ----------

const secret = () => process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''
const sign = (memberId: string, key: string) => createHmac('sha256', key).update(`unsub:${memberId}`).digest('base64url')

export function unsubscribeToken(memberId: string): string | null {
  const key = secret()
  return key ? `${Buffer.from(memberId).toString('base64url')}.${sign(memberId, key)}` : null
}

/** Devolve o id do membro se o token for válido; senão null. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  const key = secret()
  if (!key || !token || token.length > 300) return null
  const [idPart, sig] = token.split('.')
  if (!idPart || !sig) return null
  const memberId = Buffer.from(idPart, 'base64url').toString('utf8')
  const expected = Buffer.from(sign(memberId, key))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given) ? memberId : null
}

// ---------- enfileirar (chamado pelo motor) ----------

interface RuleLike { id: string; name: string; severity: string; notificationChannels: string }
interface AlertLike { id: string; organizationId: string }

/** Cria os itens pendentes de e-mail de um alerta recém-aberto. Nunca lança erro (não pode derrubar o motor). */
export async function queueAlertEmails(rule: RuleLike, alert: AlertLike): Promise<number> {
  try {
    if (!parseJson<string[]>(rule.notificationChannels, []).includes('email')) return 0
    if (await isIsolatedOrg(alert.organizationId)) return 0 // demonstração e simulação nunca mandam e-mail
    const members = await db.organizationMember.findMany({
      where: { organizationId: alert.organizationId, status: 'active', alertEmails: true },
      select: { id: true, email: true, name: true, role: true, team: true },
    })
    let queued = 0
    for (const m of members) {
      if (!can(m.role, 'alerts.view')) continue
      const ctx: AuthContext = { memberId: m.id, orgId: alert.organizationId, role: m.role, email: m.email, name: m.name, emailVerified: true, team: m.team?.trim() || null }
      const visible = await db.alert.count({ where: { AND: [{ id: alert.id }, alertScope(ctx)] } })
      if (!visible) continue
      await db.alertEmailItem.create({
        data: { organizationId: alert.organizationId, memberId: m.id, ruleId: rule.id, ruleName: rule.name, alertId: alert.id, severity: rule.severity },
      })
      queued++
    }
    return queued
  } catch (e) {
    console.error('[alert-email] falha ao enfileirar', e instanceof Error ? e.message : e)
    return 0
  }
}

// ---------- silêncio e intervalo ----------

type OrgSettings = HoursSettings & { silenceStart?: unknown; silenceEnd?: unknown; notifDigestEnabled?: unknown; notifDigestFreq?: unknown; notifImmediate?: unknown }

const hm = (v: unknown): number | null => {
  if (typeof v !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
}

/** Está no horário de silêncio da empresa? (início = fim → nunca; sem horário → fora do expediente) */
export function isQuietTime(now: Date, settings: OrgSettings, timezone: string | null | undefined): boolean {
  const start = hm(settings.silenceStart), end = hm(settings.silenceEnd)
  if (start == null || end == null) return !isOpenAt(now, scheduleFrom(settings, timezone))
  if (start === end) return false
  const cur = localParts(now, timezone || 'America/Sao_Paulo').minutes
  return start < end ? cur >= start && cur < end : cur >= start || cur < end // janela que passa da meia-noite
}

/** Intervalo mínimo (min) entre dois e-mails do mesmo membro para a mesma regra. */
export function digestMinutes(settings: OrgSettings): number {
  if (settings.notifDigestEnabled === false) return 0
  const n = Number(settings.notifDigestFreq)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.round(n), 5), 1440) : DEFAULT_DIGEST_MINUTES
}

// ---------- envio ----------

function mailFor(opts: {
  orgName: string; timezone: string; ruleName: string; items: { severity: string; createdAt: Date }[]; memberId: string; intervalMin: number
}) {
  const { items } = opts
  const top = items.some((i) => i.severity === 'critical') ? 'critical' : items[0].severity
  const sev = SEVERITY_PT[top] ?? top
  const when = (d: Date) => d.toLocaleString('pt-BR', { timeZone: opts.timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const token = unsubscribeToken(opts.memberId)
  const link = `${appUrl()}/#alerts`
  const subject = items.length === 1
    ? `Alerta: ${opts.ruleName} (gravidade ${sev}) · ${opts.orgName}`
    : `${items.length} alertas: ${opts.ruleName} · ${opts.orgName}`
  const lines = items.length === 1
    ? [`Um novo alerta foi aberto na ${opts.orgName}.`, '', `Regra: ${opts.ruleName}`, `Gravidade: ${sev}`, `Aberto em: ${when(items[0].createdAt)}`]
    : [
        `${items.length} alertas da regra "${opts.ruleName}" foram abertos na ${opts.orgName}.`,
        '',
        `Gravidade: ${sev}`,
        `Primeiro: ${when(items[0].createdAt)} · último: ${when(items[items.length - 1].createdAt)}`,
      ]
  const text = [
    ...lines,
    '',
    `Veja os detalhes no painel: ${link}`,
    '',
    'Por segurança, este e-mail não traz o texto das mensagens nem dados do cliente.',
    opts.intervalMin > 0 ? `Para não lotar sua caixa, alertas da mesma regra chegam juntos, no máximo um e-mail a cada ${opts.intervalMin} min.` : '',
    token ? `Não quer mais receber alertas por e-mail? ${appUrl()}/descadastrar?token=${token}` : '',
    '',
    '— AtendeRadar',
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n')
  const headers: Record<string, string> | undefined = token
    ? { 'List-Unsubscribe': `<${appUrl()}/api/public/unsubscribe?token=${token}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : undefined
  return { subject, text, headers }
}

export interface FlushSummary { sent: number; held: number; skipped: number }

/** Envia os e-mails de alerta pendentes que já podem sair (respeita silêncio e intervalo). Nunca lança erro. */
export async function flushAlertEmails(now = new Date(), organizationId?: string): Promise<FlushSummary> {
  const summary: FlushSummary = { sent: 0, held: 0, skipped: 0 }
  try {
    const orgFilter = organizationId ? { organizationId } : {}
    // reservado há mais de 10 min sem terminar (servidor reiniciou no meio): volta a pendente
    // (em 'sending', sentAt guarda a hora da reserva)
    await db.alertEmailItem.updateMany({ where: { ...orgFilter, status: 'sending', sentAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: 'pending', sentAt: null } })
    const old = await db.alertEmailItem.updateMany({ where: { ...orgFilter, status: 'pending', createdAt: { lt: new Date(now.getTime() - MAX_PENDING_MS) } }, data: { status: 'skipped' } })
    summary.skipped += old.count

    const pending = await db.alertEmailItem.findMany({ where: { ...orgFilter, status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 500 })
    if (!pending.length) return summary

    const groups = new Map<string, typeof pending>()
    for (const p of pending) {
      const k = `${p.memberId}|${p.ruleId}`
      groups.set(k, [...(groups.get(k) ?? []), p])
    }
    const orgIds = [...new Set(pending.map((p) => p.organizationId))]
    const orgs = new Map((await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, displayName: true, name: true, timezone: true, settingsJson: true } })).map((o) => [o.id, o]))
    const members = new Map((await db.organizationMember.findMany({ where: { id: { in: [...new Set(pending.map((p) => p.memberId))] } }, select: { id: true, email: true, status: true, alertEmails: true } })).map((m) => [m.id, m]))
    const openAlerts = new Set((await db.alert.findMany({ where: { id: { in: [...new Set(pending.map((p) => p.alertId))] }, status: { in: OPEN_ALERT } }, select: { id: true } })).map((a) => a.id))

    for (const items of groups.values()) {
      const first = items[0]
      const org = orgs.get(first.organizationId)
      const member = members.get(first.memberId)
      const live = items.filter((i) => openAlerts.has(i.alertId))
      const dead = member && member.status === 'active' && member.alertEmails && org ? items.filter((i) => !openAlerts.has(i.alertId)) : items
      if (dead.length) {
        await db.alertEmailItem.updateMany({ where: { id: { in: dead.map((i) => i.id) }, status: 'pending' }, data: { status: 'skipped' } })
        summary.skipped += dead.length
      }
      if (!org || !member || dead.length === items.length) continue

      const settings = parseJson<OrgSettings>(org.settingsJson, {})
      // silêncio: segura tudo, menos se houver alerta crítico no grupo ("Alertas imediatos", ligado por padrão)
      const bypass = settings.notifImmediate !== false && live.some((i) => i.severity === 'critical')
      if (!bypass && isQuietTime(now, settings, org.timezone)) {
        summary.held += live.length
        continue
      }
      // intervalo por membro e regra
      const interval = digestMinutes(settings)
      if (interval > 0) {
        const recent = await db.alertEmailItem.findFirst({
          where: { memberId: first.memberId, ruleId: first.ruleId, status: 'sent', sentAt: { gt: new Date(now.getTime() - interval * 60_000) } },
          select: { id: true },
        })
        if (recent) {
          summary.held += live.length
          continue
        }
      }
      // reserva os itens (seguro com dois processos) e envia um e-mail só
      const claimed = await db.alertEmailItem.updateMany({ where: { id: { in: live.map((i) => i.id) }, status: 'pending' }, data: { status: 'sending', sentAt: now } })
      if (claimed.count !== live.length) {
        await db.alertEmailItem.updateMany({ where: { id: { in: live.map((i) => i.id) }, status: 'sending', sentAt: now }, data: { status: 'pending', sentAt: null } })
        continue
      }
      const mail = mailFor({ orgName: org.displayName || org.name, timezone: org.timezone, ruleName: first.ruleName, items: live, memberId: member.id, intervalMin: interval })
      const row = await sendMailRow({ to: member.email, ...mail, kind: live.length === 1 ? 'alert' : 'alert_digest', organizationId: org.id })
      // falha de envio fica com o outbox (retryFailedEmails); o item conta como enviado para o intervalo
      await db.alertEmailItem.updateMany({ where: { id: { in: live.map((i) => i.id) } }, data: { status: 'sent', sentAt: now, outboxId: row.id } })
      summary.sent += 1
    }
  } catch (e) {
    console.error('[alert-email] falha ao enviar', e instanceof Error ? e.message : e)
  }
  return summary
}

/** Desliga os alertas por e-mail de um membro e descarta o que estava pendente para ele. */
export async function setAlertEmails(memberId: string, enabled: boolean) {
  await db.organizationMember.update({ where: { id: memberId }, data: { alertEmails: enabled } })
  if (!enabled) await db.alertEmailItem.updateMany({ where: { memberId, status: 'pending' }, data: { status: 'skipped' } })
}
