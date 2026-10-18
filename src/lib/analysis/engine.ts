import { db } from '../db'
import { classifyMessages, type AnalysisMessage } from './classify'
import { extractPromise } from './promises'
import { decideAgent } from './agents'
import { attributionFor, conversationsOfIdentities, reattributeConversations, recordSightings, refreshIdentityStats, refreshSuggestions } from '../agent-identities'
import { scoreConversation } from './score'
import { estimateOpportunity } from './opportunity'
import { revenueParams } from './revenue-params'
import { analysisGate, type PauseReason } from '../billing/analysis-gate'
import { recomputeMetrics } from './metrics'
import { detectIgnoredQuestions } from './questions'
import { purgeExpired } from '../privacy'
import { maskSensitive } from '../mask-sensitive'
import { enqueueAlertEvent } from '../webhooks'
import { queueAlertEmails } from '../alert-email'
import { milestone } from '../product-events'
import { detectOutcome } from './outcome'
import { alertGroup, alertGroupKey, groupHeadline, severityRank } from './alert-groups'
import { conversationTeamIds, exemptByTags, groupAutoClose, inRuleWindow, inTeamScope, parseRuleWindow, type TeamLite } from './rule-filters'
import { businessMinutesBetween, outsideRuleFrom, scheduleFrom, type HoursSettings } from './business-hours'
import { REAL_ORGS } from '../sandbox'

// Só conversas que vieram do WhatsApp de verdade (têm mensagem com externalId) entram no motor.
// Dados de demonstração/seed ficam intocados.
const REAL = { messages: { some: { externalId: { not: null } } }, NOT: { contact: { excluded: true } } }
const OPEN_ALERT = ['new', 'acknowledged', 'in_progress']
const CLOSED_OUTCOMES = ['won', 'lost']

const FINDING_TYPE: Record<string, string> = {
  no_response: 'no_response',
  no_response_followup: 'slow_response',
  pending_quote: 'pending_quote',
  high_intent_no_reply: 'no_response',
  customer_frustrated: 'customer_frustrated',
  promise_overdue: 'overdue_promise',
  promise_approaching: 'overdue_promise',
  overdue_promise: 'overdue_promise',
  slow_response: 'slow_response',
  ignored_question: 'ignored_question',
  abandoned_lead: 'abandoned_lead',
}
const RECOVERY_RULES = ['pending_quote', 'high_intent_no_reply', 'no_response', 'no_response_followup', 'slow_response', 'abandoned_lead']
// Regras que não olham uma conversa: valem para a empresa inteira (tratadas depois do laço das conversas)
const ORG_RULES = ['connection_down', 'quota_warning']
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export interface AnalysisSummary {
  organizations: number
  conversations: number
  alertsOpened: number
  alertsResolved: number
  paused?: PauseReason // T11: teste vencido/assinatura encerrada, nada analisado
  overQuota?: number // T11: conversas do mês acima do limite do plano, não analisadas
  outcomesDetected?: number // B6: venda/perda decidida pelas mensagens
  alertsRepeated?: number // B6: alerta reaberto (mesma conversa e causa), contador +1
  alertsEscalated?: number // B6: alerta aberto que ficou mais grave
  alertsAutoClosed?: number // regra com "encerrar sozinho": alerta fechado pelo prazo com o problema ainda de pé
}

const parseJson = <T,>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}
const minutesBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000)
const positive = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const withTag = (tagsJson: string, tag: string) => {
  const tags = (() => { try { return JSON.parse(tagsJson || '[]') as string[] } catch { return [] } })()
  return JSON.stringify(tags.includes(tag) ? tags : [...tags, tag])
}

/** Roda o motor em todas as organizações com conversas reais ou conexões. */
export async function analyzeAll(now = new Date()): Promise<AnalysisSummary> {
  // A organização de demonstração fica de fora: seus dados são fixos e não devem gerar alertas nem mudar sozinhos.
  // As simuladas também: o relógio delas é o do cenário (o simulador chama analyzeOrganization com o "agora" simulado).
  // Inclui organizações que só têm conexões (a conexão pode cair antes da primeira mensagem)
  const orgs = await db.organization.findMany({ where: { status: 'active', deletionRequestedAt: null, ...REAL_ORGS(), OR: [{ conversations: { some: REAL } }, { connections: { some: {} } }] }, select: { id: true } })
  const total: AnalysisSummary = { organizations: 0, conversations: 0, alertsOpened: 0, alertsResolved: 0 }
  for (const o of orgs) {
    const s = await analyzeOrganization(o.id, now)
    total.organizations += 1
    total.conversations += s.conversations
    total.alertsOpened += s.alertsOpened
    total.alertsResolved += s.alertsResolved
  }
  return total
}

export async function analyzeOrganization(orgId: string, now = new Date()): Promise<AnalysisSummary> {
  const summary: AnalysisSummary = { organizations: 1, conversations: 0, alertsOpened: 0, alertsResolved: 0 }

  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org || org.deletionRequestedAt) return summary // empresa em exclusão: nada mais é analisado
  await purgeExpired(orgId, org.settingsJson, now) // retenção: apaga o que passou do prazo antes de analisar
  const gate = await analysisGate(orgId, now) // T11: plano vencido pausa; acima do limite do mês não analisa
  if (gate.paused) return { ...summary, paused: gate.paused }
  if (gate.skipped.size) summary.overQuota = gate.skipped.size
  const [rules, agents, connections, teamRows] = await Promise.all([
    db.alertRule.findMany({ where: { organizationId: orgId, active: true } }),
    db.agent.findMany({ where: { organizationId: orgId, status: 'active' } }),
    db.whatsAppConnection.findMany({ where: { organizationId: orgId } }),
    db.team.findMany({ where: { organizationId: orgId, active: true }, select: { id: true, name: true, connectionIds: true } }),
  ])
  const teams: TeamLite[] = teamRows.map((t) => ({ id: t.id, name: t.name, connectionIds: parseJson<string[]>(t.connectionIds, []) }))

  // A tela de Configurações grava tudo na raiz de `settings` (avgTicket, convRate em %, businessHours, slaFirst, …).
  type OrgSettings = HoursSettings & { avgTicket?: string | number; convRate?: string | number; slaFirst?: string | number; slaContinuity?: string | number; abandonTime?: string | number; inactivityClose?: string | number }
  const settings = parseJson<OrgSettings>(org.settingsJson, {})
  const { avgTicket, conversionRate, ceiling, ticketSource } = await revenueParams(orgId, settings as Record<string, unknown>) // P2 · Financeiro
  // P2 · Horário comercial e regra fora do expediente:
  //   ignora → alertas e nota só contam minutos de expediente · atraso → tudo em tempo corrido · alerta → alerta em tempo corrido, nota em expediente
  const schedule = scheduleFrom(settings, org.timezone)
  const outsideRule = outsideRuleFrom(settings)
  const wall = (a: Date, b: Date) => minutesBetween(a, b)
  const biz = (a: Date, b: Date) => businessMinutesBetween(a, b, schedule)
  const forAlerts = outsideRule === 'ignora' ? biz : wall
  const forScore = outsideRule === 'atraso' ? wall : biz
  // filtros de cada regra (rule-filters.ts): janela de dias e horários, números, equipes, exceções por etiqueta
  const ruleFilter = new Map(rules.map((r) => [r.id, {
    window: parseRuleWindow(r.daysAndHours),
    connections: parseJson<string[]>(r.scopeConnections, []),
    teams: parseJson<string[]>(r.scopeTeams, []),
    exceptions: parseJson<string[]>(r.exceptions, []),
  }]))
  const ruleOpensNow = (ruleId: string) => inRuleWindow(ruleFilter.get(ruleId)!.window, now, schedule.timezone)
  // P2 · SLA e encerramento automático (Configurações › Atendimento); horas corridas.
  const slaFirst = positive(settings.slaFirst, 10)
  const slaContinuity = positive(settings.slaContinuity, 30)
  const abandonHours = positive(settings.abandonTime, 4)
  const inactivityHours = positive(settings.inactivityClose, 48)

  // I8 · Motor incremental: só entram conversas que PODEM mudar de estado nesta rodada —
  //  · marcadas pela ingestão ou por ação manual (needsAnalysisAt),
  //  · esperando a empresa (alertas por tempo), com alerta/promessa/pergunta em aberto, com oportunidade ativa (abandono),
  //  · abertas e paradas há mais que o prazo de inatividade (encerramento).
  // Conversa quieta e sem pendência não é reprocessada (custo cresce com o que muda, não com o histórico).
  const staleBefore = new Date(now.getTime() - inactivityHours * 3600000)
  const conversations = (await db.conversation.findMany({
    where: {
      organizationId: orgId,
      ...REAL,
      OR: [
        { needsAnalysisAt: { not: null } },
        { closedAt: null, operationalStatus: 'waiting_company' },
        { closedAt: null, alerts: { some: { status: { in: OPEN_ALERT } } } },
        { closedAt: null, promises: { some: { status: 'open' } } },
        { closedAt: null, openQuestions: { some: { status: 'open' } } },
        { closedAt: null, opportunities: { some: { status: 'active' } } },
        { closedAt: null, updatedAt: { lt: staleBefore } },
      ],
    },
    include: { contact: true, agent: true, messages: { orderBy: { occurredAt: 'asc' } } },
  })).filter((c) => !gate.skipped.has(c.id))
  const convIds = conversations.map((c) => c.id)

  const [promises, feedbacks, opportunities, openAlerts, recoveries, classifications, questions] = await Promise.all([
    db.promise.findMany({ where: { conversationId: { in: convIds } } }),
    db.classificationFeedback.findMany({ where: { organizationId: orgId, targetId: { in: convIds } } }),
    db.revenueOpportunity.findMany({ where: { conversationId: { in: convIds } } }),
    db.alert.findMany({ where: { organizationId: orgId, status: { in: OPEN_ALERT } } }),
    db.recoveryItem.findMany({ where: { organizationId: orgId, conversationId: { in: convIds } } }),
    db.conversationClassification.findMany({ where: { conversationId: { in: convIds } } }),
    db.openQuestion.findMany({ where: { conversationId: { in: convIds } } }),
  ])
  // B6: alertas abertos por grupo (causa + conversa). Alerta antigo (sem groupKey) entra pelo grupo da sua regra.
  const openAlertsByGroup = new Map<string, typeof openAlerts>()
  for (const a of openAlerts) {
    if (!a.conversationId) continue
    const r = rules.find((x) => x.name === a.ruleName)
    const key = a.groupKey ?? (r ? alertGroupKey(r, a.conversationId) : null)
    if (key) openAlertsByGroup.set(key, [...(openAlertsByGroup.get(key) ?? []), a])
  }
  const activeAgentIds = new Set(agents.map((a) => a.id))
  const touchedIdentities = new Set<string>()

  for (const conv of conversations) {
    summary.conversations += 1
    // mensagens antigas (gravadas antes da máscara na entrada) também passam mascaradas: alerta/achado/promessa nunca copiam CPF ou cartão
    const msgs = conv.messages.map((m) => ({ ...m, text: maskSensitive(m.text) }))
    const analysisMsgs: AnalysisMessage[] = msgs.map((m) => ({ direction: m.direction === 'inbound' ? 'inbound' : 'outbound', text: m.text, occurredAt: m.occurredAt }))
    const fb = new Set(feedbacks.filter((f) => f.targetId === conv.id).map((f) => f.targetType))

    // --- atendente (P5): identidades vistas na conversa (assinatura, aparelho, número) ---
    // Só vínculo CONFIRMADO por admin/gestor vira atendente da conversa; palpite fica como "sugerido". Escolha manual não é desfeita.
    const connName = connections.find((c) => c.id === conv.connectionId)?.name ?? ''
    for (const id of await recordSightings(conv, msgs, { connectionName: connName, agents })) touchedIdentities.add(id)
    const attribution = decideAgent(conv, (await attributionFor([conv.id], activeAgentIds)).get(conv.id)!, fb.has('agent'))
    const agentId = attribution.agentId
    const agent = agentId ? agents.find((a) => a.id === agentId) ?? (conv.agent?.id === agentId ? conv.agent : null) : null

    // --- classificação (respeita correções manuais) ---
    // Se o texto já foi apagado pela retenção, mantém a classificação que existia (não reclassifica em branco).
    const hasText = analysisMsgs.some((m) => m.direction === 'inbound' && m.text)
    const cls = hasText ? classifyMessages(analysisMsgs) : { ...classifyMessages([]), intent: conv.primaryIntent, stage: conv.inferredStage, urgency: conv.urgency as 'low' | 'normal' | 'high' | 'critical', sentiment: conv.sentiment as 'neutral' | 'positive' | 'frustrated' | 'anxious' | 'confused', confidence: conv.confidence }
    // Correção humana vence sempre: pela correção registrada (valor já gravado na conversa) ou pela classificação
    // marcada como corrigida (caminho antigo "classification:<id>", que não mexia na conversa).
    const correctedLabel = new Map(classifications.filter((c) => c.conversationId === conv.id && c.reviewedStatus === 'corrected').map((c) => [c.classificationType, c.label]))
    const pick = <T extends string | null>(type: string, current: T, auto: T): T =>
      fb.has(type) ? current : correctedLabel.has(type) ? (correctedLabel.get(type) as T) : !hasText ? current : auto
    const intent = pick('intent', conv.primaryIntent, cls.intent)
    const sentiment = pick('sentiment', conv.sentiment, cls.sentiment)
    const urgency = pick('urgency', conv.urgency, cls.urgency)
    const stage = pick('stage', conv.inferredStage, cls.stage)
    const humanIntent = fb.has('intent') || correctedLabel.has('intent')

    for (const [type, label] of [['intent', intent], ['sentiment', sentiment], ['urgency', urgency], ['stage', stage]] as const) {
      if (!label) continue
      const existing = classifications.find((c) => c.conversationId === conv.id && c.classificationType === type)
      if (!existing) {
        await db.conversationClassification.create({
          data: { conversationId: conv.id, classificationType: type, label, confidence: cls.confidence, source: cls.source, rationale: 'Regras de palavras (sem IA)' },
        })
      } else if (existing.reviewedStatus === 'pending' && (existing.label !== label || existing.confidence !== cls.confidence)) {
        await db.conversationClassification.update({ where: { id: existing.id }, data: { label, confidence: cls.confidence } })
      }
    }

    // --- promessas da empresa ---
    const convPromises = promises.filter((p) => p.conversationId === conv.id)
    const knownSources = new Set(convPromises.map((p) => p.sourceMessage))
    for (const m of msgs) {
      if (m.direction !== 'outbound' || knownSources.has(m.id)) continue
      const p = extractPromise(m.text, m.occurredAt)
      if (!p) continue
      const created = await db.promise.create({
        data: { conversationId: conv.id, sourceMessage: m.id, promisorAgent: agent?.name ?? 'Empresa', action: p.action, dueAt: p.dueAt, duePrecision: 'text', status: 'open', confidence: 0.6 },
      })
      convPromises.push(created)
      promises.push(created)
    }
    let overdueOpen = 0
    let approachingOpen = 0
    for (const p of convPromises) {
      if (p.status !== 'open') continue
      const srcMsg = msgs.find((m) => m.id === p.sourceMessage)
      const fulfilled = srcMsg
        ? msgs.find((m) => m.direction === 'outbound' && m.occurredAt > srcMsg.occurredAt && !extractPromise(m.text, m.occurredAt))
        : undefined
      if (fulfilled) {
        await db.promise.update({ where: { id: p.id }, data: { status: 'kept', completionMessage: fulfilled.id } })
        p.status = 'kept'
      } else if (p.dueAt && p.dueAt < now) overdueOpen += 1
      else if (p.dueAt) approachingOpen += 1
    }

    // --- perguntas ignoradas (B6): pergunta do cliente sem resposta além do SLA (mesmo relógio dos alertas) ---
    // Idempotente pela mensagem de origem; a pergunta em aberto vira "respondida" quando a empresa responde depois.
    const convQuestions = questions.filter((q) => q.conversationId === conv.id)
    for (const q of convQuestions) {
      if (q.status !== 'open') continue // respondida/cancelada (inclusive à mão) fica como está
      const src = msgs.find((m) => m.id === q.sourceMessage)
      const reply = src ? msgs.find((m) => m.direction === 'outbound' && m.occurredAt > src.occurredAt) : undefined
      if (reply) {
        await db.openQuestion.update({ where: { id: q.id }, data: { status: 'answered', answeredByMessage: reply.id } })
        q.status = 'answered'
      }
    }
    const knownQuestions = new Set(convQuestions.map((q) => q.sourceMessage))
    for (const q of detectIgnoredQuestions(msgs, { now, slaFirstMinutes: slaFirst, slaContinuityMinutes: slaContinuity, elapsed: forAlerts })) {
      if (knownQuestions.has(q.messageId)) continue
      const created = await db.openQuestion.create({
        data: { conversationId: conv.id, sourceMessage: q.messageId, normalizedQuestion: q.text, askedAt: q.askedAt, answeredByMessage: q.answeredBy, status: q.answeredBy ? 'answered' : 'open', confidence: 0.6 },
      })
      questions.push(created)
    }

    // --- tempos ---
    const firstIn = msgs.find((m) => m.direction === 'inbound')
    const firstOutAfter = firstIn ? msgs.find((m) => m.direction === 'outbound' && m.occurredAt > firstIn.occurredAt) : undefined
    const firstResponseMinutes = firstIn && firstOutAfter ? forScore(firstIn.occurredAt, firstOutAfter.occurredAt) : null
    const hasAnyOutbound = msgs.some((m) => m.direction === 'outbound')
    const waitingCompany = conv.operationalStatus === 'waiting_company'
    const waitingMinutes = waitingCompany && conv.waitingSince ? forAlerts(conv.waitingSince, now) : 0
    const waitingForScore = waitingCompany && conv.waitingSince ? forScore(conv.waitingSince, now) : 0
    // cliente que parou de responder depois da empresa falar (relógio dos alertas): base do "Lead abandonado"
    const customerSilentForAlerts = conv.operationalStatus === 'waiting_customer' && conv.lastOutboundAt ? forAlerts(conv.lastOutboundAt, now) : 0
    let closed = conv.closedAt != null || CLOSED_OUTCOMES.includes(conv.operationalStatus)

    const est = estimateOpportunity(intent, avgTicket, conversionRate, ceiling)
    let opp = opportunities.find((o) => o.conversationId === conv.id)
    let oppId = opp?.id

    // --- correção humana da intenção (B6): "não é venda" tira a oportunidade ainda em aberto dos indicadores ---
    // (valor em risco, oportunidades, fila). Venda/perda já decidida fica. Se a pessoa corrigir de volta para uma
    // intenção de venda, a oportunidade é criada de novo mais abaixo.
    if (humanIntent && !est && opp && opp.status === 'active') {
      await db.recoveryItem.updateMany({ where: { opportunityId: opp.id }, data: { opportunityId: null } })
      await db.revenueOpportunity.delete({ where: { id: opp.id } })
      opportunities.splice(opportunities.indexOf(opp), 1)
      opp = opportunities.find((o) => o.conversationId === conv.id)
      oppId = opp?.id
    }

    // --- resultado automático (B6): venda fechada ou perda declarada pelo cliente, com regras conservadoras ---
    // Só em conversa aberta, com oportunidade de venda ainda em aberto e sem resultado dado por uma pessoa
    // (a correção humana prevalece sempre; o resultado manual fecha a conversa e o motor não mexe mais).
    const humanOutcome = fb.has('outcome')
    const oppUndecided = !opp || opp.status === 'active'
    if (!closed && !humanOutcome && oppUndecided && (est || opp) && hasText) {
      const detected = detectOutcome(analysisMsgs)
      if (detected) {
        const status = detected.outcome
        if (!opp && est) {
          opp = await db.revenueOpportunity.create({
            data: {
              conversationId: conv.id, status, baseTicket: est.baseTicket, ticketSource, probability: est.probability,
              probabilitySource: 'org_setting', intentFactor: est.intentFactor, expectedValue: est.expectedValue, rangeLow: est.rangeLow, rangeHigh: est.rangeHigh, confidence: cls.confidence,
            },
          })
          oppId = opp.id
          opportunities.push(opp)
        }
        await db.revenueOpportunity.updateMany({ where: { conversationId: conv.id, status: 'active' }, data: { status } })
        for (const o of opportunities) if (o.conversationId === conv.id && o.status === 'active') o.status = status
        await db.conversation.update({ where: { id: conv.id }, data: { closedAt: now, operationalStatus: status, waitingSince: null, tags: withTag(conv.tags, status === 'won' ? 'venda-detectada' : 'perda-declarada') } })
        // fila de Recuperação: venda fecha como recuperada; perda declarada fecha como perdida (não cria item novo)
        const openItems = recoveries.filter((r) => r.conversationId === conv.id && !['recovered', 'lost'].includes(r.status))
        if (openItems.length) {
          await db.recoveryItem.updateMany({
            where: { id: { in: openItems.map((r) => r.id) } },
            data: { status: status === 'won' ? 'recovered' : 'lost', outcome: `${detected.reason} (automático)`, completedAt: now },
          })
          for (const r of openItems) r.status = status === 'won' ? 'recovered' : 'lost'
        }
        summary.outcomesDetected = (summary.outcomesDetected ?? 0) + 1
        conv.closedAt = now
        closed = true
      }
    }

    // --- encerramento automático (P2) ---
    if (!closed) {
      const lastMsgAt = msgs.length ? msgs[msgs.length - 1].occurredAt : conv.openedAt
      const customerSilentMinutes = conv.operationalStatus === 'waiting_customer' && conv.lastOutboundAt ? wall(conv.lastOutboundAt, now) : 0
      // cliente esperando a empresa: com "fora do expediente: ignora", fim de semana e feriado não contam (sem isto o
      // cliente da sexta à noite tinha a conversa encerrada no domingo e o alerta de segunda nunca abria)
      const silentForClose = conv.operationalStatus === 'waiting_company' ? forAlerts(lastMsgAt, now) : wall(lastMsgAt, now)
      if (silentForClose >= inactivityHours * 60) {
        // ninguém fala há mais tempo que "Encerramento por inatividade"
        await db.conversation.update({ where: { id: conv.id }, data: { closedAt: now, operationalStatus: 'closed', waitingSince: null } })
        conv.closedAt = now
        closed = true
      } else if ((est || opp) && oppUndecided && !humanOutcome && customerSilentMinutes >= abandonHours * 60) {
        // a empresa respondeu, o cliente com oportunidade sumiu por mais que "Tempo de abandono": perdido por abandono
        if (est && !opp) {
          // registra a oportunidade perdida (valor que escapou), mesmo que o motor nunca a tenha visto ativa
          opp = await db.revenueOpportunity.create({
            data: {
              conversationId: conv.id, status: 'lost', baseTicket: est.baseTicket, ticketSource, probability: est.probability,
              probabilitySource: 'org_setting', intentFactor: est.intentFactor, expectedValue: est.expectedValue, rangeLow: est.rangeLow, rangeHigh: est.rangeHigh, confidence: cls.confidence,
            },
          })
          oppId = opp.id
          opportunities.push(opp)
        }
        await db.conversation.update({ where: { id: conv.id }, data: { closedAt: now, operationalStatus: 'lost', waitingSince: null, tags: withTag(conv.tags, 'abandono') } })
        await db.revenueOpportunity.updateMany({ where: { conversationId: conv.id, status: 'active' }, data: { status: 'lost' } })
        for (const o of opportunities) if (o.conversationId === conv.id && o.status === 'active') o.status = 'lost'
        if (!recoveries.some((r) => r.conversationId === conv.id && ['new', 'in_progress', 'assigned'].includes(r.status))) {
          const item = await db.recoveryItem.create({
            data: {
              organizationId: orgId, conversationId: conv.id, opportunityId: oppId ?? null, agentId: agentId ?? null, reason: 'Abandono do cliente', priorityScore: 0.5,
              dueAt: new Date(now.getTime() + 24 * 3600000), status: 'new', customerName: conv.contact?.displayName || 'Desconhecido', originalAgentName: agent?.name ?? null,
            },
          })
          recoveries.push(item)
        }
        conv.closedAt = now
        closed = true
      }
    }

    // --- oportunidade ---
    if (est && !opp && !closed) {
      const created = await db.revenueOpportunity.create({
        data: {
          conversationId: conv.id, status: 'active', baseTicket: est.baseTicket, ticketSource, probability: est.probability,
          probabilitySource: 'org_setting', intentFactor: est.intentFactor, expectedValue: est.expectedValue, rangeLow: est.rangeLow, rangeHigh: est.rangeHigh, confidence: cls.confidence,
        },
      })
      oppId = created.id
      opportunities.push(created)
    } else if (est && opp && opp.status === 'active') {
      if (opp.expectedValue !== est.expectedValue || opp.baseTicket !== est.baseTicket || opp.ticketSource !== ticketSource) {
        await db.revenueOpportunity.update({
          where: { id: opp.id },
          data: { baseTicket: est.baseTicket, ticketSource, probability: est.probability, intentFactor: est.intentFactor, expectedValue: est.expectedValue, rangeLow: est.rangeLow, rangeHigh: est.rangeHigh, confidence: cls.confidence },
        })
      }
    }
    const potentialValue = est && !closed ? est.expectedValue : opp?.expectedValue ?? 0
    const hasOpportunity = !!est || !!opp

    // --- nota e risco ---
    const recovered = recoveries.some((r) => r.conversationId === conv.id && r.status === 'recovered')
    const score = scoreConversation({ firstResponseMinutes, waitingMinutes: waitingForScore, hasOpportunity, sentiment, messages: msgs.length, unansweredPromises: overdueOpen, recovered, slaFirstMinutes: slaFirst, slaContinuityMinutes: slaContinuity })
    const waitFactor = Math.min(1, waitingMinutes / 120)
    const urgencyFactor = ({ low: 0, normal: 0.3, high: 0.7, critical: 1 } as Record<string, number>)[urgency] ?? 0.3
    const riskScore = closed ? 0 : +Math.min(1, 0.4 * waitFactor + 0.3 * urgencyFactor + 0.2 * (hasOpportunity ? 1 : 0) + 0.1 * (sentiment === 'frustrated' ? 1 : 0)).toFixed(2)

    await db.conversation.update({
      where: { id: conv.id },
      data: {
        agentId: attribution.agentId,
        agentAttribution: attribution.agentAttribution,
        suggestedAgentId: attribution.suggestedAgentId,
        primaryIntent: intent,
        inferredStage: stage,
        urgency,
        sentiment,
        confidence: cls.confidence,
        score: score.total,
        riskScore,
        potentialValue,
        needsAnalysisAt: null,
      },
    })
    const existingScore = await db.conversationScore.findFirst({ where: { conversationId: conv.id } })
    const scoreData = { total: score.total, componentScores: JSON.stringify(score.components), eligibility: score.eligible, calculatedAt: now }
    if (existingScore) await db.conversationScore.update({ where: { id: existingScore.id }, data: scoreData })
    else await db.conversationScore.create({ data: { conversationId: conv.id, ...scoreData } })

    // --- alertas: abre quando a regra dispara, resolve quando deixa de valer ---
    const customerName = conv.contact?.displayName || 'Desconhecido'
    const lastCustomerMsg = [...msgs].reverse().find((m) => m.direction === 'inbound')
    const evidence = lastCustomerMsg?.text ? `Última mensagem do cliente: "${lastCustomerMsg.text.slice(0, 140)}"` : 'Sem texto (mídia).'

    // Regras da mesma causa (alert-groups.ts) formam UM alerta por conversa; repetição reabre o mesmo alerta (contador).
    const conf = cls.confidence
    const byGroup = new Map<string, Array<{ rule: (typeof rules)[number]; triggered: boolean }>>()
    // perguntas do cliente ainda sem resposta (inclui as detectadas agora), para "Pergunta ignorada"
    const openQuestionsNow = questions.filter((q) => q.conversationId === conv.id && q.status === 'open')
    const oppOpen = !!opp ? opp.status === 'active' : !!est
    const convTags = parseJson<string[]>(conv.tags, [])
    const convTeams = conversationTeamIds(agent?.team, conv.connectionId, teams)
    for (const rule of rules) {
      if (ORG_RULES.includes(rule.type)) continue
      const limit = rule.limitMinutes ?? 0
      const f = ruleFilter.get(rule.id)!
      // número, equipe e exceção: fora deles a regra não vale (e o alerta aberto dela fecha sozinho)
      const inScope = (f.connections.length === 0 || (conv.connectionId != null && f.connections.includes(conv.connectionId)))
        && inTeamScope(f.teams, convTeams, teams)
        && !exemptByTags(convTags, f.exceptions)

      let triggered = false
      switch (rule.type) {
        case 'no_response': triggered = waitingCompany && !hasAnyOutbound && waitingMinutes >= limit; break
        case 'no_response_followup': triggered = waitingCompany && hasAnyOutbound && waitingMinutes >= limit; break
        case 'pending_quote': triggered = waitingCompany && intent === 'preco' && waitingMinutes >= limit && conf >= rule.minConfidence; break
        case 'high_intent_no_reply': triggered = waitingCompany && ['compra', 'agendamento', 'negociacao'].includes(intent ?? '') && waitingMinutes >= limit && conf >= rule.minConfidence; break
        case 'customer_frustrated': triggered = waitingCompany && sentiment === 'frustrated' && waitingMinutes >= limit; break
        case 'slow_response': triggered = waitingCompany && waitingMinutes >= limit; break
        case 'ignored_question': triggered = openQuestionsNow.some((q) => forAlerts(q.askedAt, now) >= limit); break
        case 'abandoned_lead': triggered = oppOpen && customerSilentForAlerts >= limit && limit > 0; break
        case 'promise_overdue':
        case 'overdue_promise': triggered = overdueOpen > 0; break
        case 'promise_approaching': triggered = approachingOpen > 0 && convPromises.some((p) => p.status === 'open' && p.dueAt && p.dueAt >= now && minutesBetween(now, p.dueAt) <= limit); break
        default: triggered = false
      }
      const key = alertGroupKey(rule, conv.id)
      byGroup.set(key, [...(byGroup.get(key) ?? []), { rule, triggered: triggered && inScope && !closed }])
    }

    for (const [key, members] of byGroup) {
      // alertas abertos deste grupo nesta conversa (o mais grave primeiro); mais de um só em dado antigo, de antes do agrupamento
      const open = (openAlertsByGroup.get(key) ?? []).sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.createdAt.getTime() - b.createdAt.getTime())
      const hits = members.filter((m) => m.triggered)

      if (!hits.length) {
        // deixou de valer: o motor resolve (e marca que foi ele, para poder reabrir o mesmo alerta se voltar)
        for (const a of open) {
          await enqueueAlertEvent('alert.resolved', await db.alert.update({ where: { id: a.id }, data: { status: 'resolved', resolvedBy: 'auto' } }))
          if (a.findingId) {
            await db.auditFinding.updateMany({ where: { id: a.findingId, status: { not: 'resolved' } }, data: { status: 'resolved', resolvedAt: now, resolutionReason: 'Resolvido automaticamente' } })
          }
          summary.alertsResolved += 1
        }
        openAlertsByGroup.delete(key)
        // alerta que tinha fechado pelo prazo ("encerrar sozinho"): o problema acabou, então se voltar é repetição (+1)
        await db.alert.updateMany({ where: { organizationId: orgId, conversationId: conv.id, groupKey: key, status: 'resolved', resolvedBy: 'timeout' }, data: { resolvedBy: 'auto' } })
        continue
      }
      // "dias e horários": fora da janela a regra não ABRE alerta; o que já está aberto segue com todas as regras que valem
      const top = groupHeadline((open.length ? hits : hits.filter((m) => ruleOpensNow(m.rule.id))).map((m) => m.rule))
      if (!top) continue
      const { headline, severity, channels } = top

      // "encerrar sozinho": aberto há mais que o prazo (todas as regras que valem pedem isso) → fecha, sem reabrir enquanto
      // o mesmo problema continuar
      const autoClose = groupAutoClose(hits.map((m) => m.rule))
      if (open.length && autoClose != null && minutesBetween(open[0].lastOccurredAt ?? open[0].createdAt, now) >= autoClose) {
        for (const a of open) {
          await enqueueAlertEvent('alert.resolved', await db.alert.update({ where: { id: a.id }, data: { status: 'resolved', resolvedBy: 'timeout', dismissedReason: `Encerrado sozinho após ${autoClose} min (regra)` } }))
          summary.alertsResolved += 1
          summary.alertsAutoClosed = (summary.alertsAutoClosed ?? 0) + 1
        }
        openAlertsByGroup.delete(key)
        continue
      }
      const rule = { ...headline, severity, notificationChannels: JSON.stringify(channels) } // e-mail: gravidade e canais do grupo
      const title = `${headline.name}: ${customerName}`

      if (open.length) {
        const [primary, ...extra] = open
        // dado antigo: junta os alertas do mesmo grupo no mais grave (os outros saem da lista como "agrupados")
        for (const a of extra) {
          await enqueueAlertEvent('alert.resolved', await db.alert.update({ where: { id: a.id }, data: { status: 'resolved', resolvedBy: 'grouped', dismissedReason: `Agrupado no alerta ${primary.id}` } }))
        }
        const escalated = severityRank(severity) > severityRank(primary.severity)
        const changed = escalated || primary.ruleName !== headline.name || extra.length > 0 || primary.groupKey !== key
        if (changed) {
          const updated = await db.alert.update({
            where: { id: primary.id },
            data: {
              groupKey: key, ruleName: headline.name, title, severity: escalated ? severity : primary.severity,
              occurrences: primary.occurrences + extra.reduce((s, a) => s + a.occurrences, 0),
              ...(escalated ? { description: evidence, lastOccurredAt: now } : {}),
            },
          })
          openAlertsByGroup.set(key, [updated])
          // ficou mais grave (ex.: promessa perto de vencer → vencida): avisa de novo, como um alerta novo avisaria
          if (escalated) {
            summary.alertsEscalated = (summary.alertsEscalated ?? 0) + 1
            await enqueueAlertEvent('alert.updated', updated)
            if (channels.includes('in_app')) {
              await db.notification.create({ data: { organizationId: orgId, type: 'alert', title: `Mais grave: ${title}`, message: evidence, data: JSON.stringify({ alertId: updated.id, conversationId: conv.id, severity }) } })
            }
            await queueAlertEmails(rule, updated)
          }
        }
        continue
      }

      // Decisão humana respeitada: alerta dispensado/falso positivo não reabre dentro do intervalo da regra.
      const dismissed = await db.alert.findFirst({
        where: {
          organizationId: orgId, conversationId: conv.id, status: { in: ['dismissed', 'false_positive'] }, updatedAt: { gte: new Date(now.getTime() - headline.cooldownMinutes * 60000) },
          OR: [{ groupKey: key }, { groupKey: null, ruleName: { in: members.map((m) => m.rule.name) } }],
        },
      })
      if (dismissed) continue

      // Fechado pelo prazo da regra e o MESMO problema continua: não reabre. Na espera por resposta, um cliente que
      // voltou a esperar depois do alerta abrir (a empresa respondeu no meio) é um problema novo.
      const last = await db.alert.findFirst({ where: { organizationId: orgId, conversationId: conv.id, groupKey: key }, orderBy: { createdAt: 'desc' } })
      if (last && last.status === 'resolved' && last.resolvedBy === 'timeout') {
        const opened = last.lastOccurredAt ?? last.createdAt
        const newEpisode = alertGroup(headline) === 'resposta' && !!conv.waitingSince && conv.waitingSince > opened
        if (!newEpisode) continue
      }

      const finding = FINDING_TYPE[headline.type]
        ? await db.auditFinding.create({
            data: { conversationId: conv.id, type: FINDING_TYPE[headline.type], severity, status: 'new', detectedAt: now, evidence, confidence: conf, assignedTo: agent?.name ?? null },
          })
        : null
      // Repetição na mesma conversa: o último alerta do grupo foi resolvido pelo próprio motor (a empresa respondeu e o
      // cliente voltou a esperar) → reabre o MESMO alerta com o contador +1, sem e-mail, notificação nem "alert.created".
      // Resolvido por uma pessoa ou dispensado → alerta novo (a pessoa encerrou aquele caso).
      if (last && last.status === 'resolved' && (last.resolvedBy === 'auto' || last.resolvedBy === 'timeout')) {
        const reopened = await db.alert.update({
          where: { id: last.id },
          data: {
            status: 'new', resolvedBy: null, dismissedReason: null, occurrences: last.occurrences + 1, lastOccurredAt: now, findingId: finding?.id ?? last.findingId,
            ruleName: headline.name, title, severity, description: evidence, customerName, agentName: agent?.name ?? null, potentialValue: potentialValue || null, confidence: conf,
          },
        })
        openAlertsByGroup.set(key, [reopened])
        summary.alertsRepeated = (summary.alertsRepeated ?? 0) + 1
        await enqueueAlertEvent('alert.updated', reopened) // só para quem assinou "alerta atualizado"; nunca "alert.created" de novo
      } else {
        const alert = await db.alert.create({
          data: {
            organizationId: orgId, conversationId: conv.id, findingId: finding?.id, ruleName: headline.name, severity, groupKey: key, lastOccurredAt: now,
            title, description: evidence, customerName, agentName: agent?.name ?? null,
            status: 'new', potentialValue: potentialValue || null, confidence: conf,
          },
        })
        openAlertsByGroup.set(key, [alert])
        summary.alertsOpened += 1
        await milestone(orgId, 'first_alert') // funil (I7): 1º alerta de conversa = 1º valor entregue; nunca lança erro
        await enqueueAlertEvent('alert.created', alert) // webhook do cliente (fila; nunca lança erro)
        if (channels.includes('in_app')) {
          await db.notification.create({
            data: { organizationId: orgId, type: 'alert', title: alert.title, message: evidence, data: JSON.stringify({ alertId: alert.id, conversationId: conv.id, severity }) },
          })
        }
        await queueAlertEmails(rule, alert) // canal "email" (fila; nunca lança erro)
      }
      if (members.some((m) => m.triggered && RECOVERY_RULES.includes(m.rule.type)) && hasOpportunity && !recoveries.some((r) => r.conversationId === conv.id && ['new', 'in_progress', 'assigned'].includes(r.status))) {
        const item = await db.recoveryItem.create({
          data: {
            organizationId: orgId, conversationId: conv.id, opportunityId: oppId, agentId: agentId ?? null, reason: headline.name, priorityScore: riskScore,
            dueAt: new Date(now.getTime() + 2 * 3600000), status: 'new', customerName, originalAgentName: agent?.name ?? null,
          },
        })
        recoveries.push(item)
      }
    }
  }

  // --- alertas de conexão (sem conversa) ---
  // (toda regra do tipo vale: a padrão e as que a empresa criar, cada uma com o seu alerta por conexão)
  // Filtros: números e equipes escolhidos (a equipe vale pelos números dela), janela de dias e horários (só abre dentro)
  // e "encerrar sozinho" (fecha pelo prazo e não reabre enquanto a mesma queda continuar).
  for (const connRule of rules.filter((r) => r.type === 'connection_down')) {
    const f = ruleFilter.get(connRule.id)!
    const autoClose = groupAutoClose([connRule])
    for (const c of connections) {
      const inScope = (f.connections.length === 0 || f.connections.includes(c.id)) && inTeamScope(f.teams, conversationTeamIds(null, c.id, teams), teams)
      const down = inScope && (c.status === 'disconnected' || (c.status === 'qr_required' && c.pairedAt != null)) && c.disabledAt == null
      const existing = openAlerts.find((a) => a.ruleName === connRule.name && a.conversationId == null && a.title.endsWith(`: ${c.name}`))
      const lastTimeout = await db.alert.findFirst({ where: { organizationId: orgId, ruleName: connRule.name, conversationId: null, title: `${connRule.name}: ${c.name}`, status: 'resolved', resolvedBy: 'timeout' } })
      if (down && existing && autoClose != null && minutesBetween(existing.lastOccurredAt ?? existing.createdAt, now) >= autoClose) {
        await enqueueAlertEvent('alert.resolved', await db.alert.update({ where: { id: existing.id }, data: { status: 'resolved', resolvedBy: 'timeout', dismissedReason: `Encerrado sozinho após ${autoClose} min (regra)` } }))
        summary.alertsResolved += 1
        summary.alertsAutoClosed = (summary.alertsAutoClosed ?? 0) + 1
      } else if (!down && lastTimeout) {
        // a queda que fechou pelo prazo acabou: a próxima queda abre alerta novo
        await db.alert.update({ where: { id: lastTimeout.id }, data: { resolvedBy: 'auto' } })
      }
      if (down && !existing && !lastTimeout && ruleOpensNow(connRule.id)) {
        const alert = await db.alert.create({
          data: { organizationId: orgId, ruleName: connRule.name, severity: connRule.severity, title: `${connRule.name}: ${c.name}`, description: `A conexão "${c.name}" (final ${c.phoneLast4}) está fora do ar${c.statusReason ? ` (${c.statusReason})` : ''}.`, agentName: null, status: 'new', lastOccurredAt: now },
        })
        summary.alertsOpened += 1
        await enqueueAlertEvent('alert.created', alert)
        if (parseJson<string[]>(connRule.notificationChannels, ['in_app']).includes('in_app')) {
          await db.notification.create({ data: { organizationId: orgId, type: 'alert', title: alert.title, message: alert.description, data: JSON.stringify({ alertId: alert.id, severity: connRule.severity }) } })
        }
        await queueAlertEmails(connRule, alert) // canal "email" (fila; nunca lança erro)
      } else if (!down && existing) {
        await enqueueAlertEvent('alert.resolved', await db.alert.update({ where: { id: existing.id }, data: { status: 'resolved', resolvedBy: 'auto' } }))
        summary.alertsResolved += 1
      }
    }
  }

  // --- aviso de cota (quota_warning): conversas do mês chegando no limite do plano. Um alerta por mês; fecha sozinho se
  // o uso voltar a ficar abaixo (ex.: troca para um plano maior). Dispensado por uma pessoa, não volta no mesmo mês.
  for (const qr of rules.filter((r) => r.type === 'quota_warning')) {
    const pctLimit = qr.limitMinutes && qr.limitMinutes >= 1 && qr.limitMinutes <= 100 ? qr.limitMinutes : 80
    const usedPct = gate.limit ? (gate.used / gate.limit) * 100 : 0
    const hit = !!gate.limit && usedPct >= pctLimit
    const key = `cota|${qr.id}|${monthKey(now)}`
    const last = await db.alert.findFirst({ where: { organizationId: orgId, groupKey: key }, orderBy: { createdAt: 'desc' } })
    const lastOpen = last && OPEN_ALERT.includes(last.status) ? last : null
    const description = `${gate.used} de ${gate.limit ?? 0} conversas do mês já foram usadas (${Math.round(usedPct)}%). Acima do limite, as conversas novas são recebidas mas não analisadas até o mês virar ou o plano mudar.`
    const autoClose = groupAutoClose([qr])
    if (hit && lastOpen && autoClose != null && minutesBetween(lastOpen.lastOccurredAt ?? lastOpen.createdAt, now) >= autoClose) {
      // "encerrar sozinho": fecha pelo prazo; só volta se o uso cair abaixo do aviso e subir de novo
      await enqueueAlertEvent('alert.resolved', await db.alert.update({ where: { id: lastOpen.id }, data: { status: 'resolved', resolvedBy: 'timeout', dismissedReason: `Encerrado sozinho após ${autoClose} min (regra)` } }))
      summary.alertsResolved += 1
      summary.alertsAutoClosed = (summary.alertsAutoClosed ?? 0) + 1
    } else if (!hit && last && last.status === 'resolved' && last.resolvedBy === 'timeout') {
      await db.alert.update({ where: { id: last.id }, data: { resolvedBy: 'auto' } })
    } else if (hit && !lastOpen && !ruleOpensNow(qr.id)) {
      // fora dos dias e horários da regra: abre (ou reabre) quando a janela chegar
    } else if (hit && lastOpen) {
      if (lastOpen.description !== description) await db.alert.update({ where: { id: lastOpen.id }, data: { description, lastOccurredAt: now } })
    } else if (hit && last && last.status === 'resolved' && last.resolvedBy === 'auto') {
      await enqueueAlertEvent('alert.updated', await db.alert.update({ where: { id: last.id }, data: { status: 'new', resolvedBy: null, dismissedReason: null, occurrences: last.occurrences + 1, description, lastOccurredAt: now } }))
      summary.alertsRepeated = (summary.alertsRepeated ?? 0) + 1
    } else if (hit && !last) {
      const alert = await db.alert.create({
        data: { organizationId: orgId, ruleName: qr.name, severity: qr.severity, groupKey: key, title: `${qr.name}: ${Math.round(usedPct)}% das conversas do mês`, description, status: 'new', lastOccurredAt: now },
      })
      summary.alertsOpened += 1
      await enqueueAlertEvent('alert.created', alert)
      if (parseJson<string[]>(qr.notificationChannels, ['in_app']).includes('in_app')) {
        await db.notification.create({ data: { organizationId: orgId, type: 'alert', title: alert.title, message: description, data: JSON.stringify({ alertId: alert.id, severity: qr.severity }) } })
      }
      await queueAlertEmails(qr, alert)
    } else if (!hit && lastOpen) {
      await enqueueAlertEvent('alert.resolved', await db.alert.update({ where: { id: lastOpen.id }, data: { status: 'resolved', resolvedBy: 'auto' } }))
      summary.alertsResolved += 1
    }
  }

  // --- identidades (P5): contagens, sugestões (atendentes podem ter mudado) e conversas cuja sugestão trocou ---
  await refreshIdentityStats([...touchedIdentities])
  const resuggested = await refreshSuggestions(orgId, agents)
  await reattributeConversations(orgId, await conversationsOfIdentities(resuggested), { metrics: false })

  await recomputeMetrics(orgId, org.timezone, now)
  return summary
}
