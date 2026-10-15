import { db } from '../db'
import type { AnalysisSummary } from '../analysis/engine'
import type { AssertionResult, Expectation } from './types'

// Asserções dos cenários. Cada uma lê o banco da empresa simulada e devolve ok/falha com o que encontrou.

const OPEN_ALERT = ['new', 'acknowledged', 'in_progress']

export interface AssertContext {
  orgId: string
  /** rótulo do cliente → id da conversa (preenchido pelo runner a cada mensagem injetada) */
  chats: Map<string, string>
  lastTick: AnalysisSummary | null
}

const pass = (label: string, detail?: string): Omit<AssertionResult, 'at'> => ({ label, ok: true, detail })
const fail = (label: string, detail: string): Omit<AssertionResult, 'at'> => ({ label, ok: false, detail })

export function describe(e: Expectation): string {
  if ('alert' in e) return `alerta "${e.alert}"${e.chat ? ` em ${e.chat}` : ''}${e.status ? ` (${e.status})` : ''}${e.count !== undefined ? ` × ${e.count}` : ''}`
  if ('noAlert' in e) return `nenhum alerta "${e.noAlert}"${e.chat ? ` em ${e.chat}` : ''}`
  if ('conversation' in e) {
    const parts = Object.entries(e).filter(([k]) => k !== 'conversation').map(([k, v]) => `${k}=${v}`)
    return `conversa ${e.conversation}: ${parts.join(', ')}`
  }
  if ('recovery' in e) return `item de recuperação para ${e.recovery}${e.reason ? ` (${e.reason})` : ''}`
  if ('noRecovery' in e) return `nenhum item de recuperação para ${e.noRecovery}`
  if ('gate' in e) return e.gate ? `análise pausada (${e.gate})` : 'análise não pausada'
  if ('messages' in e) return `conversa ${e.messages} com ${e.count} mensagem(ns)`
  if ('storedText' in e) return `texto gravado de ${e.storedText}${e.contains ? ` contém "${e.contains}"` : ''}${e.notContains ? ` não contém "${e.notContains}"` : ''}`
  if ('promise' in e) return `promessa em ${e.promise}: ${e.status}`
  if ('notification' in e) return `notificação "${e.notification}"`
  return `${e.openAlerts} alerta(s) em aberto na empresa`
}

async function conversationOf(ctx: AssertContext, chat: string | undefined): Promise<string | null | undefined> {
  if (chat === undefined) return undefined
  return ctx.chats.get(chat) ?? null
}

export async function check(ctx: AssertContext, e: Expectation): Promise<Omit<AssertionResult, 'at'>> {
  const label = describe(e)
  try {
    if ('alert' in e || 'noAlert' in e) {
      const ruleName = 'alert' in e ? e.alert : e.noAlert
      const chat = e.chat
      const convId = await conversationOf(ctx, chat)
      if (chat !== undefined && !convId) return fail(label, `cliente "${chat}" não tem conversa`)
      const alerts = await db.alert.findMany({
        where: { organizationId: ctx.orgId, ruleName, ...(convId === undefined ? {} : { conversationId: convId }) },
        select: { status: true, severity: true },
      })
      if ('noAlert' in e) {
        const hits = e.anyStatus ? alerts : alerts.filter((a) => OPEN_ALERT.includes(a.status))
        return hits.length === 0 ? pass(label) : fail(label, `${hits.length} encontrado(s) (${hits.map((h) => h.status).join(', ')})`)
      }
      const wanted = e.status ? alerts.filter((a) => (e.status === 'new' ? OPEN_ALERT.includes(a.status) : a.status === e.status)) : alerts
      const found = `${alerts.length} alerta(s): ${alerts.map((a) => a.status).join(', ') || 'nenhum'}`
      if (e.count !== undefined ? wanted.length !== e.count : wanted.length === 0) return fail(label, found)
      if (e.severity && !wanted.every((a) => a.severity === e.severity)) return fail(label, `severidade ${wanted.map((a) => a.severity).join(', ')}`)
      return pass(label, found)
    }

    if ('conversation' in e) {
      const convId = ctx.chats.get(e.conversation)
      if (!convId) return fail(label, `cliente "${e.conversation}" não tem conversa`)
      const c = await db.conversation.findUnique({
        where: { id: convId },
        select: { operationalStatus: true, primaryIntent: true, sentiment: true, potentialValue: true, closedAt: true, tags: true, suggestedAgentId: true },
      })
      if (!c) return fail(label, 'conversa não encontrada')
      const tags = (() => { try { return JSON.parse(c.tags || '[]') as string[] } catch { return [] } })()
      const suggested = c.suggestedAgentId ? (await db.agent.findUnique({ where: { id: c.suggestedAgentId }, select: { name: true } }))?.name ?? null : null
      const got = `status=${c.operationalStatus}, intent=${c.primaryIntent ?? '-'}, sentiment=${c.sentiment}, valor=${c.potentialValue}, encerrada=${!!c.closedAt}, tags=${tags.join('|') || '-'}, sugerido=${suggested ?? '-'}`
      const ok =
        (e.status === undefined || c.operationalStatus === e.status) &&
        (e.intent === undefined || c.primaryIntent === e.intent) &&
        (e.sentiment === undefined || c.sentiment === e.sentiment) &&
        (e.potentialValue === undefined || c.potentialValue === e.potentialValue) &&
        (e.closed === undefined || !!c.closedAt === e.closed) &&
        (e.tag === undefined || tags.includes(e.tag)) &&
        (e.suggestedAgent === undefined || suggested === e.suggestedAgent)
      return ok ? pass(label, got) : fail(label, got)
    }

    if ('recovery' in e || 'noRecovery' in e) {
      const chat = 'recovery' in e ? e.recovery : e.noRecovery
      const convId = ctx.chats.get(chat)
      if (!convId) return fail(label, `cliente "${chat}" não tem conversa`)
      const items = await db.recoveryItem.findMany({ where: { organizationId: ctx.orgId, conversationId: convId }, select: { reason: true, status: true } })
      const found = `${items.length} item(ns)${items.length ? `: ${items.map((i) => i.reason).join(', ')}` : ''}`
      if ('noRecovery' in e) return items.length === 0 ? pass(label) : fail(label, found)
      const ok = items.some((i) => !e.reason || i.reason === e.reason)
      return ok ? pass(label, found) : fail(label, found)
    }

    if ('gate' in e) {
      const paused = ctx.lastTick?.paused ?? null
      return paused === e.gate ? pass(label, `paused=${paused ?? 'não'}`) : fail(label, `paused=${paused ?? 'não'}`)
    }

    if ('messages' in e) {
      const convId = ctx.chats.get(e.messages)
      if (!convId) return fail(label, `cliente "${e.messages}" não tem conversa`)
      const n = await db.message.count({ where: { conversationId: convId } })
      return n === e.count ? pass(label, `${n}`) : fail(label, `${n} mensagem(ns)`)
    }

    if ('storedText' in e) {
      const convId = ctx.chats.get(e.storedText)
      if (!convId) return fail(label, `cliente "${e.storedText}" não tem conversa`)
      const texts = (await db.message.findMany({ where: { conversationId: convId }, select: { text: true } })).map((m) => m.text ?? '')
      const all = texts.join('\n')
      const ok = (!e.contains || all.includes(e.contains)) && (!e.notContains || !all.includes(e.notContains))
      // os textos são fictícios (do próprio cenário): podem aparecer no resultado
      return ok ? pass(label) : fail(label, `gravado: ${all.slice(0, 200)}`)
    }

    if ('promise' in e) {
      const convId = ctx.chats.get(e.promise)
      if (!convId) return fail(label, `cliente "${e.promise}" não tem conversa`)
      const ps = await db.promise.findMany({ where: { conversationId: convId }, select: { status: true } })
      return ps.some((p) => p.status === e.status) ? pass(label, ps.map((p) => p.status).join(', ')) : fail(label, ps.map((p) => p.status).join(', ') || 'nenhuma promessa')
    }

    if ('notification' in e) {
      const n = await db.notification.findMany({ where: { organizationId: ctx.orgId }, select: { title: true }, orderBy: { createdAt: 'desc' }, take: 50 })
      return n.some((x) => x.title.includes(e.notification)) ? pass(label) : fail(label, n.map((x) => x.title).join(' | ').slice(0, 300) || 'nenhuma notificação')
    }

    const open = await db.alert.count({ where: { organizationId: ctx.orgId, status: { in: OPEN_ALERT } } })
    return open === e.openAlerts ? pass(label, `${open}`) : fail(label, `${open} em aberto`)
  } catch (err) {
    return fail(label, `erro: ${err instanceof Error ? err.message : String(err)}`)
  }
}
