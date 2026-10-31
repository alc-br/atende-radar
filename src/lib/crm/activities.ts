import type { CrmActivity, Prisma } from '@prisma/client'
import { checkOwner, DomainError, loadDeal, type Actor, type Tx } from './deals'
import { activityWhere, personWhere, type OwnerScope } from './scope'
import { cleanText } from './text'

// Atividades e tarefas (CRM-04). Mesmo desenho dos negócios no escopo (leitura e escrita) e na versão otimista. A trilha
// das tarefas (criar, reatribuir, concluir, reabrir) fica na auditoria crm.activity_created / crm.activity_updated, só
// com nomes de campo, situação e IDs de membro; tarefa não grava CrmDealEvent (o histórico do negócio é do negócio).
// `dedupeKey` garante uma tarefa aberta por causa (alerta, recuperação, sugestão): concluir ou cancelar zera a chave, e
// a mesma causa pode gerar outra tarefa depois.

const CLOSED = ['done', 'cancelled']

/** Chave da tarefa aberta por causa de um alerta: a mesma para a tarefa criada à mão e para a sugestão aceita. */
export const alertTaskKey = (organizationId: string, alertId: string) => `${organizationId}:alert:${alertId}`

export interface ActivityInput {
  type: string
  title: string
  notes?: string | null
  dealId?: string | null
  personId?: string | null
  ownerMemberId?: string | null
  dueAt?: string | null
  priority?: string
}

export interface ActivityOrigin {
  source: 'manual' | 'alert' | 'recovery' | 'stage' | 'suggestion'
  sourceId?: string | null
  dedupeKey?: string | null
}

const notFound = () => new DomainError(404, 'crm_not_found', 'Atividade não encontrada.')
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v))

export async function createActivity(tx: Tx, organizationId: string, scope: OwnerScope, input: ActivityInput, actor: Actor, origin: ActivityOrigin = { source: 'manual' }) {
  // sem responsável informado, fica com quem criou (atendente: sempre ele). Quem escolhe à mão só entrega a quem abre a
  // tela Tarefas; a sugestão aceita segue o dono do negócio
  const owner = input.ownerMemberId === undefined ? (scope.kind === 'own' ? scope.memberId : actor.memberId) : input.ownerMemberId
  await checkOwner(tx, organizationId, scope, owner, actor.origin === 'manual' ? 'crm.activities.view' : undefined)
  const deal = input.dealId ? await loadDeal(tx, organizationId, scope, input.dealId) : null
  if (deal && deal.status === 'archived') throw new DomainError(409, 'crm_invalid_transition', 'Negócio arquivado não recebe atividade.')
  let personId = input.personId ?? deal?.personId ?? null
  if (input.personId) {
    const p = await tx.crmPerson.findFirst({ where: { id: input.personId, status: 'active', ...personWhere(organizationId, scope) }, select: { id: true } })
    if (!p) throw new DomainError(400, 'crm_invalid', 'Pessoa não encontrada.')
    personId = p.id
  }
  if (origin.dedupeKey) {
    const open = await tx.crmActivity.findUnique({ where: { dedupeKey: origin.dedupeKey } })
    if (open) return { activity: open, created: false }
  }
  const activity = await tx.crmActivity.create({
    data: {
      organizationId,
      type: input.type,
      title: cleanText(input.title, 160),
      notes: input.notes ? cleanText(input.notes, 5000) : null,
      dealId: deal?.id ?? null,
      personId,
      ownerMemberId: owner ?? null,
      dueAt: toDate(input.dueAt) ?? null,
      priority: input.priority ?? 'normal',
      source: origin.source,
      sourceId: origin.sourceId ?? null,
      dedupeKey: origin.dedupeKey ?? null,
      createdBy: actor.memberId,
    },
  })
  return { activity, created: true }
}

export type ActivityPatch = Partial<Omit<ActivityInput, 'type' | 'dealId' | 'personId'>> & { version: number; status?: string; result?: string | null }

export async function loadActivity(tx: Tx, organizationId: string, scope: OwnerScope, id: string, version?: number) {
  const a = await tx.crmActivity.findFirst({ where: { id, ...activityWhere(organizationId, scope) } })
  if (!a) throw notFound()
  if (version !== undefined && a.version !== version) {
    throw new DomainError(409, 'crm_version_conflict', 'Esta atividade foi alterada por outra pessoa. Recarregue e tente de novo.', { currentVersion: a.version })
  }
  return a
}

const TRACKED = ['title', 'notes', 'ownerMemberId', 'dueAt', 'priority', 'status', 'result'] as const

/** Campos que de fato mudaram entre duas leituras (a auditoria guarda os nomes, nunca os valores). */
export function activityChanges(before: CrmActivity, after: CrmActivity): string[] {
  return TRACKED.filter((k) => {
    const a = before[k]
    const b = after[k]
    return a instanceof Date || b instanceof Date ? (a instanceof Date ? a.getTime() : null) !== (b instanceof Date ? b.getTime() : null) : a !== b
  })
}

export async function updateActivity(tx: Tx, organizationId: string, scope: OwnerScope, id: string, patch: ActivityPatch) {
  const cur = await loadActivity(tx, organizationId, scope, id, patch.version)
  const data: Prisma.CrmActivityUpdateManyMutationInput = {}
  if (patch.ownerMemberId !== undefined && patch.ownerMemberId !== cur.ownerMemberId) {
    if (scope.kind === 'own') throw new DomainError(403, 'crm_forbidden', 'Só o supervisor ou o gestor troca o responsável.')
    await checkOwner(tx, organizationId, scope, patch.ownerMemberId, 'crm.activities.view')
    data.ownerMemberId = patch.ownerMemberId
  }
  // só grava o que muda de fato (já normalizado): reenviar o mesmo valor não gasta versão nem dá 409 a quem edita junto
  if (patch.title !== undefined) {
    const title = cleanText(patch.title, 160)
    if (title !== cur.title) data.title = title
  }
  if (patch.notes !== undefined) {
    const notes = (patch.notes && cleanText(patch.notes, 5000)) || null
    if (notes !== (cur.notes || null)) data.notes = notes
  }
  if (patch.dueAt !== undefined) {
    const dueAt = toDate(patch.dueAt) ?? null
    if ((dueAt?.getTime() ?? null) !== (cur.dueAt?.getTime() ?? null)) data.dueAt = dueAt
  }
  if (patch.priority !== undefined && patch.priority !== cur.priority) data.priority = patch.priority
  if (patch.result !== undefined) {
    const result = (patch.result && cleanText(patch.result, 1000)) || null
    if (result !== (cur.result || null)) data.result = result
  }
  if (patch.status !== undefined && patch.status !== cur.status) {
    data.status = patch.status
    if (CLOSED.includes(patch.status)) {
      data.completedAt = new Date()
      data.dedupeKey = null // a causa pode gerar outra tarefa depois
    } else if (CLOSED.includes(cur.status)) {
      data.completedAt = null // reaberta; a chave não volta (outra tarefa da mesma causa pode já existir)
    }
  }
  if (!Object.keys(data).length) return cur
  const r = await tx.crmActivity.updateMany({ where: { id: cur.id, version: cur.version }, data: { ...data, version: { increment: 1 } } })
  if (!r.count) {
    const now = await tx.crmActivity.findUnique({ where: { id: cur.id }, select: { version: true } })
    throw new DomainError(409, 'crm_version_conflict', 'Esta atividade foi alterada por outra pessoa. Recarregue e tente de novo.', { currentVersion: now?.version ?? cur.version })
  }
  return tx.crmActivity.findUniqueOrThrow({ where: { id: cur.id } })
}
