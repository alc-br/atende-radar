import { z } from 'zod'
import { REOPEN_REASON, reopenReasonError } from './labels'
import { DUE_WINDOWS } from './agenda'
import { MAX_AMOUNT_CENTS } from './money'

// Corpos e filtros das rotas /api/crm/* (docs/crm/04-api-crm.md). Todos strict(): campo desconhecido = 400, o que
// bloqueia mass assignment. organizationId, createdBy, status (fora das rotas de transição) e amountSource
// "verified_external" nunca entram por aqui.

const id = z.string().min(1).max(64)
const name = z.string().trim().min(1, 'Informe o nome.').max(120, 'Nome com mais de 120 caracteres.')
const notes = z.string().max(5000, 'Observação com mais de 5.000 caracteres.')
const cents = z.number().int('Valor em centavos inteiros.').min(0, 'Valor não pode ser negativo.').max(MAX_AMOUNT_CENTS, 'Valor acima do limite.')
const isoDate = z.iso.datetime({ offset: true, message: 'Data inválida.' })
const version = z.number().int().min(1)
const email = z.email('E-mail inválido.').max(254)
const phone = z.string().max(32).regex(/^[+\d\s().-]*$/, 'Telefone inválido.')
const tags = z.array(z.string().trim().min(1).max(40)).max(20, 'No máximo 20 etiquetas.')

export const PRIORITIES = ['low', 'normal', 'high'] as const
export const ACTIVITY_TYPES = ['follow_up', 'call', 'whatsapp_external', 'email', 'meeting', 'internal'] as const
export const ACTIVITY_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const
/** Tarefa pendente = aberta ou em andamento (listas, atrasadas, agenda e a Visão comercial contam as duas). */
export const PENDING_ACTIVITY_STATUSES = ['open', 'in_progress'] as const
export const LOST_REASONS = ['price', 'no_response', 'competitor', 'no_stock', 'timing', 'not_qualified', 'other'] as const
export const DEAL_SOURCES = ['manual', 'opportunity', 'alert', 'recovery', 'import', 'suggestion'] as const

// ── Pessoas e empresas ───────────────────────────────────────────────────────

export const personCreate = z
  .object({
    name,
    email: email.nullish(),
    phone: phone.nullish(),
    companyId: id.nullish(),
    ownerMemberId: id.nullish(),
    notes: notes.nullish(),
    tags: tags.optional(),
  })
  .strict()

export const personUpdate = personCreate.partial().extend({ version }).strict()

export const companyCreate = z
  .object({
    name,
    taxId: z.string().regex(/^\d{14}$|^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, 'CNPJ inválido.').nullish(),
    domain: z.string().max(253).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Domínio inválido.').nullish(),
    segment: z.string().max(80).nullish(),
    ownerMemberId: id.nullish(),
    notes: notes.nullish(),
  })
  .strict()

export const companyUpdate = companyCreate.partial().extend({ version }).strict()

export const mergeBody = z.object({ keepId: id, mergeId: id, keepVersion: version, mergeVersion: version }).strict()

export const contactsQuery = z
  .object({
    q: z.string().max(120).optional(),
    status: z.enum(['active', 'archived']).optional(),
    ownerMemberId: id.optional(),
    companyId: id.optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  })
  .strict()

// ── Funis e etapas ───────────────────────────────────────────────────────────

const stageInput = z.object({ name: z.string().trim().min(1).max(60), probability: z.number().int().min(0).max(100).optional(), slaDays: z.number().int().min(1).max(365).nullish() }).strict()

export const pipelineCreate = z.object({ name: z.string().trim().min(1).max(60), stages: z.array(stageInput).min(1, 'O funil precisa de ao menos uma etapa.').max(15) }).strict()

export const pipelineUpdate = z.object({ version, name: z.string().trim().min(1).max(60).optional(), isDefault: z.literal(true).optional(), active: z.boolean().optional() }).strict()

/** Lista completa e ordenada das etapas: com id edita/reordena, sem id cria; etapa ausente é desativada. */
export const stagesUpdate = z
  .object({
    version,
    stages: z.array(stageInput.extend({ id: id.optional() }).strict()).min(1).max(15),
  })
  .strict()

// ── Negócios ─────────────────────────────────────────────────────────────────

export const dealCreate = z
  .object({
    title: z.string().trim().min(1, 'Informe o título.').max(160),
    pipelineId: id.optional(),
    stageId: id.optional(),
    personId: id.nullish(),
    companyId: id.nullish(),
    ownerMemberId: id.nullish(),
    amountCents: cents.nullish(),
    priority: z.enum(PRIORITIES).optional(),
    expectedCloseAt: isoDate.nullish(),
    nextAction: z.string().max(200).nullish(),
    nextActionAt: isoDate.nullish(),
  })
  .strict()

export const dealUpdate = dealCreate.omit({ pipelineId: true, stageId: true }).partial().extend({ version }).strict()

export const dealStage = z.object({ stageId: id, version }).strict()

export const dealClose = z
  .object({
    outcome: z.enum(['won', 'lost']),
    version,
    amountCents: cents.nullish(),
    /** Ganho sem valor declarado só com esta confirmação explícita (CRM-03). */
    confirmNoAmount: z.boolean().optional(),
    lostReasonCode: z.enum(LOST_REASONS).optional(),
    note: z.string().max(1000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.outcome === 'lost' && !v.lostReasonCode) ctx.addIssue({ code: 'custom', path: ['lostReasonCode'], message: 'Informe o motivo da perda.' })
    // ganho sem valor: a regra fica no domínio (deals.ts), que sabe se o negócio já tem valor declarado
  })

/** Corpo só com a versão: arquivar (DELETE) pessoa, empresa e negócio. */
export const versionOnly = z.object({ version }).strict()

/** Reabrir com justificativa (CRM-03): o motivo vai para o histórico do negócio, nunca para a auditoria nem para o log.
 *  A regra (tamanho visível, teto e caracteres recusados) é a de reopenReasonError, a mesma do domínio e da tela. */
export const dealReopen = z
  .object({
    version,
    reason: z
      .string({ error: REOPEN_REASON.required })
      .trim()
      .superRefine((s, ctx) => {
        const message = reopenReasonError(s)
        if (message) ctx.addIssue({ code: 'custom', message })
      }),
  })
  .strict()

export const fromOpportunity = z.object({ opportunityId: id }).strict()

export const dealsQuery = z
  .object({
    view: z.enum(['list', 'board']).optional(),
    pipelineId: id.optional(),
    stageId: id.optional(),
    ownerMemberId: id.optional(),
    status: z.enum(['open', 'won', 'lost', 'archived']).optional(),
    source: z.enum(DEAL_SOURCES).optional(),
    personId: id.optional(),
    /** Só os ligados a esta conversa (bloco "Negócios relacionados", CRM-05). */
    conversationId: id.optional(),
    q: z.string().max(120).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    sort: z.enum(['updatedAt', 'createdAt', 'amount', 'expectedCloseAt']).optional(),
    cursor: z.string().max(200).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  })
  .strict()

// ── Atividades ───────────────────────────────────────────────────────────────

export const activityCreate = z
  .object({
    type: z.enum(ACTIVITY_TYPES),
    title: z.string().trim().min(1, 'Informe o título.').max(160),
    notes: notes.nullish(),
    dealId: id.nullish(),
    personId: id.nullish(),
    ownerMemberId: id.nullish(),
    dueAt: isoDate.nullish(),
    priority: z.enum(PRIORITIES).optional(),
    // origem (F5): tarefa a partir de um alerta ou de um item de recuperação; uma aberta por causa
    alertId: id.optional(),
    recoveryItemId: id.optional(),
  })
  .strict()

export const activityUpdate = activityCreate
  .omit({ dealId: true, personId: true, type: true, alertId: true, recoveryItemId: true })
  .partial()
  .extend({ version, status: z.enum(ACTIVITY_STATUSES).optional(), result: z.string().max(1000).nullish() })
  .strict()

export const activitiesQuery = z
  .object({
    // "pending" = open + in_progress (as listas de tarefas a fazer); os demais valores filtram uma situação só
    status: z.enum([...ACTIVITY_STATUSES, 'pending']).optional(),
    ownerMemberId: id.optional(),
    dealId: id.optional(),
    personId: id.optional(),
    // prazo: dueAfter inclusivo, dueBefore estrito; due = janela da agenda no fuso da empresa (agenda.ts)
    dueAfter: isoDate.optional(),
    dueBefore: isoDate.optional(),
    due: z.enum(DUE_WINDOWS).optional(),
    overdue: z.enum(['1']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  })
  .strict()

// ── Indicadores, funis e sugestões (filtros) ─────────────────────────────────

export const overviewQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict()

export const pipelinesQuery = z.object({ includeInactive: z.enum(['1']).optional() }).strict()

export const suggestionsQuery = z.object({ dealId: id.optional() }).strict()

// ── Sugestões e configurações ────────────────────────────────────────────────

/** Aceite: corpo vazio, exceto confirmar desfecho, que pede o mesmo que fechar o negócio (valor ou motivo). */
export const suggestionAccept = z
  .object({
    amountCents: cents.nullish(),
    confirmNoAmount: z.boolean().optional(),
    lostReasonCode: z.enum(LOST_REASONS).optional(),
    note: z.string().max(1000).optional(),
  })
  .strict()

export const suggestionDismiss = z.object({ note: z.string().max(500).optional() }).strict()

export const settingsUpdate = z
  .object({
    autoCreateDeals: z.boolean().optional(),
    suggestStage: z.boolean().optional(),
    notifications: z.boolean().optional(),
    exports: z.boolean().optional(),
  })
  .strict()

export const adminCrmToggle = z.object({ enabled: z.boolean() }).strict()

// ── Importação e exportação ──────────────────────────────────────────────────

export const importRow = z
  .object({ name, email: z.string().max(254).nullish(), phone: phone.nullish(), company: z.string().max(120).nullish(), notes: notes.nullish(), tags: z.string().max(400).nullish() })
  .strict()

export const importBody = z.object({ dryRun: z.boolean(), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000, 'No máximo 5.000 linhas por importação.') }).strict()

export const exportBody = z.object({ entity: z.enum(['people', 'deals']), includeFullPhone: z.boolean().optional(), confirm: z.boolean().optional() }).strict()
