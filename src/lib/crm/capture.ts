import { orgLock } from '@/lib/billing/lock'
import { db } from '@/lib/db'
import { isSimulationOrg } from '@/lib/sandbox'
import { emitCrmEvent, eventIdempotencyKey, type CrmEventInput, type CrmEventType } from './events'
import { crmKilled } from './flags'
import { reaisToCents } from './money'
import { errTag } from './log'
import { kickCrmOutbox } from './worker'

// Captura de mudanças do AtendeRadar para o outbox do CRM (ADR-002, docs/crm/05-sincronizacao.md).
// O motor de análise não usa transação e não é alterado: em vez de gravar o evento dentro dele, este job lê as tabelas
// de origem (oportunidade, alerta, recuperação, privacidade, etapa analítica) a partir de um checkpoint por recurso e
// empresa e grava os eventos. A chave de idempotência (tipo, agregado, versão) torna reler o mesmo trecho inofensivo,
// então o mesmo código faz a captura contínua, o backfill (janela inicial) e a reconciliação (releitura de 7 dias).

const BATCH = 200
const MAX_BATCHES = 10 // por recurso e rodada: o resto fica para a próxima
export const BACKFILL_DAYS = 30
const RECONCILE_DAYS = 7

type Cursor = { t: string; id: string } | null
type Emit = <T extends CrmEventType>(e: CrmEventInput<T>) => Promise<boolean>

const secs = (d: Date) => Math.floor(d.getTime() / 1000)
const eligible = (c: { contact: { excluded: boolean; isGroup: boolean } | null }) => !c.contact || (!c.contact.excluded && !c.contact.isGroup)

/** Depois do cursor (updatedAt, id), em ordem estável; sem cursor, a partir da janela inicial. */
const after = (c: Cursor, initial: Date) =>
  c ? { OR: [{ updatedAt: { gt: new Date(c.t) } }, { updatedAt: new Date(c.t), id: { gt: c.id } }] } : { updatedAt: { gte: initial } }

// Rodada sem linha nova não regrava o checkpoint a cada 15 s: a linha já diz o mesmo (0 linhas, sem erro, em dia) e só
// "última leitura" envelheceria. Uma gravação por empresa e recurso a cada rodada pesava no tick com muitas empresas e
// disputava a escrita do SQLite (docs/crm/05-sincronizacao.md § 3). Ociosa, regrava no máximo uma vez por minuto.
const IDLE_SAVE_MS = 60_000
const IDLE_STATS = JSON.stringify({ rows: 0 })

function parseCursor(raw: string | null): Cursor {
  if (!raw) return null
  try {
    const c = JSON.parse(raw) as Cursor
    return c && typeof c.t === 'string' && typeof c.id === 'string' ? c : null
  } catch {
    return null
  }
}

/** Cursor salvo e, se a última gravação foi uma rodada ociosa sem erro, quando ela aconteceu. */
async function readCheckpoint(organizationId: string, resource: string): Promise<{ cursor: Cursor; idleAt: number | null }> {
  const row = await db.crmSyncCheckpoint.findUnique({
    where: { organizationId_resource: { organizationId, resource } },
    select: { cursor: true, lastRunAt: true, lastErrorCode: true, statsJson: true, lagSeconds: true },
  })
  const idleAt = row?.lastRunAt && !row.lastErrorCode && !row.lagSeconds && row.statsJson === IDLE_STATS ? row.lastRunAt.getTime() : null
  return { cursor: parseCursor(row?.cursor ?? null), idleAt }
}

async function saveCheckpoint(organizationId: string, resource: string, data: { cursor?: Cursor; stats?: Record<string, number>; error?: string | null; lagSeconds?: number | null }) {
  const now = new Date()
  const fields = {
    lastRunAt: now,
    ...(data.error ? { lastErrorCode: data.error } : { lastSuccessAt: now, lastErrorCode: null }),
    ...(data.cursor !== undefined ? { cursor: data.cursor ? JSON.stringify(data.cursor) : null } : {}),
    ...(data.stats ? { statsJson: JSON.stringify(data.stats) } : {}),
    ...(data.lagSeconds !== undefined ? { lagSeconds: data.lagSeconds } : {}),
  }
  await db.crmSyncCheckpoint.upsert({ where: { organizationId_resource: { organizationId, resource } }, create: { organizationId, resource, ...fields }, update: fields })
}

interface Pass {
  organizationId: string
  emit: Emit
  initial: Date
}

type Resource = (p: Pass, cursor: Cursor) => Promise<{ rows: number; last: Cursor }>

const opportunities: Resource = async ({ organizationId, emit, initial }, cursor) => {
  const rows = await db.revenueOpportunity.findMany({
    where: { conversation: { organizationId }, ...after(cursor, initial) },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: BATCH,
    select: {
      id: true, status: true, expectedValue: true, confidence: true, confirmedSaleValue: true, createdAt: true, updatedAt: true, conversationId: true,
      conversation: { select: { agentId: true, primaryIntent: true, contact: { select: { excluded: true, isGroup: true } } } },
    },
  })
  for (const r of rows) {
    if (!eligible(r.conversation)) continue
    const base = { organizationId, aggregateType: 'revenue_opportunity', aggregateId: r.id }
    const conf = Math.min(1, Math.max(0, r.confidence))
    // só a oportunidade ativa vira sugestão; a que já nasce ganha ou perdida entra pelo desfecho abaixo
    if (r.status === 'active') {
      await emit({
        ...base, eventType: 'opportunity.detected', aggregateVersion: 1,
        data: { opportunityId: r.id, conversationId: r.conversationId, agentId: r.conversation.agentId, intent: r.conversation.primaryIntent, status: r.status, estimatedValueCents: reaisToCents(r.expectedValue), confidence: conf },
      })
    }
    if (r.status === 'active' && r.updatedAt.getTime() - r.createdAt.getTime() > 1000) {
      await emit({ ...base, eventType: 'opportunity.estimate_changed', aggregateVersion: secs(r.updatedAt), data: { opportunityId: r.id, conversationId: r.conversationId, estimatedValueCents: reaisToCents(r.expectedValue), confidence: conf } })
    }
    if (r.status === 'won' || r.status === 'lost') {
      await emit({
        organizationId, eventType: 'outcome.detected', aggregateType: 'opportunity_outcome', aggregateId: `${r.id}:${r.status}`, aggregateVersion: 1,
        data: { conversationId: r.conversationId, agentId: r.conversation.agentId, outcome: r.status === 'won' ? 'sale_confirmed' : 'lost', confirmedValueCents: reaisToCents(r.confirmedSaleValue) },
      })
    }
  }
  const l = rows[rows.length - 1]
  return { rows: rows.length, last: l ? { t: l.updatedAt.toISOString(), id: l.id } : cursor }
}

const alerts: Resource = async ({ organizationId, emit, initial }, cursor) => {
  const rows = await db.alert.findMany({
    where: { organizationId, ...after(cursor, initial) },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: BATCH,
    select: { id: true, conversationId: true, severity: true, groupKey: true, status: true, occurrences: true, updatedAt: true, conversation: { select: { agentId: true, contact: { select: { excluded: true, isGroup: true } } } } },
  })
  for (const r of rows) {
    if (r.conversation && !eligible(r.conversation)) continue
    // falso positivo também encerra: a sugestão de tarefa dele expira e não segura a causa
    const resolved = r.status === 'resolved' || r.status === 'dismissed' || r.status === 'false_positive'
    const base = { organizationId, aggregateType: 'alert', aggregateId: r.id, aggregateVersion: Math.max(1, r.occurrences) }
    if (resolved) await emit({ ...base, eventType: 'alert.resolved', data: { alertId: r.id, conversationId: r.conversationId } })
    else {
      const type = ((r.groupKey ?? '').split('|')[0] || 'alert').slice(0, 60)
      await emit({ ...base, eventType: 'alert.created', data: { alertId: r.id, conversationId: r.conversationId, agentId: r.conversation?.agentId ?? null, type, severity: r.severity.slice(0, 20) } })
    }
  }
  const l = rows[rows.length - 1]
  return { rows: rows.length, last: l ? { t: l.updatedAt.toISOString(), id: l.id } : cursor }
}

const recoveries: Resource = async ({ organizationId, emit, initial }, cursor) => {
  const rows = await db.recoveryItem.findMany({
    where: { organizationId, status: { in: ['recovered', 'lost'] }, ...after(cursor, initial) },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: BATCH,
    select: { id: true, conversationId: true, status: true, recoveredValue: true, updatedAt: true },
  })
  for (const r of rows) {
    // recuperado não é venda comprovada (CRM-07): só com valor recuperado vira "sale_confirmed"
    const result = r.status === 'lost' ? 'not_recovered' : (r.recoveredValue ?? 0) > 0 ? 'sale_confirmed' : 'contact_recovered'
    await emit({ organizationId, eventType: 'recovery.completed', aggregateType: 'recovery_item', aggregateId: r.id, aggregateVersion: 1, data: { recoveryItemId: r.id, conversationId: r.conversationId, result } })
  }
  const l = rows[rows.length - 1]
  return { rows: rows.length, last: l ? { t: l.updatedAt.toISOString(), id: l.id } : cursor }
}

const privacy: Resource = async ({ organizationId, emit, initial }, cursor) => {
  const rows = await db.contact.findMany({
    where: { organizationId, excluded: true, ...after(cursor, initial) },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: BATCH,
    select: { id: true, updatedAt: true },
  })
  for (const r of rows) {
    await emit({ organizationId, eventType: 'contact.privacy_changed', aggregateType: 'contact', aggregateId: r.id, aggregateVersion: secs(r.updatedAt), data: { contactId: r.id, excluded: true } })
  }
  const l = rows[rows.length - 1]
  return { rows: rows.length, last: l ? { t: l.updatedAt.toISOString(), id: l.id } : cursor }
}

/** Etapa analítica só interessa nas conversas com negócio aberto; um evento por (conversa, etapa). */
const stages: Resource = async ({ organizationId, emit, initial }, cursor) => {
  const links = await db.crmBusinessLink.findMany({ where: { organizationId, conversationId: { not: null } }, select: { conversationId: true, dealId: true, createdAt: true } })
  if (!links.length) return { rows: 0, last: cursor }
  const open = new Set((await db.crmDeal.findMany({ where: { organizationId, status: 'open', id: { in: [...new Set(links.map((l) => l.dealId))] } }, select: { id: true } })).map((d) => d.id))
  const since = cursor ? new Date(cursor.t) : initial
  const live = links.filter((l) => open.has(l.dealId))
  const convIds = [...new Set(live.map((l) => l.conversationId as string))]
  // vínculo novo: lê a conversa mesmo que ela não tenha mudado depois do cursor
  const fresh = new Set(live.filter((l) => l.createdAt >= since).map((l) => l.conversationId as string))
  let rows = 0
  for (let i = 0; i < convIds.length; i += 500) {
    const chunk = convIds.slice(i, i + 500)
    const convs = await db.conversation.findMany({
      where: { organizationId, id: { in: chunk }, OR: [{ updatedAt: { gte: since } }, { id: { in: chunk.filter((id) => fresh.has(id)) } }] },
      select: { id: true, agentId: true, inferredStage: true, contact: { select: { excluded: true, isGroup: true } } },
    })
    for (const c of convs) {
      rows++
      if (!eligible(c) || !c.inferredStage) continue
      await emit({ organizationId, eventType: 'conversation.stage_inferred', aggregateType: 'conversation_stage', aggregateId: `${c.id}:${c.inferredStage}`.slice(0, 64), aggregateVersion: 1, data: { conversationId: c.id, agentId: c.agentId, inferredStage: c.inferredStage.slice(0, 40) } })
    }
  }
  return { rows, last: { t: new Date().toISOString(), id: '' } }
}

const RESOURCES: Record<string, Resource> = { opportunities, alerts, recoveries, privacy, stages }

/** Emissor real ou de simulação (dry-run: conta o que seria gravado, não grava). */
function emitter(dryRun: boolean, counter: { emitted: number; skipped: number }): Emit {
  return async (e) => {
    if (dryRun) {
      const exists = await db.crmOutboxEvent.findUnique({ where: { idempotencyKey: eventIdempotencyKey(e) }, select: { id: true } })
      if (exists) counter.skipped++
      else counter.emitted++
      return !exists
    }
    const ok = await emitCrmEvent(e)
    if (ok) counter.emitted++
    else counter.skipped++
    return ok
  }
}

/**
 * Empresa simulada não alimenta o CRM (nem ligado por engano). A bloqueada pelo plano pausa como a análise: o cursor
 * fica onde está e, ao contratar, a captura retoma de onde parou.
 */
async function capturePaused(organizationId: string): Promise<'simulation' | 'locked' | null> {
  if (await isSimulationOrg(organizationId)) return 'simulation'
  return (await orgLock(organizationId)) ? 'locked' : null
}

/** Uma rodada de captura de uma empresa. `window` força a releitura (backfill e reconciliação), sem mexer no cursor. */
export async function captureOrg(organizationId: string, opts: { dryRun?: boolean; windowDays?: number } = {}) {
  const dryRun = !!opts.dryRun
  const counter = { emitted: 0, skipped: 0 }
  const paused = await capturePaused(organizationId)
  if (paused) return { ...counter, rows: {} as Record<string, number>, paused }
  const emit = emitter(dryRun, counter)
  const forced = opts.windowDays !== undefined
  const initial = new Date(Date.now() - (opts.windowDays ?? BACKFILL_DAYS) * 86400_000)
  const perResource: Record<string, number> = {}
  for (const [name, fn] of Object.entries(RESOURCES)) {
    const resource = `capture:${name}`
    const saved = forced ? { cursor: null, idleAt: null } : await readCheckpoint(organizationId, resource)
    let cursor: Cursor = saved.cursor
    let rows = 0
    try {
      for (let b = 0; b < MAX_BATCHES; b++) {
        const r = await fn({ organizationId, emit, initial }, cursor)
        rows += r.rows
        cursor = r.last
        if (r.rows < BATCH || name === 'stages') break
      }
      // ociosa e gravada há menos de um minuto: nada a regravar (em "stages" o cursor de tempo avança na próxima gravação;
      // reler esse minuto é inofensivo pela idempotência)
      const idle = rows === 0 && saved.idleAt !== null && Date.now() - saved.idleAt < IDLE_SAVE_MS
      if (!dryRun && !forced && !idle) {
        const lag = cursor?.t ? Math.max(0, Math.round((Date.now() - new Date(cursor.t).getTime()) / 1000)) : null
        await saveCheckpoint(organizationId, resource, { cursor, stats: { rows }, lagSeconds: rows >= BATCH * MAX_BATCHES ? lag : 0 })
      }
    } catch (e) {
      console.error('[crm] captura falhou', name, errTag(e))
      if (!dryRun) await saveCheckpoint(organizationId, resource, { error: 'capture_failed' }).catch(() => {})
    }
    perResource[name] = rows
  }
  return { ...counter, rows: perResource, paused: null }
}

const g = globalThis as { __crmCaptureRunning?: boolean }

/** Job periódico: todas as empresas com CRM ligado. Falha de uma empresa não para as outras. */
export async function captureCrmChanges(): Promise<void> {
  if (crmKilled() || g.__crmCaptureRunning) return
  g.__crmCaptureRunning = true
  try {
    const orgs = await db.crmFeatureState.findMany({ where: { flag: 'crm.enabled', enabled: true }, select: { organizationId: true } })
    let emitted = 0
    for (const { organizationId } of orgs) emitted += (await captureOrg(organizationId)).emitted
    if (emitted) kickCrmOutbox()
  } finally {
    g.__crmCaptureRunning = false
  }
}

/**
 * Reconciliação (8.5): relê 7 dias com a mesma idempotência (repõe evento perdido), conta divergências e grava o
 * relatório sem dado pessoal. Não muda resultado decidido por pessoa. dryRun só conta.
 */
export async function reconcileCrm(organizationId: string, opts: { dryRun?: boolean } = {}) {
  const capture = await captureOrg(organizationId, { dryRun: opts.dryRun, windowDays: RECONCILE_DAYS })
  const now = Date.now()
  const [deals, links, people, stuck, dead, pending] = await Promise.all([
    db.crmDeal.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
    db.crmBusinessLink.findMany({ where: { organizationId }, select: { dealId: true, revenueOpportunityId: true } }),
    db.crmPerson.groupBy({ by: ['phoneHash'], where: { organizationId, status: 'active', phoneHash: { not: null } }, _count: { _all: true }, having: { phoneHash: { _count: { gt: 1 } } } }),
    db.crmOutboxEvent.count({ where: { organizationId, status: 'processing', lockedUntil: { lt: new Date(now - 10 * 60_000) } } }),
    db.crmOutboxEvent.count({ where: { organizationId, status: 'dead' } }),
    db.crmSuggestion.count({ where: { organizationId, status: 'pending' } }),
  ])
  const dealIds = new Set((await db.crmDeal.findMany({ where: { organizationId }, select: { id: true } })).map((d) => d.id))
  const orphanLinks = links.filter((l) => !dealIds.has(l.dealId)).length
  const oppIds = [...new Set(links.map((l) => l.revenueOpportunityId).filter((v): v is string => !!v))]
  const existingOpps = oppIds.length ? await db.revenueOpportunity.count({ where: { id: { in: oppIds }, conversation: { organizationId } } }) : 0
  const stats = {
    emitted: capture.emitted,
    alreadySynced: capture.skipped,
    deals: deals.reduce((s, r) => s + r._count._all, 0),
    dealsOpen: deals.find((r) => r.status === 'open')?._count._all ?? 0,
    orphanLinks,
    missingOpportunities: oppIds.length - existingOpps,
    duplicatePhones: people.length,
    stuckEvents: stuck,
    deadEvents: dead,
    pendingSuggestions: pending,
  }
  if (!opts.dryRun) {
    await saveCheckpoint(organizationId, 'reconcile', { stats })
    if (capture.emitted) kickCrmOutbox()
  }
  return stats
}

const RECONCILE_EVERY_MS = 6 * 3600_000

/** Reconciliação programada: a cada 6 h por empresa com CRM ligado. */
export async function reconcileDue(): Promise<void> {
  if (crmKilled()) return
  const orgs = await db.crmFeatureState.findMany({ where: { flag: 'crm.enabled', enabled: true }, select: { organizationId: true } })
  for (const { organizationId } of orgs) {
    const cp = await db.crmSyncCheckpoint.findUnique({ where: { organizationId_resource: { organizationId, resource: 'reconcile' } }, select: { lastRunAt: true } })
    if (cp?.lastRunAt && Date.now() - cp.lastRunAt.getTime() < RECONCILE_EVERY_MS) continue
    await reconcileCrm(organizationId).catch((e) => console.error('[crm] reconciliação falhou', errTag(e)))
  }
}
