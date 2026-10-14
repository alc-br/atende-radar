// Cálculo dos números diários do painel, sem banco (T15: separado de metrics.ts para os testes de unidade).

// T15 · um formatador por fuso, e o dia de cada instante já calculado fica guardado: o painel do supervisor pergunta o dia
// da mesma mensagem uma vez para cada um dos 14 dias. Criar Intl.DateTimeFormat a cada chamada custava segundos.
const dayFormatters = new Map<string, { f: Intl.DateTimeFormat; memo: Map<number, string> }>()
export const dayKey = (d: Date, tz: string) => {
  let e = dayFormatters.get(tz)
  if (!e) dayFormatters.set(tz, (e = { f: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }), memo: new Map() }))
  const ms = d.getTime()
  let k = e.memo.get(ms)
  if (k === undefined) {
    if (e.memo.size >= 200_000) e.memo.clear() // limite de memória no servidor
    e.memo.set(ms, (k = e.f.format(d)))
  }
  return k
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const minutes = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000)

/** O mínimo de uma conversa que os números do painel usam. */
export interface MetricConversation {
  openedAt: Date
  closedAt: Date | null
  operationalStatus: string
  score: number
  messages: Array<{ direction: string; occurredAt: Date }>
  opportunities: Array<{ status: string; expectedValue: number; createdAt: Date }>
}
export interface MetricPromise {
  status: string
  dueAt: Date | null
}
export interface DayMetricData {
  conversationsStarted: number
  customersWaiting: number
  medianFirstResponse: number
  opportunitiesDetected: number
  opportunitiesAtRisk: number
  overduePromises: number
  potentialValueAtRisk: number
  overallScore: number
  messagesReceived: number
  messagesSent: number
}

export function firstResponseMinutes(c: MetricConversation): number | null {
  const inbound = c.messages.filter((m) => m.direction === 'inbound').sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
  if (!inbound) return null
  const out = c.messages.filter((m) => m.direction === 'outbound' && m.occurredAt > inbound.occurredAt).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
  return out ? minutes(inbound.occurredAt, out.occurredAt) : null
}

/**
 * Números de UM dia do painel a partir de um conjunto de conversas (a organização inteira ou só uma equipe).
 * Retrato do momento (esperando, em risco, promessas vencidas) só vale para hoje; outros dias ficam 0.
 * null = dia sem movimento (não vira linha, igual ao que o motor grava).
 */
export function dayMetrics(convs: MetricConversation[], promises: MetricPromise[], date: string, tz: string, now: Date): DayMetricData | null {
  const isToday = date === dayKey(now, tz)
  const opened = convs.filter((c) => dayKey(c.openedAt, tz) === date)
  const msgsOfDay = convs.flatMap((c) => c.messages).filter((m) => dayKey(m.occurredAt, tz) === date)
  if (!isToday && opened.length === 0 && msgsOfDay.length === 0) return null

  const open = convs.filter((c) => c.closedAt == null && !['won', 'lost'].includes(c.operationalStatus))
  const waiting = open.filter((c) => c.operationalStatus === 'waiting_company')
  const atRiskOpps = waiting.flatMap((c) => c.opportunities.filter((o) => o.status === 'active'))
  const scores = opened.filter((c) => c.messages.length >= 2).map((c) => c.score)
  const firsts = opened.map(firstResponseMinutes).filter((x): x is number => x != null)

  return {
    conversationsStarted: opened.length,
    customersWaiting: isToday ? waiting.length : 0,
    medianFirstResponse: +median(firsts).toFixed(1),
    opportunitiesDetected: convs.flatMap((c) => c.opportunities).filter((o) => dayKey(o.createdAt, tz) === date).length,
    opportunitiesAtRisk: isToday ? atRiskOpps.length : 0,
    overduePromises: isToday ? promises.filter((p) => p.status === 'open' && p.dueAt && p.dueAt < now).length : 0,
    potentialValueAtRisk: isToday ? Math.round(atRiskOpps.reduce((s, o) => s + o.expectedValue, 0)) : 0,
    overallScore: Math.round(mean(scores)),
    messagesReceived: msgsOfDay.filter((m) => m.direction === 'inbound').length,
    messagesSent: msgsOfDay.filter((m) => m.direction === 'outbound').length,
  }
}

/** Início da janela que pode mexer nos números de hoje e de ontem (3 dias de folga cobrem qualquer fuso). */
export const metricsWindowStart = (now: Date) => new Date(now.getTime() - 3 * 86400000)

/**
 * T15 · Conversas que podem mudar algum número de hoje/ontem em `dayMetrics`: abertas na janela, ainda em aberto,
 * com mensagem na janela ou oportunidade criada na janela. As demais dão o mesmo resultado (não entram em nenhum filtro
 * do dia), então ficam de fora da leitura. Espelha o `where` de recomputeMetrics (teste: metrics-window.unit.spec.ts).
 */
export function inMetricsWindow(c: MetricConversation, since: Date): boolean {
  return c.openedAt >= since || c.closedAt == null || c.messages.some((m) => m.occurredAt >= since) || c.opportunities.some((o) => o.createdAt >= since)
}
