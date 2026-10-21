import { db } from '../db'
import { maskSensitive } from '../mask-sensitive'
import { aiEnabled } from '../analysis/ai-classify'
import { moneyBR as money, REPORT_TITLES, type CellFormat, type CellValue, type ReportContent, type ReportHighlights, type ReportSection, type ReportType } from './types'

export { REPORT_TYPES, REPORT_TITLES } from './types'
export type { CellFormat, CellValue, ReportContent, ReportHighlights, ReportSection, ReportType } from './types'

// tipos que usam as conversas do período / as mensagens delas (os demais não leem)
const CONV_TYPES: ReportType[] = ['daily', 'weekly', 'agent', 'lost_opportunities', 'data_quality', 'connections']
const MESSAGE_TYPES: ReportType[] = ['daily', 'weekly', 'agent', 'connections']

const round = (n: number, d = 1) => +n.toFixed(d)
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const minutes = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000)
const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '—')

/** Monta o relatório a partir dos dados REAIS da empresa no período. */
export async function buildReport(orgId: string, type: ReportType, start: Date, end: Date): Promise<ReportContent> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { displayName: true, timezone: true } })
  // T15 · conversas só nos tipos que usam; mensagens só nos que contam mensagens ou 1ª resposta (lidas à parte, só 3 campos)
  const base = CONV_TYPES.includes(type)
    ? await db.conversation.findMany({
        where: { organizationId: orgId, openedAt: { gte: start, lte: end } },
        include: {
          contact: { select: { displayName: true, phoneLast4: true } },
          agent: { select: { name: true } },
          opportunities: { select: { status: true, expectedValue: true } },
        },
        orderBy: { openedAt: 'desc' },
      })
    : []
  const byConv = new Map<string, Array<{ direction: string; occurredAt: Date }>>()
  if (MESSAGE_TYPES.includes(type) && base.length) {
    const msgs = await db.message.findMany({ where: { conversationId: { in: base.map((c) => c.id) } }, select: { conversationId: true, direction: true, occurredAt: true } })
    for (const m of msgs) {
      const list = byConv.get(m.conversationId)
      if (list) list.push(m)
      else byConv.set(m.conversationId, [m])
    }
  }
  const convs = base.map((c) => ({ ...c, messages: byConv.get(c.id) ?? [] }))
  const nameOf = (c: (typeof convs)[number]) => c.contact?.displayName || 'Desconhecido'
  const firstResponse = (c: (typeof convs)[number]) => {
    const ins = c.messages.filter((m) => m.direction === 'inbound').sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
    if (!ins) return null
    const out = c.messages.filter((m) => m.direction === 'outbound' && m.occurredAt > ins.occurredAt).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
    return out ? minutes(ins.occurredAt, out.occurredAt) : null
  }
  const phone = (c: (typeof convs)[number]) => (c.contact?.phoneLast4 ? `*****${c.contact.phoneLast4}` : '—')
  const waitingMin = (c: (typeof convs)[number]) => (c.operationalStatus === 'waiting_company' && c.waitingSince ? Math.round(minutes(c.waitingSince, new Date())) : 0)

  const summary: string[] = []
  const sections: ReportSection[] = []
  let highlights: ReportHighlights | undefined

  if (type === 'daily' || type === 'weekly') {
    const waiting = convs.filter((c) => c.operationalStatus === 'waiting_company')
    const firsts = convs.map(firstResponse).filter((x): x is number => x != null)
    const opps = convs.flatMap((c) => c.opportunities)
    const atRisk = waiting.flatMap((c) => c.opportunities.filter((o) => o.status === 'active'))
    const scores = convs.filter((c) => c.messages.length >= 2).map((c) => c.score)
    const alerts = await db.alert.findMany({ where: { organizationId: orgId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' }, take: 100 })
    const msgs = convs.flatMap((c) => c.messages)
    const valueAtRisk = atRisk.reduce((s, o) => s + o.expectedValue, 0)
    highlights = { conversations: convs.length, waiting: waiting.length, alerts: alerts.length, opportunities: opps.length, valueAtRisk }

    const kpis: Array<[string, CellValue, CellFormat]> = [
      ['Conversas iniciadas', convs.length, 'int'],
      ['Clientes aguardando resposta', waiting.length, 'int'],
      ['Tempo mediano da 1ª resposta (min)', round(median(firsts)), 'decimal'],
      ['Oportunidades detectadas', opps.length, 'int'],
      ['Valor estimado em risco (R$)', valueAtRisk, 'money'],
      ['Nota média das conversas', Math.round(mean(scores)), 'int'],
      ['Mensagens recebidas', msgs.filter((m) => m.direction === 'inbound').length, 'int'],
      ['Mensagens enviadas', msgs.filter((m) => m.direction === 'outbound').length, 'int'],
      ['Alertas gerados', alerts.length, 'int'],
    ]
    if (type === 'weekly') {
      const span = end.getTime() - start.getTime()
      const prevStart = new Date(start.getTime() - span)
      const prevCount = await db.conversation.count({ where: { organizationId: orgId, openedAt: { gte: prevStart, lt: start } } })
      const delta = prevCount ? `${Math.round(((convs.length - prevCount) / prevCount) * 100)}%` : convs.length ? 'novo' : '—'
      kpis.push(['Conversas iniciadas no período anterior', prevCount, 'int'], ['Variação de conversas', delta, 'text'])
    }
    summary.push(`${convs.length} conversas no período; ${waiting.length} cliente(s) aguardando resposta agora.`)
    summary.push(`${money(valueAtRisk)} em valor estimado em risco; ${alerts.length} alerta(s) no período.`)
    sections.push({ key: 'kpis', heading: 'Indicadores', columns: ['Indicador', 'Valor'], rows: kpis.map(([k, v]) => [k, v]), rowFormats: kpis.map(([, , f]) => f) })

    // Top 5 a recuperar: quem espera resposta ou foi perdido; oportunidade ativa primeiro, depois maior risco e valor
    const activeOpp = (c: (typeof convs)[number]) => Number(c.opportunities.some((o) => o.status === 'active'))
    const toRecover = convs
      .filter((c) => c.operationalStatus === 'waiting_company' || c.operationalStatus === 'lost')
      .sort((a, b) => activeOpp(b) - activeOpp(a) || b.riskScore - a.riskScore || b.potentialValue - a.potentialValue)
      .slice(0, 5)
    sections.push({
      key: 'top_recover',
      heading: 'Top 5 conversas a recuperar',
      columns: ['Cliente', 'Telefone', 'Situação', 'Espera (min)', 'Intenção', 'Valor estimado (R$)'],
      formats: ['text', 'text', 'text', 'int', 'text', 'money'],
      rows: toRecover.map((c) => [nameOf(c), phone(c), c.operationalStatus === 'lost' ? 'Perdida' : 'Aguardando resposta', waitingMin(c), c.primaryIntent ?? '—', c.potentialValue]),
    })
    sections.push({
      heading: 'Clientes aguardando resposta',
      columns: ['Cliente', 'Telefone', 'Atendente', 'Espera (min)', 'Intenção', 'Valor estimado (R$)'],
      formats: ['text', 'text', 'text', 'int', 'text', 'money'],
      rows: [...waiting].sort((a, b) => b.riskScore - a.riskScore).slice(0, 30).map((c) => [nameOf(c), phone(c), c.agent?.name ?? 'Sem atendente', waitingMin(c), c.primaryIntent ?? '—', c.potentialValue]),
    })
    sections.push({
      heading: 'Alertas do período',
      columns: ['Regra', 'Severidade', 'Cliente', 'Situação', 'Criado em'],
      formats: ['text', 'text', 'text', 'text', 'date'],
      rows: alerts.map((a) => [a.ruleName ?? '—', a.severity, a.customerName ?? '—', a.status, iso(a.createdAt)]),
    })
  }

  if (type === 'agent') {
    const agents = await db.agent.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } })
    const promises = await db.promise.findMany({ where: { conversation: { organizationId: orgId } }, include: { conversation: { select: { agentId: true } } } })
    sections.push({
      heading: 'Desempenho por atendente',
      columns: ['Atendente', 'Equipe', 'Conversas', '1ª resposta média (min)', 'Nota média', 'Promessas cumpridas', 'Oportunidades'],
      formats: ['text', 'text', 'int', 'decimal', 'int', 'text', 'int'],
      rows: agents.map((a) => {
        const mine = convs.filter((c) => c.agentId === a.id)
        const pr = promises.filter((p) => p.conversation.agentId === a.id)
        return [a.name, a.team ?? '—', mine.length, round(mean(mine.map(firstResponse).filter((x): x is number => x != null))), Math.round(mean(mine.filter((c) => c.messages.length >= 2).map((c) => c.score))), `${pr.filter((p) => p.status === 'kept').length}/${pr.length}`, mine.filter((c) => c.opportunities.length > 0).length]
      }),
    })
    const unassigned = convs.filter((c) => !c.agentId).length
    summary.push(`${agents.length} atendente(s); ${unassigned} conversa(s) sem atendente identificado.`)
  }

  if (type === 'lost_opportunities') {
    const list = convs.filter((c) => c.operationalStatus === 'lost' || (c.operationalStatus === 'waiting_company' && c.opportunities.some((o) => o.status === 'active')))
    const total = list.reduce((s, c) => s + c.potentialValue, 0)
    summary.push(`${list.length} oportunidade(s) perdida(s) ou em risco, ${money(total)} em valor estimado.`)
    sections.push({
      heading: 'Oportunidades perdidas ou em risco',
      columns: ['Cliente', 'Situação', 'Intenção', 'Valor estimado (R$)', 'Espera (min)', 'Atendente'],
      formats: ['text', 'text', 'text', 'money', 'int', 'text'],
      rows: list.map((c) => [nameOf(c), c.operationalStatus === 'lost' ? 'Perdida' : 'Em risco', c.primaryIntent ?? '—', c.potentialValue, waitingMin(c), c.agent?.name ?? 'Sem atendente']),
    })
  }

  if (type === 'promises') {
    const promises = await db.promise.findMany({ where: { conversation: { organizationId: orgId, openedAt: { gte: start, lte: end } } }, include: { conversation: { include: { contact: { select: { displayName: true } } } } }, orderBy: { dueAt: 'desc' } })
    const label: Record<string, string> = { open: 'Em aberto', kept: 'Cumprida', broken: 'Descumprida' }
    summary.push(`${promises.length} promessa(s): ${promises.filter((p) => p.status === 'kept').length} cumprida(s), ${promises.filter((p) => p.status === 'open' && p.dueAt && p.dueAt < new Date()).length} vencida(s).`)
    sections.push({
      heading: 'Promessas da empresa aos clientes',
      columns: ['Cliente', 'Promessa', 'Responsável', 'Prazo', 'Situação'],
      formats: ['text', 'text', 'text', 'date', 'text'],
      rows: promises.map((p) => [p.conversation.contact?.displayName ?? 'Desconhecido', maskSensitive(p.action), p.promisorAgent, iso(p.dueAt), p.status === 'open' && p.dueAt && p.dueAt < new Date() ? 'Vencida' : label[p.status] ?? p.status]),
    })
  }

  if (type === 'recovery') {
    const items = await db.recoveryItem.findMany({ where: { organizationId: orgId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } })
    const recovered = items.filter((i) => i.status === 'recovered')
    summary.push(`${items.length} item(ns) na fila; ${recovered.length} recuperado(s), ${money(recovered.reduce((s, i) => s + (i.recoveredValue ?? 0), 0))} recuperados.`)
    const byStatus = new Map<string, number>()
    for (const i of items) byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1)
    sections.push({ heading: 'Resumo por situação', columns: ['Situação', 'Itens'], formats: ['text', 'int'], rows: [...byStatus.entries()] })
    sections.push({
      heading: 'Fila de recuperação',
      columns: ['Cliente', 'Motivo', 'Situação', 'Prioridade', 'Atendente original', 'Valor recuperado (R$)'],
      formats: ['text', 'text', 'text', 'decimal', 'text', 'money'],
      rows: items.map((i) => [i.customerName ?? 'Desconhecido', i.reason ?? '—', i.status, round(i.priorityScore, 2), i.originalAgentName ?? '—', i.recoveredValue ?? 0]),
    })
  }

  if (type === 'data_quality') {
    const feedbacks = await db.classificationFeedback.count({ where: { organizationId: orgId, createdAt: { gte: start, lte: end } } })
    const classified = convs.filter((c) => c.primaryIntent).length
    const withAgent = convs.filter((c) => c.agentId).length
    summary.push('Quanto mais completa a classificação e a identificação de atendentes, mais confiáveis os alertas e relatórios.')
    sections.push({
      heading: 'Cobertura dos dados',
      columns: ['Indicador', 'Valor'],
      rows: [
        ['Conversas no período', convs.length],
        ['Com intenção identificada', `${classified} (${pct(classified, convs.length)})`],
        ['Com atendente identificado', `${withAgent} (${pct(withAgent, convs.length)})`],
        ['Confiança média da classificação', convs.length ? round(mean(convs.map((c) => c.confidence)), 2) : 0],
        ['Correções manuais feitas', feedbacks],
        ['Método de classificação', aiEnabled() ? 'Claude (IA), com as regras de palavras quando a IA não responde' : 'Regras de palavras (heurística), sem IA'],
      ],
    })
  }

  if (type === 'connections') {
    const conns = await db.whatsAppConnection.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } })
    summary.push(`${conns.length} conexão(ões); ${conns.filter((c) => c.status === 'connected').length} conectada(s).`)
    sections.push({
      heading: 'Conexões de WhatsApp',
      columns: ['Nome', 'Final do número', 'Situação', 'Último evento', 'Conversas no período', 'Mensagens no período'],
      formats: ['text', 'text', 'text', 'date', 'int', 'int'],
      rows: conns.map((c) => {
        const mine = convs.filter((v) => v.connectionId === c.id)
        return [c.name, c.phoneLast4, c.status, iso(c.lastEventAt), mine.length, mine.reduce((s, v) => s + v.messages.length, 0)]
      }),
    })
  }

  return {
    type,
    title: REPORT_TITLES[type],
    orgName: org?.displayName ?? '',
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    generatedAt: new Date().toISOString(),
    timezone: org?.timezone || 'America/Sao_Paulo',
    ...(highlights ? { highlights } : {}),
    summary,
    sections,
  }
}
