import type { CrmActivity, CrmCompany, CrmDeal, CrmDealEvent, CrmPerson, CrmPipeline, CrmStage } from '@prisma/client'
import type { AuthContext } from '@/lib/api-auth'
import type { Actor } from './deals'

// Forma pública dos registros do CRM nas respostas da API. A pessoa nunca sai com telefone cifrado, hash ou chaves de
// duplicidade: só os 4 últimos dígitos. Dados de JSON guardado (etiquetas, histórico) saem já lidos.

export const actorOf = (auth: Pick<AuthContext, 'memberId' | 'name' | 'email'>): Actor => ({ memberId: auth.memberId, label: auth.name || auth.email, origin: 'manual' })

function parse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export function personDto(p: CrmPerson) {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phoneLast4: p.phoneLast4,
    hasPhone: !!p.phoneHash,
    companyId: p.companyId,
    ownerMemberId: p.ownerMemberId,
    source: p.source,
    notes: p.notes,
    tags: parse<string[]>(p.tagsJson, []),
    status: p.status,
    mergedIntoId: p.mergedIntoId,
    lastInteractionAt: p.lastInteractionAt,
    version: p.version,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

export function companyDto(c: CrmCompany) {
  return {
    id: c.id,
    name: c.name,
    taxId: c.taxId,
    domain: c.domain,
    segment: c.segment,
    ownerMemberId: c.ownerMemberId,
    notes: c.notes,
    status: c.status,
    version: c.version,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

export function dealDto(d: CrmDeal) {
  return {
    id: d.id,
    pipelineId: d.pipelineId,
    stageId: d.stageId,
    title: d.title,
    personId: d.personId,
    companyId: d.companyId,
    ownerMemberId: d.ownerMemberId,
    source: d.source,
    sourceId: d.sourceId,
    status: d.status,
    amountCents: d.amountCents,
    amountSource: d.amountSource,
    estimatedAmountCents: d.estimatedAmountCents,
    confidence: d.confidence,
    probability: d.probability,
    priority: d.priority,
    expectedCloseAt: d.expectedCloseAt,
    closedAt: d.closedAt,
    lostReasonCode: d.lostReasonCode,
    outcomeNote: d.outcomeNote,
    nextAction: d.nextAction,
    nextActionAt: d.nextActionAt,
    stageChangedAt: d.stageChangedAt,
    stageLockedByHuman: d.stageLockedByHuman,
    version: d.version,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}

export function dealEventDto(e: CrmDealEvent) {
  return {
    id: e.id,
    type: e.type,
    fromStageId: e.fromStageId,
    toStageId: e.toStageId,
    origin: e.origin,
    actorMemberId: e.actorMemberId,
    actorLabel: e.actorLabel,
    data: parse<Record<string, unknown>>(e.dataJson, {}),
    createdAt: e.createdAt,
  }
}

export function activityDto(a: CrmActivity) {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    notes: a.notes,
    dealId: a.dealId,
    personId: a.personId,
    ownerMemberId: a.ownerMemberId,
    dueAt: a.dueAt,
    priority: a.priority,
    status: a.status,
    result: a.result,
    completedAt: a.completedAt,
    source: a.source,
    sourceId: a.sourceId, // alerta, item de recuperação ou sugestão de origem (só o ID)
    version: a.version,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

export function pipelineDto(p: CrmPipeline & { stages: CrmStage[] }) {
  return {
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    status: p.status,
    position: p.position,
    version: p.version,
    stages: p.stages.map((s) => ({ id: s.id, name: s.name, position: s.position, probability: s.probability, slaDays: s.slaDays, status: s.status })),
  }
}
