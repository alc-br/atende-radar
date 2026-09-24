import { db } from '../db'
import { classifyMessages, type AnalysisMessage } from './classify'
import { extractPromise } from './promises'
import { attributeAgent } from './agents'
import { scoreConversation } from './score'
import { estimateOpportunity } from './opportunity'
import { recomputeMetrics } from './metrics'

// Só conversas que vieram do WhatsApp de verdade (têm mensagem com externalId) entram no motor.
// Dados de demonstração/seed ficam intocados.
const REAL = { messages: { some: { externalId: { not: null } } } }
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
}
const RECOVERY_RULES = ['pending_quote', 'high_intent_no_reply', 'no_response', 'no_response_followup']

export interface AnalysisSummary {
  organizations: number
  conversations: number
  alertsOpened: number
  alertsResolved: number
}

const parseJson = <T,>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}
const minutesBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000)

/** Roda o motor em todas as organizações com conversas reais ou conexões. */
export async function analyzeAll(now = new Date()): Promise<AnalysisSummary> {
  // A organização de demonstração fica de fora: seus dados são fixos e não devem gerar alertas nem mudar sozinhos.
  // Inclui organizações que só têm conexões (a conexão pode cair antes da primeira mensagem)
  const orgs = await db.organization.findMany({ where: { status: 'active', id: { not: process.env.DEMO_ORG_ID || 'org_seed_1' }, OR: [{ conversations: { some: REAL } }, { connections: { some: {} } }] }, select: { id: true } })
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
  if (!org) return summary
  const [rules, agents, connections] = await Promise.all([
    db.alertRule.findMany({ where: { organizationId: orgId, active: true } }),
    db.agent.findMany({ where: { organizationId: orgId, status: 'active' } }),
    db.whatsAppConnection.findMany({ where: { organizationId: orgId } }),
  ])

  const settings = parseJson<{ financeiro?: { avgTicket?: string | number; convRate?: string | number } }>(org.settingsJson, {})
  const avgTicket = Number(settings.financeiro?.avgTicket) > 0 ? Number(settings.financeiro?.avgTicket) : 1500
  const convRateRaw = Number(settings.financeiro?.convRate)
  const conversionRate = convRateRaw > 0 ? (convRateRaw > 1 ? convRateRaw / 100 : convRateRaw) : 0.18

  const since = new Date(now.getTime() - 30 * 86400000)
  const conversations = await db.conversation.findMany({
    where: { organizationId: orgId, ...REAL, OR: [{ closedAt: null }, { updatedAt: { gte: since } }] },
    include: { contact: true, agent: true, messages: { orderBy: { occurredAt: 'asc' } } },
  })
  const convIds = conversations.map((c) => c.id)

  const [promises, feedbacks, opportunities, openAlerts, recoveries, classifications] = await Promise.all([
    db.promise.findMany({ where: { conversationId: { in: convIds } } }),
    db.classificationFeedback.findMany({ where: { organizationId: orgId, targetId: { in: convIds } } }),
    db.revenueOpportunity.findMany({ where: { conversationId: { in: convIds } } }),
    db.alert.findMany({ where: { organizationId: orgId, status: { in: OPEN_ALERT } } }),
    db.recoveryItem.findMany({ where: { organizationId: orgId, conversationId: { in: convIds } } }),
    db.conversationClassification.findMany({ where: { conversationId: { in: convIds } } }),
  ])
  const openAlertByKey = new Map(openAlerts.map((a) => [`${a.ruleName}|${a.conversationId ?? ''}`, a]))

  for (const conv of conversations) {
    summary.conversations += 1
    const msgs = conv.messages
    const analysisMsgs: AnalysisMessage[] = msgs.map((m) => ({ direction: m.direction === 'inbound' ? 'inbound' : 'outbound', text: m.text, occurredAt: m.occurredAt }))
    const fb = new Set(feedbacks.filter((f) => f.targetId === conv.id).map((f) => f.targetType))

    // --- atendente pela assinatura (não sobrescreve escolha manual) ---
    let agentId = conv.agentId
    if (!agentId && !fb.has('agent')) {
      for (const m of msgs) {
        if (m.direction !== 'outbound') continue
        const id = attributeAgent(m.text, agents)
        if (id) {
          agentId = id
          break
        }
      }
    }
    const agent = agents.find((a) => a.id === agentId) ?? conv.agent

    // --- classificação (respeita correções manuais) ---
    const cls = classifyMessages(analysisMsgs)
    const intent = fb.has('intent') ? conv.primaryIntent : cls.intent
    const sentiment = fb.has('sentiment') ? conv.sentiment : cls.sentiment
    const urgency = fb.has('urgency') ? conv.urgency : cls.urgency
    const stage = fb.has('stage') ? conv.inferredStage : cls.stage

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

    // --- tempos ---
    const firstIn = msgs.find((m) => m.direction === 'inbound')
    const firstOutAfter = firstIn ? msgs.find((m) => m.direction === 'outbound' && m.occurredAt > firstIn.occurredAt) : undefined
    const firstResponseMinutes = firstIn && firstOutAfter ? minutesBetween(firstIn.occurredAt, firstOutAfter.occurredAt) : null
    const hasAnyOutbound = msgs.some((m) => m.direction === 'outbound')
    const waitingCompany = conv.operationalStatus === 'waiting_company'
    const waitingMinutes = waitingCompany && conv.waitingSince ? minutesBetween(conv.waitingSince, now) : 0
    const closed = conv.closedAt != null || CLOSED_OUTCOMES.includes(conv.operationalStatus)

    // --- oportunidade ---
    const est = estimateOpportunity(intent, avgTicket, conversionRate)
    const opp = opportunities.find((o) => o.conversationId === conv.id)
    let oppId = opp?.id
    if (est && !opp && !closed) {
      const created = await db.revenueOpportunity.create({
        data: {
          conversationId: conv.id, status: 'active', baseTicket: est.baseTicket, ticketSource: 'org_setting', probability: est.probability,
          probabilitySource: 'org_setting', intentFactor: est.intentFactor, expectedValue: est.expectedValue, rangeLow: est.rangeLow, rangeHigh: est.rangeHigh, confidence: cls.confidence,
        },
      })
      oppId = created.id
      opportunities.push(created)
    } else if (est && opp && opp.status === 'active') {
      if (opp.expectedValue !== est.expectedValue || opp.baseTicket !== est.baseTicket) {
        await db.revenueOpportunity.update({
          where: { id: opp.id },
          data: { baseTicket: est.baseTicket, probability: est.probability, intentFactor: est.intentFactor, expectedValue: est.expectedValue, rangeLow: est.rangeLow, rangeHigh: est.rangeHigh, confidence: cls.confidence },
        })
      }
    }
    const potentialValue = est && !closed ? est.expectedValue : opp?.expectedValue ?? 0
    const hasOpportunity = !!est || !!opp

    // --- nota e risco ---
    const recovered = recoveries.some((r) => r.conversationId === conv.id && r.status === 'recovered')
    const score = scoreConversation({ firstResponseMinutes, waitingMinutes, hasOpportunity, sentiment, messages: msgs.length, unansweredPromises: overdueOpen, recovered })
    const waitFactor = Math.min(1, waitingMinutes / 120)
    const urgencyFactor = ({ low: 0, normal: 0.3, high: 0.7, critical: 1 } as Record<string, number>)[urgency] ?? 0.3
    const riskScore = closed ? 0 : +Math.min(1, 0.4 * waitFactor + 0.3 * urgencyFactor + 0.2 * (hasOpportunity ? 1 : 0) + 0.1 * (sentiment === 'frustrated' ? 1 : 0)).toFixed(2)

    await db.conversation.update({
      where: { id: conv.id },
      data: {
        agentId: agentId ?? undefined,
        primaryIntent: intent,
        inferredStage: stage,
        urgency,
        sentiment,
        confidence: cls.confidence,
        score: score.total,
        riskScore,
        potentialValue,
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

    for (const rule of rules) {
      const key = `${rule.name}|${conv.id}`
      const limit = rule.limitMinutes ?? 0
      const scopeConns = parseJson<string[]>(rule.scopeConnections, [])
      const scopeTeams = parseJson<string[]>(rule.scopeTeams, [])
      const inScope = (scopeConns.length === 0 || (conv.connectionId != null && scopeConns.includes(conv.connectionId))) && (scopeTeams.length === 0 || (agent?.team != null && scopeTeams.includes(agent.team)))
      const conf = cls.confidence

      let triggered = false
      switch (rule.type) {
        case 'no_response': triggered = waitingCompany && !hasAnyOutbound && waitingMinutes >= limit; break
        case 'no_response_followup': triggered = waitingCompany && hasAnyOutbound && waitingMinutes >= limit; break
        case 'pending_quote': triggered = waitingCompany && intent === 'preco' && waitingMinutes >= limit && conf >= rule.minConfidence; break
        case 'high_intent_no_reply': triggered = waitingCompany && ['compra', 'agendamento', 'negociacao'].includes(intent ?? '') && waitingMinutes >= limit && conf >= rule.minConfidence; break
        case 'customer_frustrated': triggered = waitingCompany && sentiment === 'frustrated' && waitingMinutes >= limit; break
        case 'promise_overdue': triggered = overdueOpen > 0; break
        case 'promise_approaching': triggered = approachingOpen > 0 && convPromises.some((p) => p.status === 'open' && p.dueAt && p.dueAt >= now && minutesBetween(now, p.dueAt) <= limit); break
        default: triggered = false
      }
      triggered = triggered && inScope && !closed

      const existing = openAlertByKey.get(key)
      if (triggered && !existing) {
        // Decisão humana respeitada: alerta dispensado/falso positivo não reabre dentro do intervalo da regra.
        const dismissed = await db.alert.findFirst({
          where: { organizationId: orgId, ruleName: rule.name, conversationId: conv.id, status: { in: ['dismissed', 'false_positive'] }, updatedAt: { gte: new Date(now.getTime() - rule.cooldownMinutes * 60000) } },
        })
        if (dismissed) continue

        const finding = FINDING_TYPE[rule.type]
          ? await db.auditFinding.create({
              data: { conversationId: conv.id, type: FINDING_TYPE[rule.type], severity: rule.severity, status: 'new', detectedAt: now, evidence, confidence: conf, assignedTo: agent?.name ?? null },
            })
          : null
        const alert = await db.alert.create({
          data: {
            organizationId: orgId, conversationId: conv.id, findingId: finding?.id, ruleName: rule.name, severity: rule.severity,
            title: `${rule.name}: ${customerName}`, description: evidence, customerName, agentName: agent?.name ?? null,
            status: 'new', potentialValue: potentialValue || null, confidence: conf,
          },
        })
        summary.alertsOpened += 1
        const channels = parseJson<string[]>(rule.notificationChannels, ['in_app'])
        if (channels.includes('in_app')) {
          await db.notification.create({
            data: { organizationId: orgId, type: 'alert', title: alert.title, message: evidence, data: JSON.stringify({ alertId: alert.id, conversationId: conv.id, severity: rule.severity }) },
          })
        }
        if (RECOVERY_RULES.includes(rule.type) && hasOpportunity && !recoveries.some((r) => r.conversationId === conv.id && ['new', 'in_progress', 'assigned'].includes(r.status))) {
          const item = await db.recoveryItem.create({
            data: {
              organizationId: orgId, conversationId: conv.id, opportunityId: oppId, agentId: agentId ?? null, reason: rule.name, priorityScore: riskScore,
              dueAt: new Date(now.getTime() + 2 * 3600000), status: 'new', customerName, originalAgentName: agent?.name ?? null,
            },
          })
          recoveries.push(item)
        }
      } else if (!triggered && existing) {
        await db.alert.update({ where: { id: existing.id }, data: { status: 'resolved' } })
        if (existing.findingId) {
          await db.auditFinding.updateMany({ where: { id: existing.findingId, status: { not: 'resolved' } }, data: { status: 'resolved', resolvedAt: now, resolutionReason: 'Resolvido automaticamente' } })
        }
        summary.alertsResolved += 1
      }
    }
  }

  // --- alertas de conexão (sem conversa) ---
  const connRule = rules.find((r) => r.type === 'connection_down')
  if (connRule) {
    for (const c of connections) {
      const down = (c.status === 'disconnected' || (c.status === 'qr_required' && c.pairedAt != null)) && c.disabledAt == null
      const existing = openAlerts.find((a) => a.ruleName === connRule.name && a.conversationId == null && a.title.endsWith(`: ${c.name}`))
      if (down && !existing) {
        const alert = await db.alert.create({
          data: { organizationId: orgId, ruleName: connRule.name, severity: connRule.severity, title: `${connRule.name}: ${c.name}`, description: `A conexão "${c.name}" (final ${c.phoneLast4}) está fora do ar${c.statusReason ? ` (${c.statusReason})` : ''}.`, agentName: null, status: 'new' },
        })
        summary.alertsOpened += 1
        if (parseJson<string[]>(connRule.notificationChannels, ['in_app']).includes('in_app')) {
          await db.notification.create({ data: { organizationId: orgId, type: 'alert', title: alert.title, message: alert.description, data: JSON.stringify({ alertId: alert.id, severity: connRule.severity }) } })
        }
      } else if (!down && existing) {
        await db.alert.update({ where: { id: existing.id }, data: { status: 'resolved' } })
        summary.alertsResolved += 1
      }
    }
  }

  await recomputeMetrics(orgId, org.timezone, now)
  return summary
}
