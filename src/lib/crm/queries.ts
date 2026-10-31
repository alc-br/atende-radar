import type { Prisma, PrismaClient } from '@prisma/client'
import { MAX_PAGE_SIZE } from '@/lib/pagination'
import { dueWindow, safeTimezone, type DueWindow } from './agenda'
import { activityDto, companyDto, dealDto, dealEventDto, personDto, pipelineDto } from './dto'
import { DomainError } from './deals'
import { listPipelines } from './pipelines'
import { PENDING_ACTIVITY_STATUSES } from './schemas'
import { activityWhere, companyWhere, dealScopeWhere, personWhere, type OwnerScope } from './scope'
import { listSuggestions } from './suggestions'
import { normName } from './text'

// Leituras das telas do CRM (lista, Kanban, detalhe). Sempre empresa + escopo do papel (scope.ts); detalhe fora do
// escopo é 404. Vínculos com o AtendeRadar saem só como IDs: a tela abre a conversa pela rota da conversa, que aplica
// o escopo dela.

type Client = PrismaClient | Prisma.TransactionClient

const BOARD_COLUMN = 50
const notFound = (what: string) => new DomainError(404, 'crm_not_found', `${what} não encontrado.`)

export function pageOf(q: { page?: string; limit?: string }, defaultLimit = 25) {
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(q.limit || '') || defaultLimit))
  return { page, limit, skip: (page - 1) * limit }
}

/** Nomes dos membros (responsáveis) para a tela, sem e-mail. */
export async function memberNames(client: Client, organizationId: string, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((v): v is string => !!v))]
  if (!unique.length) return []
  const rows = await client.organizationMember.findMany({ where: { organizationId, id: { in: unique } }, select: { id: true, name: true, email: true } })
  return rows.map((m) => ({ id: m.id, name: m.name?.trim() || m.email.split('@')[0] }))
}

/** Próxima tarefa aberta de cada negócio (a de prazo mais próximo). */
async function nextTasks(client: Client, organizationId: string, dealIds: string[]) {
  if (!dealIds.length) return new Map<string, { id: string; title: string; dueAt: Date | null }>()
  const rows = await client.crmActivity.findMany({
    where: { organizationId, dealId: { in: dealIds }, status: { in: ['open', 'in_progress'] } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, dueAt: true, dealId: true },
  })
  const out = new Map<string, { id: string; title: string; dueAt: Date | null }>()
  for (const r of rows) if (r.dealId && !out.has(r.dealId)) out.set(r.dealId, { id: r.id, title: r.title, dueAt: r.dueAt })
  return out
}

export interface DealsFilter {
  pipelineId?: string
  stageId?: string
  ownerMemberId?: string
  status?: 'open' | 'won' | 'lost' | 'archived'
  source?: string
  personId?: string
  /** Só estes negócios (os ligados a uma conversa: a rota resolve e confere o escopo da conversa antes). */
  ids?: string[]
  q?: string
  from?: string
  to?: string
  sort?: 'updatedAt' | 'createdAt' | 'amount' | 'expectedCloseAt'
  cursor?: string
  page?: string
  limit?: string
}

function dealFilters(f: DealsFilter): Prisma.CrmDealWhereInput {
  const w: Prisma.CrmDealWhereInput = {}
  if (f.pipelineId) w.pipelineId = f.pipelineId
  if (f.stageId) w.stageId = f.stageId
  if (f.ownerMemberId) w.ownerMemberId = f.ownerMemberId
  w.status = f.status ?? { not: 'archived' }
  if (f.source) w.source = f.source
  if (f.personId) w.personId = f.personId
  if (f.ids) w.id = { in: f.ids }
  if (f.q?.trim()) w.title = { contains: f.q.trim() }
  if (f.from || f.to) {
    // fechados pelo fechamento; os demais pela criação
    const range = { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lt: new Date(f.to) } : {}) }
    if (f.status === 'won' || f.status === 'lost') w.closedAt = range
    else w.createdAt = range
  }
  return w
}

const dealOrder = (sort: DealsFilter['sort']): Prisma.CrmDealOrderByWithRelationInput[] =>
  sort === 'createdAt'
    ? [{ createdAt: 'desc' }, { id: 'desc' }]
    : sort === 'amount'
      ? [{ amountCents: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
      : sort === 'expectedCloseAt'
        ? [{ expectedCloseAt: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }]
        : [{ updatedAt: 'desc' }, { id: 'desc' }]

const dealInclude = {
  person: { select: { id: true, name: true, phoneLast4: true } },
  company: { select: { id: true, name: true } },
  stage: { select: { id: true, name: true } },
} as const

type DealRow = Prisma.CrmDealGetPayload<{ include: typeof dealInclude }>

function dealCard(d: DealRow, tasks: Map<string, { id: string; title: string; dueAt: Date | null }>) {
  return { ...dealDto(d), person: d.person, company: d.company, stage: d.stage, nextTask: tasks.get(d.id) ?? null }
}

export async function listDeals(client: Client, organizationId: string, scope: OwnerScope, f: DealsFilter) {
  const { page, limit, skip } = pageOf(f)
  const where: Prisma.CrmDealWhereInput = { AND: [dealScopeWhere(organizationId, scope), dealFilters(f)] }
  const [rows, total] = await Promise.all([
    client.crmDeal.findMany({ where, orderBy: dealOrder(f.sort), skip, take: limit, include: dealInclude }),
    client.crmDeal.count({ where }),
  ])
  const tasks = await nextTasks(client, organizationId, rows.map((d) => d.id))
  return { items: rows.map((d) => dealCard(d, tasks)), total, page, limit, members: await memberNames(client, organizationId, rows.map((d) => d.ownerMemberId)) }
}

/**
 * Kanban: negócios abertos do funil (o informado ou o padrão), até 50 por coluna. Com `stageId` + `cursor` (último ID
 * recebido), devolve só a próxima página daquela coluna.
 */
export async function boardDeals(client: Client, organizationId: string, scope: OwnerScope, f: DealsFilter) {
  const pipelines = await listPipelines(client, organizationId)
  const pipeline = f.pipelineId ? pipelines.find((p) => p.id === f.pipelineId) : pipelines[0]
  if (!pipeline) {
    if (f.pipelineId) throw notFound('Funil')
    return { pipeline: null, pipelines: [], columns: [], members: [] }
  }
  const base = { ...dealFilters({ ...f, status: 'open', pipelineId: pipeline.id, stageId: undefined, from: undefined, to: undefined }) }
  const stages = f.stageId ? pipeline.stages.filter((s) => s.id === f.stageId) : pipeline.stages
  const columns = await Promise.all(
    stages.map(async (stage) => {
      const where: Prisma.CrmDealWhereInput = { AND: [dealScopeWhere(organizationId, scope), base, { stageId: stage.id }] }
      const [rows, total] = await Promise.all([
        client.crmDeal.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: BOARD_COLUMN + 1,
          ...(f.cursor && f.stageId ? { cursor: { id: f.cursor }, skip: 1 } : {}),
          include: dealInclude,
        }),
        client.crmDeal.count({ where }),
      ])
      const more = rows.length > BOARD_COLUMN
      const deals = more ? rows.slice(0, BOARD_COLUMN) : rows
      return {
        stage: { id: stage.id, name: stage.name, position: stage.position, probability: stage.probability, slaDays: stage.slaDays },
        total,
        declaredCents: (await client.crmDeal.aggregate({ where, _sum: { amountCents: true } }))._sum.amountCents ?? 0,
        deals,
        nextCursor: more ? deals[deals.length - 1].id : null,
      }
    }),
  )
  const tasks = await nextTasks(client, organizationId, columns.flatMap((c) => c.deals.map((d) => d.id)))
  return {
    pipeline: pipelineDto(pipeline),
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault })),
    columns: columns.map((c) => ({ ...c, deals: c.deals.map((d) => dealCard(d, tasks)) })),
    members: await memberNames(client, organizationId, columns.flatMap((c) => c.deals.map((d) => d.ownerMemberId))),
  }
}

export async function dealDetail(client: Client, organizationId: string, scope: OwnerScope, id: string) {
  const deal = await client.crmDeal.findFirst({ where: { id, ...dealScopeWhere(organizationId, scope) }, include: { ...dealInclude, stage: true, pipeline: { include: { stages: { orderBy: { position: 'asc' } } } } } })
  if (!deal) throw notFound('Negócio')
  const [events, activities, links, suggestions] = await Promise.all([
    client.crmDealEvent.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    client.crmActivity.findMany({ where: { dealId: deal.id }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 200 }),
    client.crmBusinessLink.findMany({
      where: { dealId: deal.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, relationshipType: true, conversationId: true, revenueOpportunityId: true, alertId: true, recoveryItemId: true, createdAt: true },
    }),
    listSuggestions(client, organizationId, scope, { dealId: deal.id }),
  ])
  return {
    deal: { ...dealDto(deal), person: deal.person, company: deal.company },
    pipeline: pipelineDto(deal.pipeline),
    events: events.map(dealEventDto),
    activities: activities.map(activityDto),
    links,
    suggestions,
    members: await memberNames(client, organizationId, [deal.ownerMemberId, ...events.map((e) => e.actorMemberId), ...activities.map((a) => a.ownerMemberId)]),
  }
}

// ── Pessoas e empresas ───────────────────────────────────────────────────────

export interface PeopleFilter {
  q?: string
  status?: 'active' | 'archived'
  ownerMemberId?: string
  companyId?: string
  page?: string
  limit?: string
}

export async function listPeople(client: Client, organizationId: string, scope: OwnerScope, f: PeopleFilter) {
  const { page, limit, skip } = pageOf(f)
  const and: Prisma.CrmPersonWhereInput[] = [personWhere(organizationId, scope), { status: f.status ?? 'active' }]
  if (f.ownerMemberId) and.push({ ownerMemberId: f.ownerMemberId })
  if (f.companyId) and.push({ companyId: f.companyId })
  const q = f.q?.trim()
  if (q) {
    const or: Prisma.CrmPersonWhereInput[] = [{ nameNorm: { contains: normName(q) } }, { emailNorm: { contains: q.toLowerCase() } }]
    if (/^\d{4}$/.test(q)) or.push({ phoneLast4: q })
    and.push({ OR: or })
  }
  const where: Prisma.CrmPersonWhereInput = { AND: and }
  const [rows, total] = await Promise.all([
    client.crmPerson.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: limit, include: { company: { select: { id: true, name: true } }, _count: { select: { deals: true } } } }),
    client.crmPerson.count({ where }),
  ])
  return {
    items: rows.map((p) => ({ ...personDto(p), company: p.company, dealCount: p._count.deals })),
    total,
    page,
    limit,
    members: await memberNames(client, organizationId, rows.map((p) => p.ownerMemberId)),
  }
}

export async function personDetail(client: Client, organizationId: string, scope: OwnerScope, id: string) {
  const p = await client.crmPerson.findFirst({ where: { id, ...personWhere(organizationId, scope) }, include: { company: { select: { id: true, name: true } } } })
  if (!p) throw notFound('Pessoa')
  const [deals, activities, links] = await Promise.all([
    client.crmDeal.findMany({ where: { AND: [dealScopeWhere(organizationId, scope), { personId: p.id }] }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    client.crmActivity.findMany({ where: { AND: [activityWhere(organizationId, scope), { personId: p.id }] }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 100 }),
    client.crmIdentityLink.findMany({ where: { organizationId, entityType: 'contact', externalId: p.id, tombstone: false }, select: { sourceId: true } }),
  ])
  // conversas ligadas: as do contato do WhatsApp vinculado (só IDs e estado; a tela abre pela rota da conversa)
  const conversations = links.length
    ? await client.conversation.findMany({
        where: { organizationId, contactId: { in: links.map((l) => l.sourceId) } },
        orderBy: { openedAt: 'desc' },
        take: 20,
        select: { id: true, operationalStatus: true, openedAt: true, lastInboundAt: true, closedAt: true },
      })
    : []
  return {
    person: { ...personDto(p), company: p.company },
    deals: deals.map(dealDto),
    activities: activities.map(activityDto),
    conversations,
    members: await memberNames(client, organizationId, [p.ownerMemberId, ...deals.map((d) => d.ownerMemberId)]),
  }
}

export async function listCompanies(client: Client, organizationId: string, scope: OwnerScope, f: PeopleFilter) {
  const { page, limit, skip } = pageOf(f)
  const and: Prisma.CrmCompanyWhereInput[] = [companyWhere(organizationId, scope), { status: f.status ?? 'active' }]
  if (f.ownerMemberId) and.push({ ownerMemberId: f.ownerMemberId })
  if (f.q?.trim()) and.push({ OR: [{ nameNorm: { contains: normName(f.q) } }, { taxId: { contains: f.q.replace(/\D/g, '') || '\u0000' } }] })
  const where: Prisma.CrmCompanyWhereInput = { AND: and }
  // as contagens seguem o que o detalhe mostra: pessoas ativas e negócios no escopo de quem vê
  const _count = { select: { people: { where: { AND: [personWhere(organizationId, scope), { status: 'active' }] } }, deals: { where: dealScopeWhere(organizationId, scope) } } }
  const [rows, total] = await Promise.all([
    client.crmCompany.findMany({ where, orderBy: [{ nameNorm: 'asc' }, { id: 'asc' }], skip, take: limit, include: { _count } }),
    client.crmCompany.count({ where }),
  ])
  return {
    items: rows.map((c) => ({ ...companyDto(c), peopleCount: c._count.people, dealCount: c._count.deals })),
    total,
    page,
    limit,
    members: await memberNames(client, organizationId, rows.map((c) => c.ownerMemberId)),
  }
}

export async function companyDetail(client: Client, organizationId: string, scope: OwnerScope, id: string) {
  const c = await client.crmCompany.findFirst({ where: { id, ...companyWhere(organizationId, scope) } })
  if (!c) throw notFound('Empresa')
  const [people, deals] = await Promise.all([
    client.crmPerson.findMany({ where: { AND: [personWhere(organizationId, scope), { companyId: c.id, status: 'active' }] }, orderBy: { nameNorm: 'asc' }, take: 100 }),
    client.crmDeal.findMany({ where: { AND: [dealScopeWhere(organizationId, scope), { companyId: c.id }] }, orderBy: { updatedAt: 'desc' }, take: 100 }),
  ])
  return {
    company: companyDto(c),
    people: people.map(personDto),
    deals: deals.map(dealDto),
    members: await memberNames(client, organizationId, [c.ownerMemberId, ...people.map((p) => p.ownerMemberId), ...deals.map((d) => d.ownerMemberId)]),
  }
}

// ── Atividades ───────────────────────────────────────────────────────────────

export interface ActivitiesFilter {
  /** Uma situação, ou "pending" (aberta ou em andamento). */
  status?: string
  ownerMemberId?: string
  dealId?: string
  personId?: string
  /** Prazo a partir deste instante (inclusivo). */
  dueAfter?: string
  /** Prazo antes deste instante (estrito). */
  dueBefore?: string
  /** Janela da agenda no fuso da empresa. */
  due?: DueWindow
  overdue?: '1'
  page?: string
  limit?: string
}

const PENDING = [...PENDING_ACTIVITY_STATUSES]

export async function listActivities(client: Client, organizationId: string, scope: OwnerScope, f: ActivitiesFilter, now = new Date()) {
  const { page, limit, skip } = pageOf(f)
  const org = await client.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } })
  const timezone = safeTimezone(org?.timezone)
  const and: Prisma.CrmActivityWhereInput[] = [activityWhere(organizationId, scope)]
  if (f.status === 'pending') and.push({ status: { in: PENDING } })
  else if (f.status) and.push({ status: f.status })
  if (f.ownerMemberId) and.push({ ownerMemberId: f.ownerMemberId })
  if (f.dealId) and.push({ dealId: f.dealId })
  if (f.personId) and.push({ personId: f.personId })
  if (f.dueAfter) and.push({ dueAt: { gte: new Date(f.dueAfter) } })
  if (f.dueBefore) and.push({ dueAt: { lt: new Date(f.dueBefore) } })
  if (f.due) {
    const w = dueWindow(f.due, timezone, now)
    and.push({ dueAt: { gte: w.gte, lt: w.lt } })
  }
  if (f.overdue) and.push({ status: { in: PENDING }, dueAt: { lt: now } })
  const where: Prisma.CrmActivityWhereInput = { AND: and }
  const [rows, total] = await Promise.all([
    client.crmActivity.findMany({
      where,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: { deal: { select: { id: true, title: true, status: true } }, person: { select: { id: true, name: true } } },
    }),
    client.crmActivity.count({ where }),
  ])
  return {
    items: rows.map((a) => ({ ...activityDto(a), deal: a.deal, person: a.person, overdue: !!a.dueAt && a.dueAt < now && PENDING.includes(a.status as (typeof PENDING)[number]) })),
    total,
    page,
    limit,
    members: await memberNames(client, organizationId, rows.map((a) => a.ownerMemberId)),
    /** Fuso da empresa, em que valem "Hoje" e "Próximos 7 dias". */
    timezone,
  }
}
