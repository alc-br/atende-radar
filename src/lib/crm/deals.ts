import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { can, type Permission } from '@/lib/permissions'
import type { CrmErrorCode } from './http'
import { reopenReasonError } from './labels'
import { reaisToCents } from './money'
import { dealScopeWhere, ownerInScope, type OwnerScope } from './scope'
import { normName } from './text'

// Regras do negócio comercial (CRM-02, CRM-03, CRM-07), num lugar só: a API, o aceite de sugestão e o consumidor do
// outbox chamam estas funções. Cada mudança grava CrmDealEvent (histórico imutável) na mesma transação.
//  - versão otimista: update condicional em { id, version }; versão velha = 409 crm_version_conflict;
//  - negócio fechado não muda de etapa, não fecha de novo e não é reaberto pelo sistema;
//  - etapa movida por pessoa fica marcada (stageLockedByHuman): o sistema só sugere, nunca move por cima;
//  - estimativa (RevenueOpportunity) vai para estimatedAmountCents, nunca para amountCents.

export type Tx = Prisma.TransactionClient

export interface Actor {
  memberId: string | null
  label: string | null
  origin: 'manual' | 'system' | 'suggested'
}

export const SYSTEM_ACTOR: Actor = { memberId: null, label: 'AtendeRadar', origin: 'system' }
/** Versão das regras automáticas (vai na sugestão e no histórico: auditoria da decisão automatizada). */
export const RULE_VERSION = 'crm-rules-1'

export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: CrmErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const notFound = (what: string) => new DomainError(404, 'crm_not_found', `${what} não encontrado.`)
const conflict = (version: number) =>
  new DomainError(409, 'crm_version_conflict', 'Este registro foi alterado por outra pessoa. Recarregue e tente de novo.', { currentVersion: version })
const invalid = (msg: string) => new DomainError(409, 'crm_invalid_transition', msg)

const RETRYABLE = /SQLITE_BUSY|database is locked|P2034/

/** Transação curta com nova tentativa em disputa de escrita do SQLite (e, se pedido, em chave única recém-criada). */
export async function crmTx<T>(fn: (tx: Tx) => Promise<T>, opts: { retryUnique?: boolean } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { timeout: 15_000, maxWait: 5_000 })
    } catch (e) {
      const unique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      const busy = RETRYABLE.test(e instanceof Error ? e.message : '') || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034')
      if (attempt < 2 && (busy || (unique && opts.retryUnique))) continue
      throw e
    }
  }
}

export async function addDealEvent(
  tx: Tx,
  deal: { id: string; organizationId: string; version: number },
  type: string,
  actor: Actor,
  extra: { fromStageId?: string | null; toStageId?: string | null; data?: Record<string, unknown> } = {},
) {
  await tx.crmDealEvent.create({
    data: {
      organizationId: deal.organizationId,
      dealId: deal.id,
      type,
      fromStageId: extra.fromStageId ?? null,
      toStageId: extra.toStageId ?? null,
      origin: actor.origin,
      actorMemberId: actor.memberId,
      actorLabel: actor.label,
      dataJson: extra.data ? JSON.stringify(extra.data).slice(0, 2000) : null,
      dealVersion: deal.version,
    },
  })
}

/** Funil e etapa válidos da empresa (etapa informada, ou a primeira etapa ativa do funil informado/padrão). */
export async function resolveStage(tx: Tx, organizationId: string, pipelineId?: string | null, stageId?: string | null) {
  if (stageId) {
    const stage = await tx.crmStage.findFirst({ where: { id: stageId, organizationId, status: 'active', pipeline: { status: 'active' } } })
    if (!stage || (pipelineId && stage.pipelineId !== pipelineId)) throw invalid('Etapa inválida para este funil.')
    return stage
  }
  const pipeline = pipelineId
    ? await tx.crmPipeline.findFirst({ where: { id: pipelineId, organizationId, status: 'active' } })
    : await tx.crmPipeline.findFirst({ where: { organizationId, status: 'active' }, orderBy: [{ isDefault: 'desc' }, { position: 'asc' }] })
  if (!pipeline) throw invalid('Nenhum funil ativo. Crie um funil em Configurações › CRM.')
  const stage = await tx.crmStage.findFirst({ where: { pipelineId: pipeline.id, status: 'active' }, orderBy: { position: 'asc' } })
  if (!stage) throw invalid('O funil não tem etapa ativa.')
  return stage
}

const OWNER_NO_ACCESS: Partial<Record<Permission, string>> = {
  'crm.activities.view': 'Esta pessoa não vê as tarefas do CRM. Escolha outro responsável.',
}

/**
 * Responsável precisa ser membro ativo da empresa e estar no escopo de quem atribui. Com `permission`, a função dele
 * também precisa dar esse acesso (tarefa entregue a quem não abre a tela Tarefas sumiria da operação).
 */
export async function checkOwner(tx: Tx, organizationId: string, scope: OwnerScope, ownerMemberId: string | null | undefined, permission?: Permission) {
  if (!ownerMemberId) {
    if (scope.kind === 'own') throw new DomainError(403, 'crm_forbidden', 'Você só pode atribuir a você mesmo.')
    return
  }
  if (!ownerInScope(scope, ownerMemberId)) {
    throw new DomainError(403, 'crm_forbidden', scope.kind === 'own' ? 'Você só pode atribuir a você mesmo.' : 'Responsável fora da sua equipe.')
  }
  const m = await tx.organizationMember.findFirst({ where: { id: ownerMemberId, organizationId, status: 'active' }, select: { id: true, role: true } })
  if (!m) throw new DomainError(400, 'crm_invalid', 'Responsável não encontrado.')
  if (permission && !can(m.role, permission)) {
    throw new DomainError(400, 'crm_invalid', OWNER_NO_ACCESS[permission] ?? 'Esta pessoa não tem acesso ao CRM. Escolha outro responsável.')
  }
}

async function checkRefs(tx: Tx, organizationId: string, personId?: string | null, companyId?: string | null) {
  if (personId) {
    const p = await tx.crmPerson.findFirst({ where: { id: personId, organizationId, status: 'active' }, select: { id: true } })
    if (!p) throw new DomainError(400, 'crm_invalid', 'Pessoa não encontrada.')
  }
  if (companyId) {
    const c = await tx.crmCompany.findFirst({ where: { id: companyId, organizationId, status: 'active' }, select: { id: true } })
    if (!c) throw new DomainError(400, 'crm_invalid', 'Empresa não encontrada.')
  }
}

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v))

export interface DealInput {
  title: string
  pipelineId?: string
  stageId?: string
  personId?: string | null
  companyId?: string | null
  ownerMemberId?: string | null
  amountCents?: number | null
  priority?: string
  expectedCloseAt?: string | null
  nextAction?: string | null
  nextActionAt?: string | null
}

export interface DealOrigin {
  source: string
  sourceId?: string | null
  originKey?: string | null
  estimatedAmountCents?: number | null
  confidence?: number | null
}

export async function createDeal(tx: Tx, organizationId: string, scope: OwnerScope, input: DealInput, actor: Actor, origin: DealOrigin = { source: 'manual' }) {
  const owner = input.ownerMemberId === undefined && scope.kind === 'own' ? scope.memberId : input.ownerMemberId ?? null
  await checkOwner(tx, organizationId, scope, owner)
  await checkRefs(tx, organizationId, input.personId, input.companyId)
  const stage = await resolveStage(tx, organizationId, input.pipelineId, input.stageId)
  const hasAmount = input.amountCents !== null && input.amountCents !== undefined
  const deal = await tx.crmDeal.create({
    data: {
      organizationId,
      pipelineId: stage.pipelineId,
      stageId: stage.id,
      title: input.title.trim(),
      personId: input.personId ?? null,
      companyId: input.companyId ?? null,
      ownerMemberId: owner,
      source: origin.source,
      sourceId: origin.sourceId ?? null,
      originKey: origin.originKey ?? null,
      amountCents: hasAmount ? input.amountCents : null,
      amountSource: hasAmount ? 'manual' : 'unknown',
      estimatedAmountCents: origin.estimatedAmountCents ?? null,
      confidence: origin.confidence ?? null,
      probability: stage.probability,
      priority: input.priority ?? 'normal',
      expectedCloseAt: toDate(input.expectedCloseAt) ?? null,
      nextAction: input.nextAction ?? null,
      nextActionAt: toDate(input.nextActionAt) ?? null,
      createdBy: actor.memberId,
    },
  })
  await addDealEvent(tx, deal, 'created', actor, { toStageId: stage.id, data: { source: origin.source, ...(actor.origin !== 'manual' ? { ruleVersion: RULE_VERSION } : {}) } })
  return deal
}

/** Negócio da empresa e do escopo de quem pede; fora do escopo é 404, igual a inexistente. */
export async function loadDeal(tx: Tx, organizationId: string, scope: OwnerScope, id: string, version?: number) {
  const deal = await tx.crmDeal.findFirst({ where: { id, ...dealScopeWhere(organizationId, scope) } })
  if (!deal) throw notFound('Negócio')
  if (version !== undefined && deal.version !== version) throw conflict(deal.version)
  return deal
}

/** update condicional pela versão: se outra escrita passou na frente, 409 (sem sobrescrever). */
async function bump(tx: Tx, deal: { id: string; version: number }, data: Prisma.CrmDealUpdateManyMutationInput) {
  const r = await tx.crmDeal.updateMany({ where: { id: deal.id, version: deal.version }, data: { ...data, version: { increment: 1 } } })
  if (!r.count) {
    const cur = await tx.crmDeal.findUnique({ where: { id: deal.id }, select: { version: true } })
    throw conflict(cur?.version ?? deal.version)
  }
  return tx.crmDeal.findUniqueOrThrow({ where: { id: deal.id } })
}

export type DealPatch = Partial<Omit<DealInput, 'pipelineId' | 'stageId'>> & { version: number }

export async function updateDeal(tx: Tx, organizationId: string, scope: OwnerScope, id: string, patch: DealPatch, actor: Actor) {
  const deal = await loadDeal(tx, organizationId, scope, id, patch.version)
  if (deal.status === 'archived') throw invalid('Negócio arquivado não pode ser editado.')
  if (patch.ownerMemberId !== undefined && patch.ownerMemberId !== deal.ownerMemberId) {
    if (scope.kind === 'own') throw new DomainError(403, 'crm_forbidden', 'Só o supervisor ou o gestor troca o responsável.')
    await checkOwner(tx, organizationId, scope, patch.ownerMemberId)
  }
  await checkRefs(tx, organizationId, patch.personId, patch.companyId)
  const data: Prisma.CrmDealUpdateManyMutationInput & { personId?: string | null; companyId?: string | null } = {}
  if (patch.title !== undefined) data.title = patch.title.trim()
  if (patch.personId !== undefined) data.personId = patch.personId
  if (patch.companyId !== undefined) data.companyId = patch.companyId
  if (patch.ownerMemberId !== undefined) data.ownerMemberId = patch.ownerMemberId
  if (patch.amountCents !== undefined) {
    data.amountCents = patch.amountCents
    data.amountSource = patch.amountCents === null ? 'unknown' : 'manual'
  }
  if (patch.priority !== undefined) data.priority = patch.priority
  if (patch.expectedCloseAt !== undefined) data.expectedCloseAt = toDate(patch.expectedCloseAt)
  if (patch.nextAction !== undefined) data.nextAction = patch.nextAction
  if (patch.nextActionAt !== undefined) data.nextActionAt = toDate(patch.nextActionAt)
  const changed = Object.keys(data)
  if (!changed.length) return deal
  const updated = await bump(tx, deal, data as Prisma.CrmDealUpdateManyMutationInput)
  const assigned = patch.ownerMemberId !== undefined && patch.ownerMemberId !== deal.ownerMemberId
  await addDealEvent(tx, updated, assigned ? 'assigned' : 'updated', actor, {
    data: { fields: changed, ...(assigned ? { from: deal.ownerMemberId, to: patch.ownerMemberId } : {}) },
  })
  return updated
}

export async function moveDealStage(tx: Tx, organizationId: string, scope: OwnerScope, id: string, stageId: string, version: number, actor: Actor) {
  const deal = await loadDeal(tx, organizationId, scope, id, version)
  if (deal.status !== 'open') throw invalid('Negócio fechado não muda de etapa. Reabra antes.')
  const stage = await tx.crmStage.findFirst({ where: { id: stageId, organizationId, pipelineId: deal.pipelineId, status: 'active' } })
  if (!stage) throw invalid('Etapa inválida para este funil.')
  if (stage.id === deal.stageId) return deal
  const updated = await bump(tx, deal, {
    stageId: stage.id,
    stageChangedAt: new Date(),
    probability: stage.probability,
    // movido por pessoa (direto ou aceitando sugestão): o sistema não move mais por cima
    ...(actor.origin === 'system' ? {} : { stageLockedByHuman: true }),
  } as Prisma.CrmDealUpdateManyMutationInput)
  await addDealEvent(tx, updated, 'stage_changed', actor, { fromStageId: deal.stageId, toStageId: stage.id })
  return updated
}

export interface CloseInput {
  outcome: 'won' | 'lost'
  version: number
  amountCents?: number | null
  confirmNoAmount?: boolean
  lostReasonCode?: string
  note?: string
}

export async function closeDeal(tx: Tx, organizationId: string, scope: OwnerScope, id: string, input: CloseInput, actor: Actor) {
  const deal = await loadDeal(tx, organizationId, scope, id, input.version)
  if (deal.status !== 'open') throw invalid('Este negócio já está fechado.')
  const data: Prisma.CrmDealUpdateManyMutationInput = {
    status: input.outcome,
    closedAt: new Date(),
    outcomeNote: input.note ?? null,
    outcomeEvidence: 'manual',
    probability: input.outcome === 'won' ? 100 : 0,
  }
  if (input.outcome === 'won') {
    const amount = input.amountCents ?? deal.amountCents
    if ((amount === null || amount === undefined) && !input.confirmNoAmount) {
      throw new DomainError(400, 'crm_invalid', 'Informe o valor da venda ou confirme que ele não é conhecido.')
    }
    if (input.amountCents !== null && input.amountCents !== undefined) {
      data.amountCents = input.amountCents
      data.amountSource = 'manual'
    }
    data.lostReasonCode = null
  } else {
    if (!input.lostReasonCode) throw new DomainError(400, 'crm_invalid', 'Informe o motivo da perda.')
    data.lostReasonCode = input.lostReasonCode
  }
  const updated = await bump(tx, deal, data)
  await addDealEvent(tx, updated, input.outcome, actor, {
    data: { amountCents: updated.amountCents, ...(input.lostReasonCode ? { lostReasonCode: input.lostReasonCode } : {}), ...(input.confirmNoAmount ? { noAmount: true } : {}) },
  })
  // a sugestão pendente de confirmar desfecho deste negócio perde o sentido
  await tx.crmSuggestion.updateMany({ where: { organizationId, dealId: id, status: 'pending', kind: { in: ['confirm_outcome', 'move_stage'] } }, data: { status: 'expired', decisionNote: 'Negócio fechado' } })
  return updated
}

/** Reabrir com justificativa (CRM-03): o motivo fica no evento "reopened", com o autor e a data do próprio evento.
 *  A regra do motivo é repetida aqui (não só no schema da rota): fora dela, o JSON do evento poderia passar do teto e
 *  ser cortado, e o evento perderia o motivo e o "from". */
export async function reopenDeal(tx: Tx, organizationId: string, scope: OwnerScope, id: string, input: { version: number; reason: string }, actor: Actor) {
  const reason = input.reason.trim()
  const reasonError = reopenReasonError(reason)
  if (reasonError) throw new DomainError(400, 'crm_invalid', reasonError)
  const deal = await loadDeal(tx, organizationId, scope, id, input.version)
  if (deal.status === 'open') throw invalid('Este negócio já está aberto.')
  // volta na mesma etapa; se ela foi desativada, na primeira etapa ativa do funil
  const stage = (await tx.crmStage.findFirst({ where: { id: deal.stageId, status: 'active' } })) ?? (await resolveStage(tx, organizationId, deal.pipelineId))
  const updated = await bump(tx, deal, {
    status: 'open',
    closedAt: null,
    lostReasonCode: null,
    stageId: stage.id,
    probability: stage.probability,
  } as Prisma.CrmDealUpdateManyMutationInput)
  await addDealEvent(tx, updated, 'reopened', actor, { fromStageId: deal.stageId, toStageId: stage.id, data: { from: deal.status, reason } })
  return updated
}

export async function archiveDeal(tx: Tx, organizationId: string, scope: OwnerScope, id: string, version: number, actor: Actor) {
  const deal = await loadDeal(tx, organizationId, scope, id, version)
  if (deal.status === 'archived') return deal
  const updated = await bump(tx, deal, { status: 'archived' })
  await addDealEvent(tx, updated, 'archived', actor, { data: { from: deal.status } })
  await tx.crmSuggestion.updateMany({ where: { organizationId, dealId: id, status: 'pending' }, data: { status: 'expired', decisionNote: 'Negócio arquivado' } })
  return updated
}

// ── Vínculos com o AtendeRadar ───────────────────────────────────────────────

/** Liga o negócio a um registro do AtendeRadar (uma vez por par). */
export async function linkDeal(
  tx: Tx,
  organizationId: string,
  dealId: string,
  type: 'origin' | 'conversation' | 'opportunity' | 'alert' | 'recovery',
  refs: { revenueOpportunityId?: string; conversationId?: string; alertId?: string; recoveryItemId?: string },
  meta: { sourceEventId?: string; sourceVersion?: number; createdBy?: string | null } = {},
): Promise<boolean> {
  // a chave usa a referência do próprio tipo: duas recuperações da mesma conversa são dois vínculos
  const refId = { origin: refs.revenueOpportunityId, opportunity: refs.revenueOpportunityId, conversation: refs.conversationId, alert: refs.alertId, recovery: refs.recoveryItemId }[type] ?? ''
  const linkKey = `${dealId}:${type}:${refId}`
  const exists = await tx.crmBusinessLink.findUnique({ where: { linkKey }, select: { id: true } })
  if (exists) return false
  await tx.crmBusinessLink.create({
    data: { organizationId, dealId, relationshipType: type, ...refs, sourceEventId: meta.sourceEventId ?? null, sourceVersion: meta.sourceVersion ?? null, linkKey, createdBy: meta.createdBy ?? null },
  })
  return true
}

/** Negócios abertos ligados a uma conversa (direto ou pela oportunidade de origem). */
export async function openDealsOfConversation(tx: Tx, organizationId: string, conversationId: string) {
  const links = await tx.crmBusinessLink.findMany({ where: { organizationId, conversationId }, select: { dealId: true } })
  if (!links.length) return []
  return tx.crmDeal.findMany({ where: { organizationId, id: { in: [...new Set(links.map((l) => l.dealId))] }, status: 'open' }, include: { stage: true } })
}

/** Membro da plataforma que corresponde ao atendente monitorado (mesmo e-mail, ativo). */
export async function memberForAgent(tx: Tx, organizationId: string, agentId: string | null | undefined): Promise<string | null> {
  if (!agentId) return null
  const agent = await tx.agent.findFirst({ where: { id: agentId, organizationId }, select: { email: true } })
  const email = agent?.email?.trim().toLowerCase()
  if (!email) return null
  const members = await tx.organizationMember.findMany({ where: { organizationId, status: 'active' }, select: { id: true, email: true } })
  return members.find((m) => m.email.trim().toLowerCase() === email)?.id ?? null
}

/** Pessoa comercial ligada ao contato do WhatsApp (D4: separadas, mas ligadas). Cria se faltar; contato excluído ou grupo = null. */
export async function personFromContact(tx: Tx, organizationId: string, contactId: string | null | undefined, actor: Actor): Promise<string | null> {
  if (!contactId) return null
  const link = await tx.crmIdentityLink.findUnique({
    where: { organizationId_entityType_sourceId_provider: { organizationId, entityType: 'contact', sourceId: contactId, provider: 'native' } },
  })
  if (link && !link.tombstone) {
    const p = await resolvePerson(tx, organizationId, link.externalId)
    if (p) return p
  }
  const contact = await tx.contact.findFirst({ where: { id: contactId, organizationId } })
  if (!contact || contact.excluded || contact.isGroup) return null
  const phoneKey = contact.phoneHash ? `${organizationId}:${contact.phoneHash}` : null
  let personId = phoneKey ? (await tx.crmPerson.findUnique({ where: { phoneKey }, select: { id: true } }))?.id ?? null : null
  if (!personId) {
    const name = contact.displayName?.trim() || (contact.phoneLast4 ? `Contato final ${contact.phoneLast4}` : 'Contato do WhatsApp')
    const person = await tx.crmPerson.create({
      data: {
        organizationId,
        name: name.slice(0, 120),
        nameNorm: normName(name),
        phoneEncrypted: contact.phoneEncrypted,
        phoneHash: contact.phoneHash,
        phoneLast4: contact.phoneLast4,
        phoneKey,
        source: 'whatsapp',
        lastInteractionAt: contact.lastSeenAt,
        createdBy: actor.memberId,
      },
      select: { id: true },
    })
    personId = person.id
  }
  if (link) await tx.crmIdentityLink.update({ where: { id: link.id }, data: { externalId: personId, tombstone: false } })
  else await tx.crmIdentityLink.create({ data: { organizationId, entityType: 'contact', sourceId: contactId, externalId: personId, provider: 'native' } })
  return personId
}

/** Segue a mescla (mergedIntoId) até a pessoa ativa. */
export async function resolvePerson(tx: Tx, organizationId: string, personId: string): Promise<string | null> {
  let id: string | null = personId
  for (let i = 0; id && i < 5; i++) {
    const p: { id: string; status: string; mergedIntoId: string | null } | null = await tx.crmPerson.findFirst({ where: { id, organizationId }, select: { id: true, status: true, mergedIntoId: true } })
    if (!p) return null
    if (p.status === 'active') return p.id
    id = p.status === 'merged' ? p.mergedIntoId : null
  }
  return null
}

const INTENT_TITLE: Record<string, string> = {
  preco: 'Pedido de preço/orçamento',
  compra: 'Intenção de compra',
  negociacao: 'Negociação em andamento',
  agendamento: 'Agendamento',
  disponibilidade: 'Consulta de disponibilidade',
}
export const intentTitle = (intent: string | null | undefined) => INTENT_TITLE[intent ?? ''] ?? 'Oportunidade do WhatsApp'

export const opportunityOriginKey = (organizationId: string, opportunityId: string) => `${organizationId}:opportunity:${opportunityId}`

/**
 * Negócio a partir de uma RevenueOpportunity (manual, aceite de sugestão ou criação automática opt-in). Idempotente:
 * a mesma oportunidade devolve o negócio já criado. Estimativa só em estimatedAmountCents.
 */
export async function dealFromOpportunity(tx: Tx, organizationId: string, scope: OwnerScope, opportunityId: string, actor: Actor) {
  const originKey = opportunityOriginKey(organizationId, opportunityId)
  const existing = await tx.crmDeal.findUnique({ where: { originKey }, select: { id: true } })
  if (existing) {
    // já convertida: devolve o negócio só para quem o enxerga (senão o ID da oportunidade revelaria negócio alheio)
    const visible = await tx.crmDeal.findFirst({ where: { id: existing.id, ...dealScopeWhere(organizationId, scope) } })
    if (!visible) throw notFound('Oportunidade')
    return { deal: visible, created: false }
  }
  // supervisor: só conversa da equipe ou sem atendente (mesma regra de conversationScope); fora dela, 404
  const teamFilter = scope.kind === 'team' ? { OR: [{ agent: { team: scope.team } }, { agentId: null }] } : {}
  const opp = await tx.revenueOpportunity.findFirst({
    where: { id: opportunityId, conversation: { organizationId, ...teamFilter } },
    include: { conversation: { select: { id: true, agentId: true, primaryIntent: true, contactId: true, contact: { select: { excluded: true, isGroup: true } } } } },
  })
  if (!opp) throw notFound('Oportunidade')
  if (opp.conversation.contact?.excluded) throw invalid('Este contato foi excluído do monitoramento.')
  if (opp.conversation.contact?.isGroup) throw invalid('Conversa de grupo não vira negócio.')
  const agentOwner = await memberForAgent(tx, organizationId, opp.conversation.agentId)
  // atendente só converte oportunidade das conversas dele; a de outro responde como inexistente (ADR-003 item 2)
  if (scope.kind === 'own' && agentOwner !== scope.memberId) throw notFound('Oportunidade')
  const owner = scope.kind === 'own' ? scope.memberId : agentOwner && ownerInScope(scope, agentOwner) ? agentOwner : null
  const personId = await personFromContact(tx, organizationId, opp.conversation.contactId, actor)
  const deal = await createDeal(
    tx,
    organizationId,
    scope.kind === 'own' ? scope : { kind: 'all' },
    { title: intentTitle(opp.conversation.primaryIntent), personId, ownerMemberId: owner },
    actor,
    { source: 'opportunity', sourceId: opp.id, originKey, estimatedAmountCents: reaisToCents(opp.expectedValue), confidence: opp.confidence },
  )
  await linkDeal(tx, organizationId, deal.id, 'opportunity', { revenueOpportunityId: opp.id, conversationId: opp.conversation.id }, { createdBy: actor.memberId })
  await tx.crmSuggestion.updateMany({
    where: { organizationId, opportunityId: opp.id, kind: 'create_deal', status: 'pending' },
    data: { status: 'accepted', dealId: deal.id, decidedBy: actor.memberId, decidedAt: new Date() },
  })
  return { deal, created: true }
}
