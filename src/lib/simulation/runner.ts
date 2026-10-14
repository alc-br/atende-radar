import { createHash } from 'node:crypto'
import { db } from '../db'
import { analyzeOrganization, type AnalysisSummary } from '../analysis/engine'
import { deleteSimulationOrganization } from '../org-deletion'
import { SimulationDisabledError, simulationEnabled } from '../sandbox'
import { purgeExpiredSimulations } from './cleanup'
import { addAgent, addConnection, buildOrganization, type SimOrg } from './builder'
import { injectConnectionStatus, injectMessage } from './injector'
import { check, type AssertContext } from './assert'
import { SCENARIOS, scenarioById } from './scenarios'
import type { AssertionResult, Scenario, ScenarioResult } from './types'

// Executa cenários: monta a empresa simulada, percorre os passos no relógio virtual, confere as expectativas,
// grava uma linha em SimulationRun (trilha de auditoria uniforme: operador, token ou CLI) e apaga a empresa no fim
// (salvo `keep`, que a deixa por 24 h para abrir e olhar; a limpeza automática apaga depois).

const MIN = 60_000

const ensureEnabled = () => {
  if (!simulationEnabled()) throw new SimulationDisabledError()
}

/** Número fictício e estável de um cliente simulado: o mesmo rótulo na mesma empresa é sempre o mesmo "telefone". */
export function chatIdFor(orgId: string, label: string): string {
  const n = parseInt(createHash('sha256').update(`${orgId}:${label}`).digest('hex').slice(0, 12), 16) % 90_000_000
  return `55119${String(10_000_000 + n)}@s.whatsapp.net`
}

export interface RunOptions {
  keep?: boolean
  /** e-mail do operador, "token" ou "cli" */
  startedBy: string
  now?: Date
}

export async function runScenario(scenario: Scenario, opts: RunOptions): Promise<ScenarioResult> {
  ensureEnabled()
  const started = Date.now()
  const now = opts.now ?? new Date()
  const maxAt = Math.max(0, ...scenario.steps.map((s) => s.at))
  const t0 = new Date(now.getTime() - (maxAt + 1) * MIN)
  const at = (m: number) => new Date(t0.getTime() + m * MIN)
  const row = await db.simulationRun.create({ data: { kind: 'run', scenarioId: scenario.id, startedBy: opts.startedBy, virtualStart: t0 } })

  const assertions: AssertionResult[] = []
  let sim: SimOrg | null = null
  let error: string | undefined
  try {
    sim = await buildOrganization(scenario, t0, now)
    await db.simulationRun.update({ where: { id: row.id }, data: { organizationId: sim.orgId } })
    const ctx: AssertContext = { orgId: sim.orgId, chats: new Map(), lastTick: null }
    const refs = new Map<string, { eventId: string; externalId: string; connectionId: string }>()
    const steps = scenario.steps.map((s, i) => ({ s, i })).sort((a, b) => a.s.at - b.s.at || a.i - b.i).map((x) => x.s)

    for (const step of steps) {
      if (step.kind === 'message') {
        const ref = step.repeatOf ? refs.get(step.repeatOf) : undefined
        if (step.repeatOf && !ref) throw new Error(`passo repete "${step.repeatOf}", que não existe`)
        const connectionId = ref?.connectionId ?? sim.connectionIds[step.connection ?? 0]
        if (!connectionId) throw new Error(`conexão ${step.connection} não existe no cenário`)
        const injected = await injectMessage({
          connectionId,
          chatId: chatIdFor(sim.orgId, step.chat),
          from: step.from,
          text: step.agent ? `*${step.agent}*: ${step.text}` : step.text,
          occurredAt: at(step.at),
          pushName: step.from === 'customer' ? step.name : undefined,
          eventId: step.newEvent ? undefined : ref?.eventId,
          externalId: ref?.externalId,
        })
        if (!injected.result.ok) {
          assertions.push({ at: step.at, label: `mensagem de ${step.chat} aceita pela ingestão`, ok: false, detail: injected.result.error })
          continue
        }
        if (injected.conversationId) ctx.chats.set(step.chat, injected.conversationId)
        if (step.ref) refs.set(step.ref, { eventId: injected.eventId, externalId: injected.externalId, connectionId })
      } else if (step.kind === 'connection') {
        const connectionId = sim.connectionIds[step.connection ?? 0]
        if (!connectionId) throw new Error(`conexão ${step.connection} não existe no cenário`)
        const r = await injectConnectionStatus(connectionId, step.status, at(step.at), step.reason)
        if (!r.ok) assertions.push({ at: step.at, label: `status "${step.status}" aceito pela ingestão`, ok: false, detail: r.error })
      } else if (step.kind === 'tick') {
        ctx.lastTick = await analyzeOrganization(sim.orgId, at(step.at))
        for (const e of step.expect ?? []) assertions.push({ at: step.at, ...(await check(ctx, e)) })
      } else {
        const r = step.kind === 'addConnection' ? await addConnection(sim, at(step.at)) : await addAgent(sim)
        const what = step.kind === 'addConnection' ? 'conexão' : 'atendente'
        assertions.push({ at: step.at, label: `cadastrar mais um(a) ${what} → ${step.expectStatus}`, ok: r.status === step.expectStatus, detail: `HTTP ${r.status}` })
      }
    }
    for (const e of scenario.expect ?? []) assertions.push({ at: null, ...(await check(ctx, e)) })
    if (!assertions.length) assertions.push({ at: null, label: 'cenário sem asserções', ok: false, detail: 'todo cenário precisa conferir algo' })
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const status: ScenarioResult['status'] = error ? 'error' : assertions.every((a) => a.ok) ? 'passed' : 'failed'
  const keep = !!opts.keep && !!sim
  if (sim && !keep) {
    await deleteSimulationOrganization(sim.orgId).catch((e) => {
      console.error('[simulation] falha ao apagar empresa simulada', sim!.orgId, e instanceof Error ? e.message : e)
    })
  }
  const result: ScenarioResult = {
    scenarioId: scenario.id,
    title: scenario.title,
    status,
    runId: row.id,
    organizationId: sim?.orgId ?? null,
    kept: keep,
    virtualStart: t0.toISOString(),
    durationMs: Date.now() - started,
    assertions,
    ...(error ? { error } : {}),
  }
  await db.simulationRun.update({ where: { id: row.id }, data: { status, finishedAt: new Date(), resultJson: JSON.stringify(result).slice(0, 60_000) } })
  return result
}

/** Roda um cenário pelo id, ou todos ('todos'). Lança erro se o id não existe. */
export async function runScenarios(idOrAll: string, opts: RunOptions): Promise<ScenarioResult[]> {
  ensureEnabled()
  const list = idOrAll === 'todos' || idOrAll === 'all' ? SCENARIOS : [scenarioById(idOrAll)].filter((s): s is Scenario => !!s)
  if (!list.length) throw new Error(`Cenário "${idOrAll}" não existe`)
  await purgeExpiredSimulations() // aproveita para apagar as mantidas que passaram das 24 h
  const out: ScenarioResult[] = []
  for (const s of list) out.push(await runScenario(s, opts))
  return out
}

// ── empresa simulada mantida (--manter): mensagem avulsa, tick e leitura ─────────────────────────────────────────────

/** Empresa simulada pelo id; null se não existe OU se é real (quem chama responde 404 nos dois casos). */
export async function findSimulationOrg(orgId: string) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, displayName: true, isSimulation: true, simulationExpiresAt: true, createdAt: true } })
  return org?.isSimulation ? org : null
}

export interface ManualMessage {
  chat: string
  from: 'customer' | 'company'
  text: string
  name?: string
  agent?: string
  /** há quantos minutos (relógio real) a mensagem "chegou"; padrão 0 */
  minutesAgo?: number
  connection?: number
}

export async function injectManual(orgId: string, m: ManualMessage, startedBy: string) {
  ensureEnabled()
  const org = await findSimulationOrg(orgId)
  if (!org) return null
  const conns = await db.whatsAppConnection.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const connectionId = conns[m.connection ?? 0]?.id
  if (!connectionId) return { ok: false as const, error: 'Conexão não existe' }
  const r = await injectMessage({
    connectionId,
    chatId: chatIdFor(orgId, m.chat),
    from: m.from,
    text: m.agent ? `*${m.agent}*: ${m.text}` : m.text,
    occurredAt: new Date(Date.now() - Math.max(0, m.minutesAgo ?? 0) * MIN),
    pushName: m.from === 'customer' ? m.name : undefined,
  })
  await db.simulationRun.create({
    data: { kind: 'inject', organizationId: orgId, startedBy, status: r.result.ok ? 'done' : 'error', finishedAt: new Date(), resultJson: JSON.stringify({ chat: m.chat, from: m.from, ok: r.result.ok }) },
  })
  return r.result.ok ? { ok: true as const, conversationId: r.conversationId } : { ok: false as const, error: r.result.error }
}

export async function tickManual(orgId: string, startedBy: string): Promise<AnalysisSummary | null> {
  ensureEnabled()
  if (!(await findSimulationOrg(orgId))) return null
  const summary = await analyzeOrganization(orgId, new Date())
  await db.simulationRun.create({ data: { kind: 'tick', organizationId: orgId, startedBy, status: 'done', finishedAt: new Date(), resultJson: JSON.stringify(summary) } })
  return summary
}

/** Retrato da empresa simulada (só dados sintéticos): conversas, alertas e fila de recuperação. */
export async function simulationSnapshot(orgId: string) {
  const org = await findSimulationOrg(orgId)
  if (!org) return null
  const [conversations, alerts, recovery, connections, sub] = await Promise.all([
    db.conversation.findMany({
      where: { organizationId: orgId },
      orderBy: { openedAt: 'asc' },
      take: 200,
      select: { id: true, operationalStatus: true, primaryIntent: true, sentiment: true, potentialValue: true, closedAt: true, contact: { select: { displayName: true } }, _count: { select: { messages: true } } },
    }),
    db.alert.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, ruleName: true, status: true, severity: true, title: true, conversationId: true } }),
    db.recoveryItem.findMany({ where: { organizationId: orgId }, take: 200, select: { id: true, reason: true, status: true, conversationId: true } }),
    db.whatsAppConnection.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, status: true } }),
    db.subscription.findUnique({ where: { organizationId: orgId }, select: { status: true, plan: { select: { code: true, name: true } } } }),
  ])
  return {
    organization: { id: org.id, name: org.displayName, expiresAt: org.simulationExpiresAt?.toISOString() ?? null, createdAt: org.createdAt.toISOString() },
    plan: sub?.plan ?? null,
    connections,
    conversations: conversations.map((c) => ({ id: c.id, customer: c.contact?.displayName ?? null, status: c.operationalStatus, intent: c.primaryIntent, sentiment: c.sentiment, potentialValue: c.potentialValue, closed: !!c.closedAt, messages: c._count.messages })),
    alerts,
    recovery,
  }
}

export { SCENARIOS, scenarioById }
