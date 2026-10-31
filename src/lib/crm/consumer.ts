import { alertTaskKey } from './activities'
import type { CrmEventData } from './events'
import { addDealEvent, dealFromOpportunity, intentTitle, linkDeal, memberForAgent, openDealsOfConversation, opportunityOriginKey, RULE_VERSION, SYSTEM_ACTOR, type Tx } from './deals'
import { registerConsumer, type ConsumerResult, type OutboxRow } from './worker'

// Consumidor nativo do outbox (CRM-06; regras em docs/crm/05-sincronizacao.md §6).
// D2: por padrão tudo vira SUGESTÃO para uma pessoa revisar. Só com crm.autoCreateDeals ligada a oportunidade vira
// negócio sozinha. Nunca: marcar ganho, mover etapa, resolver alerta, mandar mensagem ou mexer em consentimento.
// Corre dentro da transação do worker (efeitos + inbox juntos), então cada evento tem efeito no máximo uma vez.

const SUGGESTION_TTL_DAYS = 14
const TASK_SEVERITIES = ['high', 'critical']
const OPEN_ALERT = ['new', 'acknowledged', 'in_progress'] // o mesmo do motor (analysis/engine.ts)

/** Etapa analítica do motor → posição no funil padrão (só para frente; "evaluation" e "post_sale" não movem). */
export const STAGE_TARGET_POSITION: Record<string, number> = {
  discovery: 0,
  qualification: 1,
  price: 2,
  negotiation: 3,
  decision: 3,
}

async function flagsOf(tx: Tx, organizationId: string) {
  const rows = await tx.crmFeatureState.findMany({ where: { organizationId }, select: { flag: true, enabled: true } })
  const on = (f: string) => rows.some((r) => r.flag === f && r.enabled)
  return { autoCreateDeals: on('crm.autoCreateDeals'), suggestStage: on('crm.suggestStage') }
}

async function suggest(
  tx: Tx,
  evt: OutboxRow,
  s: { kind: string; dedupeKey: string; reason: string; payload: Record<string, unknown>; dealId?: string | null; conversationId?: string | null; opportunityId?: string | null; alertId?: string | null; agentId?: string | null; ownerMemberId?: string | null },
): Promise<boolean> {
  const dedupeKey = `${evt.organizationId}:${s.dedupeKey}`
  const exists = await tx.crmSuggestion.findUnique({ where: { dedupeKey }, select: { id: true } })
  if (exists) return false
  await tx.crmSuggestion.create({
    data: {
      organizationId: evt.organizationId,
      kind: s.kind,
      dealId: s.dealId ?? null,
      conversationId: s.conversationId ?? null,
      opportunityId: s.opportunityId ?? null,
      alertId: s.alertId ?? null,
      agentId: s.agentId ?? null,
      ownerMemberId: s.ownerMemberId ?? null,
      payloadJson: JSON.stringify(s.payload),
      reason: s.reason,
      evidenceJson: JSON.stringify({ eventId: evt.id, eventType: evt.eventType, aggregateId: evt.aggregateId }),
      ruleVersion: RULE_VERSION,
      dedupeKey,
      expiresAt: new Date(Date.now() + SUGGESTION_TTL_DAYS * 86400_000),
    },
  })
  return true
}

const ignored = (why: string): ConsumerResult => ({ status: 'ignored', result: { why } })

async function onOpportunityDetected(tx: Tx, evt: OutboxRow, d: CrmEventData<'opportunity.detected'>): Promise<ConsumerResult> {
  if (d.status !== 'active') return ignored('opportunity_not_active')
  // a captura já pula excluído e grupo; isto cobre o evento que saiu antes (fila antiga, reprocessamento)
  const opp = await tx.revenueOpportunity.findFirst({
    where: { id: d.opportunityId, conversation: { organizationId: evt.organizationId } },
    select: { conversation: { select: { contact: { select: { excluded: true, isGroup: true } } } } },
  })
  if (!opp) return ignored('opportunity_missing')
  if (opp.conversation.contact?.excluded) return ignored('contact_excluded')
  if (opp.conversation.contact?.isGroup) return ignored('group')
  const existing = await tx.crmDeal.findUnique({ where: { originKey: opportunityOriginKey(evt.organizationId, d.opportunityId) }, select: { id: true } })
  if (existing) return ignored('deal_exists')
  const flags = await flagsOf(tx, evt.organizationId)
  if (flags.autoCreateDeals) {
    const { deal } = await dealFromOpportunity(tx, evt.organizationId, { kind: 'all' }, d.opportunityId, SYSTEM_ACTOR)
    return { status: 'processed', result: { dealId: deal.id, auto: true } }
  }
  const owner = await memberForAgent(tx, evt.organizationId, d.agentId)
  const created = await suggest(tx, evt, {
    kind: 'create_deal',
    dedupeKey: `create_deal:${d.opportunityId}`,
    reason: `Intenção comercial na conversa (${intentTitle(d.intent).toLowerCase()}), confiança de ${Math.round(d.confidence * 100)}%.`,
    payload: { title: intentTitle(d.intent), estimatedAmountCents: d.estimatedValueCents, confidence: d.confidence, intent: d.intent, estimateVersion: evt.aggregateVersion },
    conversationId: d.conversationId,
    opportunityId: d.opportunityId,
    agentId: d.agentId,
    ownerMemberId: owner,
  })
  return created ? { status: 'processed', result: { suggestion: 'create_deal' } } : ignored('suggestion_exists')
}

async function onEstimateChanged(tx: Tx, evt: OutboxRow, d: CrmEventData<'opportunity.estimate_changed'>): Promise<ConsumerResult> {
  const deal = await tx.crmDeal.findUnique({ where: { originKey: opportunityOriginKey(evt.organizationId, d.opportunityId) } })
  if (deal) {
    if (deal.status !== 'open') return ignored('deal_closed')
    const link = await tx.crmBusinessLink.findFirst({ where: { organizationId: evt.organizationId, dealId: deal.id, revenueOpportunityId: d.opportunityId } })
    // versão anterior chegando depois da atual: ignora (8.3)
    if (link?.sourceVersion && link.sourceVersion >= evt.aggregateVersion) return ignored('stale_version')
    // estimativa é campo do sistema: não muda a versão do negócio (não gera conflito com quem está editando)
    await tx.crmDeal.update({ where: { id: deal.id }, data: { estimatedAmountCents: d.estimatedValueCents, confidence: d.confidence } })
    if (link) await tx.crmBusinessLink.update({ where: { id: link.id }, data: { sourceVersion: evt.aggregateVersion } })
    return { status: 'processed', result: { dealId: deal.id } }
  }
  const pending = await tx.crmSuggestion.findFirst({ where: { organizationId: evt.organizationId, opportunityId: d.opportunityId, kind: 'create_deal', status: 'pending' } })
  if (!pending) return ignored('nothing_to_update')
  const payload = JSON.parse(pending.payloadJson) as Record<string, unknown>
  if (typeof payload.estimateVersion === 'number' && payload.estimateVersion >= evt.aggregateVersion) return ignored('stale_version')
  await tx.crmSuggestion.update({
    where: { id: pending.id },
    data: { payloadJson: JSON.stringify({ ...payload, estimatedAmountCents: d.estimatedValueCents, confidence: d.confidence, estimateVersion: evt.aggregateVersion }) },
  })
  return { status: 'processed', result: { suggestionId: pending.id } }
}

async function onStageInferred(tx: Tx, evt: OutboxRow, d: CrmEventData<'conversation.stage_inferred'>): Promise<ConsumerResult> {
  const target = STAGE_TARGET_POSITION[d.inferredStage]
  if (target === undefined) return ignored('stage_not_mapped')
  if (!(await flagsOf(tx, evt.organizationId)).suggestStage) return ignored('suggest_stage_off')
  let n = 0
  for (const deal of await openDealsOfConversation(tx, evt.organizationId, d.conversationId)) {
    if (deal.stage.position >= target) continue // só para frente
    const stage = await tx.crmStage.findFirst({ where: { pipelineId: deal.pipelineId, status: 'active', position: target } })
    if (!stage) continue
    const ok = await suggest(tx, evt, {
      kind: 'move_stage',
      dedupeKey: `move_stage:${deal.id}:${stage.id}`,
      reason: `A conversa avançou para "${d.inferredStage}" na análise. Sugestão: mover para "${stage.name}".${deal.stageLockedByHuman ? ' A etapa foi escolhida por uma pessoa e só muda se alguém aceitar.' : ''}`,
      payload: { stageId: stage.id, stageName: stage.name, fromStageId: deal.stageId, inferredStage: d.inferredStage },
      dealId: deal.id,
      conversationId: d.conversationId,
      agentId: d.agentId,
      ownerMemberId: deal.ownerMemberId,
    })
    if (ok) n++
  }
  return n ? { status: 'processed', result: { suggestions: n } } : ignored('no_open_deal_to_advance')
}

async function onOutcome(tx: Tx, evt: OutboxRow, d: CrmEventData<'outcome.detected'>): Promise<ConsumerResult> {
  const outcome = d.outcome === 'sale_confirmed' ? 'won' : 'lost'
  let n = 0
  for (const deal of await openDealsOfConversation(tx, evt.organizationId, d.conversationId)) {
    const ok = await suggest(tx, evt, {
      kind: 'confirm_outcome',
      dedupeKey: `confirm_outcome:${deal.id}:${outcome}`,
      reason: outcome === 'won' ? 'A conversa indica venda fechada. Confirme o ganho e o valor.' : 'A conversa indica que o cliente desistiu. Confirme a perda e o motivo.',
      payload: { outcome, confirmedValueCents: d.confirmedValueCents },
      dealId: deal.id,
      conversationId: d.conversationId,
      agentId: d.agentId,
      ownerMemberId: deal.ownerMemberId,
    })
    if (ok) n++
  }
  // negócio já fechado com desfecho diferente: a pessoa vence; só registra a divergência para revisão (8.4)
  const links = await tx.crmBusinessLink.findMany({ where: { organizationId: evt.organizationId, conversationId: d.conversationId }, select: { dealId: true } })
  if (links.length) {
    const closed = await tx.crmDeal.findMany({ where: { id: { in: links.map((l) => l.dealId) }, status: { in: ['won', 'lost'] } } })
    for (const deal of closed) {
      if (deal.status === outcome) continue
      // uma divergência por fechamento (a versão muda quando alguém reabre e fecha de novo)
      const noted = await tx.crmDealEvent.findFirst({ where: { dealId: deal.id, type: 'divergence', dealVersion: deal.version }, select: { id: true } })
      if (!noted) await addDealEvent(tx, deal, 'divergence', SYSTEM_ACTOR, { data: { detected: outcome, kept: deal.status, ruleVersion: RULE_VERSION } })
    }
  }
  if (outcome === 'lost') {
    await tx.crmSuggestion.updateMany({ where: { organizationId: evt.organizationId, conversationId: d.conversationId, kind: 'create_deal', status: 'pending' }, data: { status: 'expired', decisionNote: 'Cliente desistiu na conversa' } })
  }
  return { status: 'processed', result: { suggestions: n } }
}

async function onAlertCreated(tx: Tx, evt: OutboxRow, d: CrmEventData<'alert.created'>): Promise<ConsumerResult> {
  if (!d.conversationId || !TASK_SEVERITIES.includes(d.severity)) return ignored('alert_not_eligible')
  // "criado" e "resolvido" são eventos diferentes do mesmo alerta: o "criado" que chega depois (reprocessamento) vale
  // pelo estado de agora na Auditoria
  const alert = await tx.alert.findFirst({ where: { id: d.alertId, organizationId: evt.organizationId }, select: { status: true, groupKey: true } })
  if (!alert || !OPEN_ALERT.includes(alert.status)) return ignored('alert_closed')
  // mesma causa já com tarefa aberta ou sugestão pendente (T05.07): o alerta que volta depois de resolvido por uma pessoa
  // é uma linha nova com o mesmo groupKey (tipo + conversa) e não pede outra tarefa enquanto a anterior estiver aberta
  const cause = alert.groupKey
    ? await tx.alert.findMany({ where: { organizationId: evt.organizationId, groupKey: alert.groupKey }, select: { id: true, status: true } })
    : [{ id: d.alertId, status: alert.status }]
  const taskOpen = await tx.crmActivity.count({ where: { organizationId: evt.organizationId, dedupeKey: { in: cause.map((a) => alertTaskKey(evt.organizationId, a.id)) } } })
  if (taskOpen) return ignored('task_open_for_cause')
  // só conta a sugestão que ainda vale: a de um alerta fechado (falso positivo, resolvido com o evento atrasado) ou já
  // vencida não segura a causa
  const now = new Date()
  const live = { kind: 'create_task', status: 'pending', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
  const otherOpen = cause.filter((a) => a.id !== d.alertId && OPEN_ALERT.includes(a.status)).map((a) => a.id)
  if (otherOpen.length && (await tx.crmSuggestion.count({ where: { organizationId: evt.organizationId, alertId: { in: otherOpen }, ...live } }))) {
    return ignored('suggestion_open_for_cause')
  }
  let n = 0
  let held = 0
  for (const deal of await openDealsOfConversation(tx, evt.organizationId, d.conversationId)) {
    // a chave leva a ocorrência: o mesmo alerta reaberto pelo motor (ou repetido depois da tarefa concluída) pode pedir
    // de novo. Não pede enquanto houver sugestão valendo para ele e o negócio, nem depois de uma pessoa recusar
    const before = await tx.crmSuggestion.count({
      where: { organizationId: evt.organizationId, alertId: d.alertId, dealId: deal.id, kind: 'create_task', OR: [{ status: 'dismissed' }, live] },
    })
    if (before) {
      held++
      continue
    }
    const ok = await suggest(tx, evt, {
      kind: 'create_task',
      dedupeKey: `create_task:alert:${d.alertId}:${deal.id}:${evt.aggregateVersion}`,
      reason: 'Alerta de atendimento numa conversa com negócio aberto. Sugestão: criar uma tarefa de retorno.',
      payload: { type: 'follow_up', title: 'Retornar ao cliente', priority: d.severity === 'critical' ? 'high' : 'normal', dueInHours: 4, alertType: d.type },
      dealId: deal.id,
      conversationId: d.conversationId,
      alertId: d.alertId,
      agentId: d.agentId,
      ownerMemberId: deal.ownerMemberId,
    })
    if (ok) n++
    else held++
  }
  return n ? { status: 'processed', result: { suggestions: n } } : ignored(held ? 'suggestion_exists' : 'no_open_deal')
}

async function onAlertResolved(tx: Tx, evt: OutboxRow, d: CrmEventData<'alert.resolved'>): Promise<ConsumerResult> {
  // o alerta resolvido tira a sugestão de tarefa ainda não decidida; tarefa já criada continua (decisão de uma pessoa)
  const r = await tx.crmSuggestion.updateMany({ where: { organizationId: evt.organizationId, alertId: d.alertId, status: 'pending' }, data: { status: 'expired', decisionNote: 'Alerta resolvido' } })
  return r.count ? { status: 'processed', result: { expired: r.count } } : ignored('nothing_pending')
}

async function onRecovery(tx: Tx, evt: OutboxRow, d: CrmEventData<'recovery.completed'>): Promise<ConsumerResult> {
  if (!d.conversationId) return ignored('no_conversation')
  let n = 0
  for (const deal of await openDealsOfConversation(tx, evt.organizationId, d.conversationId)) {
    // evento reprocessado (fila limpa depois de 30 dias, releitura) não repete o histórico
    if (!(await linkDeal(tx, evt.organizationId, deal.id, 'recovery', { recoveryItemId: d.recoveryItemId, conversationId: d.conversationId }, { sourceEventId: evt.id }))) continue
    await addDealEvent(tx, deal, 'recovery_completed', SYSTEM_ACTOR, { data: { result: d.result } })
    // recuperado não é venda comprovada (CRM-07): só a venda confirmada vira sugestão de ganho
    if (d.result === 'sale_confirmed') {
      await suggest(tx, evt, {
        kind: 'confirm_outcome',
        dedupeKey: `confirm_outcome:${deal.id}:won`,
        reason: 'A recuperação foi concluída com venda. Confirme o ganho e o valor.',
        payload: { outcome: 'won', confirmedValueCents: null },
        dealId: deal.id,
        conversationId: d.conversationId,
        ownerMemberId: deal.ownerMemberId,
      })
    }
    n++
  }
  return n ? { status: 'processed', result: { deals: n } } : ignored('no_open_deal')
}

async function onPrivacy(tx: Tx, evt: OutboxRow, d: CrmEventData<'contact.privacy_changed'>): Promise<ConsumerResult> {
  if (!d.excluded) return ignored('not_excluded')
  // contato excluído do monitoramento: some das sugestões e o vínculo com a pessoa comercial fica marcado como removido.
  // A pessoa e os negócios criados por gente continuam (dado comercial da empresa); quem apaga é a pessoa, pela tela.
  const convs = await tx.conversation.findMany({ where: { organizationId: evt.organizationId, contactId: d.contactId }, select: { id: true } })
  const ids = convs.map((c) => c.id)
  const r = ids.length
    ? await tx.crmSuggestion.updateMany({ where: { organizationId: evt.organizationId, conversationId: { in: ids }, status: 'pending' }, data: { status: 'expired', decisionNote: 'Contato excluído do monitoramento' } })
    : { count: 0 }
  await tx.crmIdentityLink.updateMany({ where: { organizationId: evt.organizationId, entityType: 'contact', sourceId: d.contactId }, data: { tombstone: true } })
  return { status: 'processed', result: { expired: r.count } }
}

export async function nativeConsumer(tx: Tx, evt: OutboxRow, data: unknown): Promise<ConsumerResult> {
  switch (evt.eventType) {
    case 'opportunity.detected':
      return onOpportunityDetected(tx, evt, data as CrmEventData<'opportunity.detected'>)
    case 'opportunity.estimate_changed':
      return onEstimateChanged(tx, evt, data as CrmEventData<'opportunity.estimate_changed'>)
    case 'conversation.stage_inferred':
      return onStageInferred(tx, evt, data as CrmEventData<'conversation.stage_inferred'>)
    case 'outcome.detected':
      return onOutcome(tx, evt, data as CrmEventData<'outcome.detected'>)
    case 'alert.created':
      return onAlertCreated(tx, evt, data as CrmEventData<'alert.created'>)
    case 'alert.resolved':
      return onAlertResolved(tx, evt, data as CrmEventData<'alert.resolved'>)
    case 'recovery.completed':
      return onRecovery(tx, evt, data as CrmEventData<'recovery.completed'>)
    case 'contact.privacy_changed':
      return onPrivacy(tx, evt, data as CrmEventData<'contact.privacy_changed'>)
    default:
      return ignored('unhandled_type')
  }
}

registerConsumer('native', nativeConsumer)
