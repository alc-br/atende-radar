import type { Prisma, PrismaClient } from '@prisma/client'
import { alertTaskKey, createActivity } from './activities'
import { addDealEvent, closeDeal, dealFromOpportunity, DomainError, loadDeal, moveDealStage, type Actor, type Tx } from './deals'
import { reflectDealOutcome } from './outcome'
import { ACTIVITY_TYPES, PRIORITIES } from './schemas'
import { dealScopeWhere, suggestionWhere, type OwnerScope } from './scope'

// Decisão humana sobre as sugestões do consumidor (D2, CRM-06). Aceitar aplica pela mesma regra da ação manual
// (deals.ts, activities.ts), com origem "suggested" no histórico; descartar só registra. Em ambos ficam quem decidiu,
// quando e a versão da regra que sugeriu (auditoria da decisão automatizada).
//  - a decisão é reservada antes dos efeitos (update condicional em status "pending"): dois cliques ou duas pessoas
//    não aplicam a mesma sugestão duas vezes;
//  - sugestão que perdeu o sentido (negócio fechado, etapa mudou, prazo vencido) não é aplicada: vira "expired" com o
//    motivo e a resposta é `stale` (a rota devolve 409), sem desfazer a transação que gravou a expiração.

type Client = PrismaClient | Prisma.TransactionClient

export interface AcceptInput {
  amountCents?: number | null
  confirmNoAmount?: boolean
  lostReasonCode?: string
  note?: string
}

export type AcceptResult =
  | { status: 'accepted'; kind: string; dealId: string | null; activityId?: string; reflected?: { reflected: number; kept: number } }
  | { status: 'stale'; message: string }

const notFound = () => new DomainError(404, 'crm_not_found', 'Sugestão não encontrada.')
const decided = (status: string) =>
  new DomainError(409, 'crm_invalid_transition', status === 'accepted' ? 'Esta sugestão já foi aceita.' : 'Esta sugestão não está mais pendente.')

function payloadOf(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Sugestões pendentes e no prazo, no escopo; a de negócio só para quem enxerga o negócio hoje. */
export async function listSuggestions(client: Client, organizationId: string, scope: OwnerScope, opts: { dealId?: string; limit?: number } = {}) {
  const now = new Date()
  const rows = await client.crmSuggestion.findMany({
    where: {
      AND: [
        await suggestionWhere(client, organizationId, scope),
        { status: 'pending', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        opts.dealId ? { dealId: opts.dealId } : {},
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 50, 100),
  })
  const dealIds = [...new Set(rows.map((r) => r.dealId).filter((v): v is string => !!v))]
  const visible = dealIds.length
    ? new Set((await client.crmDeal.findMany({ where: { id: { in: dealIds }, ...dealScopeWhere(organizationId, scope) }, select: { id: true } })).map((d) => d.id))
    : new Set<string>()
  return rows
    .filter((r) => !r.dealId || visible.has(r.dealId))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      dealId: r.dealId,
      conversationId: r.conversationId,
      opportunityId: r.opportunityId,
      alertId: r.alertId,
      reason: r.reason,
      payload: payloadOf(r.payloadJson),
      ruleVersion: r.ruleVersion,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }))
}

async function findSuggestion(tx: Tx, organizationId: string, scope: OwnerScope, id: string) {
  const s = await tx.crmSuggestion.findFirst({ where: { AND: [{ id }, await suggestionWhere(tx, organizationId, scope)] } })
  if (!s) throw notFound()
  // o responsável do negócio pode ter mudado depois da sugestão: vale o escopo do negócio de agora
  if (s.dealId && !(await tx.crmDeal.findFirst({ where: { id: s.dealId, ...dealScopeWhere(organizationId, scope) }, select: { id: true } }))) throw notFound()
  return s
}

async function expire(tx: Tx, id: string, message: string): Promise<AcceptResult> {
  await tx.crmSuggestion.updateMany({ where: { id, status: 'pending' }, data: { status: 'expired', decisionNote: message } })
  return { status: 'stale', message }
}

export async function acceptSuggestion(tx: Tx, organizationId: string, scope: OwnerScope, id: string, input: AcceptInput, actor: Actor): Promise<AcceptResult> {
  const s = await findSuggestion(tx, organizationId, scope, id)
  if (s.status !== 'pending') throw decided(s.status)
  if (s.expiresAt && s.expiresAt <= new Date()) return expire(tx, s.id, 'Sugestão vencida.')
  const payload = payloadOf(s.payloadJson)
  const act: Actor = { ...actor, origin: 'suggested' }

  // checagens que só leem, antes de reservar a decisão
  const deal = s.dealId ? await loadDeal(tx, organizationId, scope, s.dealId) : null
  if (s.kind !== 'create_deal') {
    if (!deal) return expire(tx, s.id, 'O negócio desta sugestão não existe mais.')
    if (deal.status !== 'open') return expire(tx, s.id, 'O negócio já foi fechado.')
  }
  if (s.kind === 'create_deal' && !s.opportunityId) return expire(tx, s.id, 'A oportunidade de origem não existe mais.')
  if (s.kind === 'move_stage') {
    if (typeof payload.stageId !== 'string') return expire(tx, s.id, 'Etapa sugerida inválida.')
    if (deal!.stageId === payload.stageId) return expire(tx, s.id, 'O negócio já está nesta etapa.')
    if (typeof payload.fromStageId === 'string' && deal!.stageId !== payload.fromStageId) return expire(tx, s.id, 'A etapa do negócio mudou depois da sugestão.')
  }
  const outcome = payload.outcome === 'won' || payload.outcome === 'lost' ? payload.outcome : null
  if (s.kind === 'confirm_outcome' && !outcome) return expire(tx, s.id, 'Desfecho sugerido inválido.')
  if (!['create_deal', 'move_stage', 'create_task', 'confirm_outcome'].includes(s.kind)) return expire(tx, s.id, 'Tipo de sugestão desconhecido.')

  const claimed = await tx.crmSuggestion.updateMany({
    where: { id: s.id, status: 'pending' },
    data: { status: 'accepted', decidedBy: actor.memberId, decidedAt: new Date(), decisionNote: input.note?.slice(0, 500) ?? null },
  })
  if (!claimed.count) throw new DomainError(409, 'crm_invalid_transition', 'Esta sugestão já foi decidida por outra pessoa.')
  const trail = { kind: s.kind, suggestionId: s.id, ruleVersion: s.ruleVersion }

  if (s.kind === 'create_deal') {
    const { deal: created } = await dealFromOpportunity(tx, organizationId, scope, s.opportunityId!, act)
    await tx.crmSuggestion.update({ where: { id: s.id }, data: { dealId: created.id } })
    await addDealEvent(tx, created, 'suggestion_accepted', act, { data: trail })
    return { status: 'accepted', kind: s.kind, dealId: created.id }
  }

  if (s.kind === 'move_stage') {
    const moved = await moveDealStage(tx, organizationId, scope, deal!.id, payload.stageId as string, deal!.version, act)
    await addDealEvent(tx, moved, 'suggestion_accepted', act, { data: trail })
    return { status: 'accepted', kind: s.kind, dealId: moved.id }
  }

  if (s.kind === 'create_task') {
    const type = ACTIVITY_TYPES.includes(payload.type as (typeof ACTIVITY_TYPES)[number]) ? (payload.type as string) : 'follow_up'
    const priority = PRIORITIES.includes(payload.priority as (typeof PRIORITIES)[number]) ? (payload.priority as string) : 'normal'
    const hours = typeof payload.dueInHours === 'number' && payload.dueInHours > 0 && payload.dueInHours <= 720 ? payload.dueInHours : 24
    const { activity } = await createActivity(
      tx,
      organizationId,
      scope,
      {
        type,
        title: typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Retornar ao cliente',
        dealId: deal!.id,
        ownerMemberId: deal!.ownerMemberId ?? (scope.kind === 'own' ? scope.memberId : actor.memberId),
        dueAt: new Date(Date.now() + hours * 3600_000).toISOString(),
        priority,
      },
      act,
      // sugestão de um alerta usa a chave do alerta: a tarefa criada à mão para ele e a aceita são a mesma (T05.07)
      { source: 'suggestion', sourceId: s.id, dedupeKey: s.alertId ? alertTaskKey(organizationId, s.alertId) : s.dedupeKey },
    )
    if (s.alertId) {
      // as outras sugestões de tarefa do mesmo alerta (um por negócio aberto da conversa) deixam de valer
      await tx.crmSuggestion.updateMany({
        where: { organizationId, alertId: s.alertId, kind: 'create_task', status: 'pending' },
        data: { status: 'expired', decisionNote: 'Já há tarefa para este alerta' },
      })
    }
    await addDealEvent(tx, deal!, 'suggestion_accepted', act, { data: { ...trail, activityId: activity.id } })
    return { status: 'accepted', kind: s.kind, dealId: deal!.id, activityId: activity.id }
  }

  // confirm_outcome: a pessoa confirma; valor e motivo seguem as regras do fechamento manual (CRM-03)
  const suggestedAmount = typeof payload.confirmedValueCents === 'number' ? payload.confirmedValueCents : undefined
  const closed = await closeDeal(
    tx,
    organizationId,
    scope,
    deal!.id,
    {
      outcome: outcome!,
      version: deal!.version,
      amountCents: input.amountCents !== undefined ? input.amountCents : suggestedAmount,
      confirmNoAmount: input.confirmNoAmount,
      lostReasonCode: input.lostReasonCode,
      note: input.note,
    },
    act,
  )
  await addDealEvent(tx, closed, 'suggestion_accepted', act, { data: trail })
  const reflected = await reflectDealOutcome(tx, closed, act)
  return { status: 'accepted', kind: s.kind, dealId: closed.id, reflected }
}

export async function dismissSuggestion(tx: Tx, organizationId: string, scope: OwnerScope, id: string, note: string | undefined, actor: Actor) {
  const s = await findSuggestion(tx, organizationId, scope, id)
  if (s.status !== 'pending') throw decided(s.status)
  const r = await tx.crmSuggestion.updateMany({
    where: { id: s.id, status: 'pending' },
    data: { status: 'dismissed', decidedBy: actor.memberId, decidedAt: new Date(), decisionNote: note?.slice(0, 500) ?? null },
  })
  if (!r.count) throw new DomainError(409, 'crm_invalid_transition', 'Esta sugestão já foi decidida por outra pessoa.')
  if (s.dealId) {
    const deal = await tx.crmDeal.findUnique({ where: { id: s.dealId }, select: { id: true, organizationId: true, version: true } })
    if (deal) await addDealEvent(tx, deal, 'suggestion_dismissed', actor, { data: { kind: s.kind, suggestionId: s.id, ruleVersion: s.ruleVersion } })
  }
  return { id: s.id, status: 'dismissed' as const }
}

/** Rotina de fundo: sugestão pendente com prazo vencido vira "expired" (a lista já as esconde; isto só arruma o estado). */
export async function expireSuggestions(client: Client, now = new Date()) {
  const r = await client.crmSuggestion.updateMany({ where: { status: 'pending', expiresAt: { lte: now } }, data: { status: 'expired', decisionNote: 'Sugestão vencida.' } })
  return r.count
}
