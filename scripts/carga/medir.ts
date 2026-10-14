// Mede, direto no banco de carga (sem servidor), as consultas por trás das telas e o motor (T15).
//   $env:DATABASE_URL = "file:$PWD\.tmp\carga.db"; $env:NODE_ENV = "production"; bun scripts/carga/medir.ts ['--so=telas,relatorios,motor,ingestao'] [--saida=nome]
//   [--otimizar] (roda optimizeDb antes, como o servidor faz ao subir)
// (no PowerShell, a lista de --so vai entre aspas simples; --saida separa os arquivos de resultado de cada rodada)
// As consultas das rotas (painel, conversas, alertas, recuperação, equipe, notificações) são as MESMAS das rotas em
// src/app/api/**/route.ts (rota de API não pode exportar funções); relatórios, motor e ingestão chamam o código real.
// Cada SQL executado é guardado e passa por EXPLAIN QUERY PLAN no fim (.tmp/carga-planos.txt).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import type { AuthContext } from '../../src/lib/api-auth'
import { exigirBancoDeCarga, ORG_GRANDE } from './comum'

exigirBancoDeCarga()

// Cliente próprio com log de SQL por evento; vira o `db` de src/lib/db (que reaproveita globalThis.prisma).
const url = process.env.DATABASE_URL as string
const client = new PrismaClient({ log: [{ emit: 'event', level: 'query' }], datasources: { db: { url: url + (url.includes('?') ? '&' : '?') + 'socket_timeout=20' } } })
;(globalThis as { prisma?: PrismaClient }).prisma = client
await client.$queryRawUnsafe('PRAGMA journal_mode=WAL')

let cenario = ''
const sqls = new Map<string, { params: string; cenarios: Set<string>; vezes: number; maxMs: number }>()
client.$on('query' as never, (e: Prisma.QueryEvent) => {
  if (!cenario || !/^\s*SELECT/i.test(e.query)) return
  const s = sqls.get(e.query) ?? { params: e.params, cenarios: new Set<string>(), vezes: 0, maxMs: 0 }
  s.cenarios.add(cenario)
  s.vezes += 1
  s.maxMs = Math.max(s.maxMs, e.duration)
  sqls.set(e.query, s)
})

const { db } = await import('../../src/lib/db')
const { conversationScope, alertScope, recoveryScope, agentScope, supervisorTeam } = await import('../../src/lib/api-auth')
const { dayMetrics, recomputeMetrics } = await import('../../src/lib/analysis/metrics')
const { buildReport } = await import('../../src/lib/reports/build')
const { analyzeOrganization } = await import('../../src/lib/analysis/engine')
const { purgeExpired } = await import('../../src/lib/privacy')
const { ingestEvent } = await import('../../src/lib/ingest')

const auth = (role: string, email: string, team: string | null): AuthContext => ({ memberId: 'carga', orgId: ORG_GRANDE, role, email, name: 'Carga', emailVerified: true, team })
const DONO = auth('owner', `dono@${ORG_GRANDE}.carga.test`, null)
const SUPERVISOR = auth('supervisor', `supervisor1@${ORG_GRANDE}.carga.test`, 'Equipe 1')
const ATENDENTE = auth('atendente', `atendente1@${ORG_GRANDE}.carga.test`, 'Equipe 1')

// ---------- medição ----------
interface Resultado { nome: string; n: number; p50: number; p95: number; max: number }
const resultados: Resultado[] = []
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }
async function medir(nome: string, fn: () => Promise<unknown>, n = 15) {
  cenario = nome
  await fn() // aquecimento (e captura do SQL)
  cenario = ''
  const ts: number[] = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    await fn()
    ts.push(performance.now() - t)
  }
  const r = { nome, n, p50: Math.round(pct(ts, 50)), p95: Math.round(pct(ts, 95)), max: Math.round(Math.max(...ts)) }
  resultados.push(r)
  console.log(`${nome.padEnd(58)} p50 ${String(r.p50).padStart(6)} ms   p95 ${String(r.p95).padStart(6)} ms`)
}

/** Operações longas ou que gravam: uma execução, sem aquecimento. */
async function medirUmaVez(nome: string, fn: () => Promise<unknown>) {
  cenario = nome
  const t = performance.now()
  await fn()
  const ms = Math.round(performance.now() - t)
  cenario = ''
  resultados.push({ nome, n: 1, p50: ms, p95: ms, max: ms })
  console.log(`${nome.padEnd(58)} ${String(ms).padStart(6)} ms (1 execução)`)
}

// ---------- consultas das rotas (cópia fiel; manter igual às rotas) ----------
const dateStr = (d: Date) => d.toISOString().split('T')[0]

/** GET /api/dashboard?period=7d */
async function painel(a: AuthContext, period = '7d') {
  const windows: Record<string, [number, number, number, number]> = { today: [0, 0, 1, 1], yesterday: [1, 1, 2, 2], '30d': [29, 0, 59, 30] }
  const [curStart, curEnd, prevStart, prevEnd] = windows[period] ?? [6, 0, 13, 7]
  const curFrom = dateStr(new Date(Date.now() - curStart * 86400000)), curTo = dateStr(new Date(Date.now() - curEnd * 86400000))
  const prevFrom = dateStr(new Date(Date.now() - prevStart * 86400000)), prevTo = dateStr(new Date(Date.now() - prevEnd * 86400000))
  const team = supervisorTeam(a)
  const convWhere: Prisma.ConversationWhereInput = team ? conversationScope(a) : { organizationId: a.orgId }
  if (team) await scopedDailyRows(a.orgId, convWhere, Math.max(prevStart, 13))
  else await Promise.all([
    db.dailyMetric.findMany({ where: { organizationId: a.orgId, date: { gte: curFrom, lte: curTo } } }),
    db.dailyMetric.findMany({ where: { organizationId: a.orgId, date: { gte: prevFrom, lte: prevTo } } }),
  ])
  await painelContagens(convWhere)
  if (!team) await db.dailyMetric.findMany({ where: { organizationId: a.orgId, date: { gte: dateStr(new Date(Date.now() - 13 * 86400000)) } }, orderBy: { date: 'asc' } })
  await db.conversation.findMany({
    where: conversationScope(a),
    include: { contact: { select: { displayName: true, phoneLast4: true } }, agent: { select: { name: true, team: true } } },
    orderBy: { riskScore: 'desc' },
    take: 10,
  })
  await db.agent.findMany({ where: { ...agentScope(a), status: 'active' }, include: { metrics: { orderBy: { date: 'desc' }, take: 2 } } })
}
async function painelContagens(convWhere: Prisma.ConversationWhereInput) {
  await Promise.all([
    db.conversation.groupBy({ by: ['inferredStage', 'operationalStatus'], where: convWhere, _count: { _all: true } }),
    db.revenueOpportunity.count({ where: { conversation: convWhere } }),
    db.auditFinding.groupBy({ by: ['type', 'severity'], where: { conversation: convWhere }, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
  ])
}
async function scopedDailyRows(orgId: string, where: Prisma.ConversationWhereInput, daysBack: number) {
  await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } })
  const now = new Date()
  const since = new Date(now.getTime() - (daysBack + 2) * 86400000)
  const [convs, promises] = await Promise.all([
    db.conversation.findMany({
      where: { AND: [where, { OR: [{ closedAt: null }, { closedAt: { gte: since } }, { openedAt: { gte: since } }] }] },
      select: {
        openedAt: true, closedAt: true, operationalStatus: true, score: true,
        messages: { select: { direction: true, occurredAt: true } },
        opportunities: { select: { status: true, expectedValue: true, createdAt: true } },
      },
    }),
    db.promise.findMany({ where: { conversation: where, status: 'open' }, select: { status: true, dueAt: true } }),
  ])
  for (let i = daysBack; i >= 0; i--) dayMetrics(convs, promises, dateStr(new Date(now.getTime() - i * 86400000)), 'America/Sao_Paulo', now)
}

/** GET /api/conversations (mesmos filtros da rota) */
async function conversas(a: AuthContext, q: Record<string, string> = {}) {
  const where: Prisma.ConversationWhereInput = { AND: [conversationScope(a)] }
  if (q.search) where.OR = [{ contact: { displayName: { contains: q.search } } }, { contact: { phoneLast4: { contains: q.search } } }]
  if (q.period === '7d') where.createdAt = { gte: new Date(Date.now() - 7 * 86400000) }
  if (q.status) where.operationalStatus = q.status
  if (q.intent) where.primaryIntent = q.intent
  if (q.hasAlerts === 'true') where.alerts = { some: {} }
  if (q.minValue) where.potentialValue = { gte: parseFloat(q.minValue) }
  const page = parseInt(q.page || '1'), limit = parseInt(q.limit || '100') // a tela pede 100 por vez
  const [convs] = await Promise.all([
    db.conversation.findMany({
      where,
      include: {
        contact: { select: { displayName: true, phoneLast4: true } },
        agent: { select: { id: true, name: true, team: true } },
        connection: { select: { id: true, name: true } },
        alerts: { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.conversation.count({ where }),
  ])
  if (convs.length) await db.message.groupBy({ by: ['conversationId'], where: { conversationId: { in: convs.map((c) => c.id) } }, _count: { _all: true } })
}

/** GET /api/alerts */
async function alertas(a: AuthContext, q: Record<string, string> = {}) {
  const where: Prisma.AlertWhereInput = { AND: [alertScope(a)] }
  if (q.status) where.status = q.status
  if (q.severity) where.severity = q.severity
  const page = parseInt(q.page || '1'), limit = parseInt(q.limit || '100') // a tela pede 100 por vez
  return Promise.all([
    db.alert.findMany({
      where,
      include: { conversation: { select: { id: true, contact: { select: { displayName: true, phoneLast4: true } }, agent: { select: { id: true, name: true, team: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.alert.count({ where }),
    db.alert.groupBy({ by: ['status'], where: alertScope(a), _count: { id: true } }),
  ])
}

/** GET /api/conversations/[id]: a conversa com as mensagens */
async function conversaDetalhe(id: string) {
  return db.conversation.findFirst({
    where: { id, ...conversationScope(DONO) },
    include: { contact: true, agent: true, connection: true, messages: { orderBy: { occurredAt: 'asc' } }, classifications: { orderBy: { createdAt: 'desc' } }, findings: true, alerts: true, opportunities: true, promises: true, openQuestions: true },
  })
}

const recuperacao = (a: AuthContext) => Promise.all([
  db.recoveryItem.findMany({ where: { AND: [recoveryScope(a)] }, include: { agent: { select: { id: true, name: true } }, opportunity: { select: { id: true, expectedValue: true, conversation: { select: { id: true, updatedAt: true } } } } }, orderBy: { priorityScore: 'desc' }, take: 20 }),
  db.recoveryItem.count({ where: { AND: [recoveryScope(a)] } }),
])
const equipe = (a: AuthContext) => db.agent.findMany({ where: agentScope(a), include: { metrics: { orderBy: { date: 'desc' }, take: 2 }, identities: { orderBy: { confidence: 'desc' }, take: 1 } }, orderBy: { name: 'asc' } })
const notificacoes = (orgId: string) => Promise.all([
  db.notification.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 30 }),
  db.notification.count({ where: { organizationId: orgId } }),
  db.notification.count({ where: { organizationId: orgId, read: false } }),
])

// ---------- execução ----------
if (process.argv.includes('--otimizar')) {
  // o que o servidor faz 30 s depois de subir (src/lib/background.ts)
  const { optimizeDb } = await import('../../src/lib/db')
  const t = performance.now()
  await optimizeDb()
  console.log(`estatísticas do banco (optimizeDb): ${Math.round(performance.now() - t)} ms`)
}
const [nConv, nMsg, nAlert] = await Promise.all([
  db.conversation.count({ where: { organizationId: ORG_GRANDE } }),
  db.message.count({ where: { conversation: { organizationId: ORG_GRANDE } } }),
  db.alert.count({ where: { organizationId: ORG_GRANDE } }),
])
console.log(`empresa grande: ${nConv} conversas, ${nMsg} mensagens, ${nAlert} alertas\n`)

const secoes = (process.argv.find((a) => a.startsWith('--so=')) ?? '--so=telas,relatorios,motor,ingestao').slice(5).split(',')
if (secoes.includes('telas')) {
console.log('— Telas (consultas das rotas) —')
await medir('painel 7d · dono', () => painel(DONO))
await medir('painel 30d · dono', () => painel(DONO, '30d'))
await medir('painel 7d · supervisor com equipe', () => painel(SUPERVISOR), 5)
await medir('painel 7d · atendente', () => painel(ATENDENTE))
await medir('conversas p1 · dono', () => conversas(DONO))
await medir('conversas p30 · dono', () => conversas(DONO, { page: '30' }))
await medir('conversas busca "Cliente 1234" · dono', () => conversas(DONO, { search: 'Cliente 1234' }))
await medir('conversas busca "9999" · dono', () => conversas(DONO, { search: '9999' }))
await medir('conversas esperando + com alerta · dono', () => conversas(DONO, { status: 'waiting_company', hasAlerts: 'true' }))
await medir('conversas 7d + intenção preço + valor ≥ 500 · dono', () => conversas(DONO, { period: '7d', intent: 'preco', minValue: '500' }))
await medir('conversas p1 · supervisor', () => conversas(SUPERVISOR))
await medir('conversas p1 · atendente', () => conversas(ATENDENTE))
await medir('conversa aberta (detalhe com mensagens)', () => conversaDetalhe(`${ORG_GRANDE}_c123`))
await medir('alertas p1 · dono', () => alertas(DONO))
await medir('alertas novos · dono', () => alertas(DONO, { status: 'new' }))
await medir('alertas alta severidade p10 · dono', () => alertas(DONO, { severity: 'high', page: '10' }))
await medir('alertas p1 · supervisor', () => alertas(SUPERVISOR))
await medir('alertas p1 · atendente', () => alertas(ATENDENTE))
await medir('recuperação p1 · dono', () => recuperacao(DONO))
await medir('equipe · dono', () => equipe(DONO))
await medir('notificações · dono', () => notificacoes(ORG_GRANDE))
}

if (secoes.includes('relatorios')) {
console.log('\n— Relatórios (buildReport) —')
const ate = new Date(), dias = (n: number) => new Date(Date.now() - n * 86400000)
await medir('relatório diário', () => buildReport(ORG_GRANDE, 'daily', dias(1), ate), 5)
await medir('relatório semanal', () => buildReport(ORG_GRANDE, 'weekly', dias(7), ate), 5)
await medir('relatório por equipe (30 dias)', () => buildReport(ORG_GRANDE, 'agent', dias(30), ate), 3)
await medir('relatório oportunidades perdidas (30 dias)', () => buildReport(ORG_GRANDE, 'lost_opportunities', dias(30), ate), 3)
await medir('relatório promessas (30 dias)', () => buildReport(ORG_GRANDE, 'promises', dias(30), ate), 3)
}

if (secoes.includes('motor')) {
  console.log('\n— Motor —')
  await medir('retenção (purgeExpired)', () => purgeExpired(ORG_GRANDE, null), 3)
  await medirUmaVez('números do painel (recomputeMetrics)', () => recomputeMetrics(ORG_GRANDE, 'America/Sao_Paulo'))
  await medirUmaVez('números do painel (recomputeMetrics) 2ª vez', () => recomputeMetrics(ORG_GRANDE, 'America/Sao_Paulo'))
  // 1ª rodada processa as marcadas pela "ingestão"; as seguintes, só o que continua pendente
  cenario = 'motor analyzeOrganization'
  for (let i = 1; i <= 3; i++) {
    const t = performance.now()
    const s = await analyzeOrganization(ORG_GRANDE)
    const ms = Math.round(performance.now() - t)
    console.log(`motor rodada ${i}: ${s.conversations} conversas analisadas, ${s.alertsOpened} alertas abertos, ${s.alertsResolved} resolvidos — ${ms} ms`)
    resultados.push({ nome: `motor rodada ${i} (${s.conversations} conversas)`, n: 1, p50: ms, p95: ms, max: ms })
  }
  cenario = ''
  const t = performance.now()
  await analyzeOrganization('org_carga_p0')
  const ms = Math.round(performance.now() - t)
  console.log(`motor empresa pequena: ${ms} ms`)
  resultados.push({ nome: 'motor empresa pequena', n: 1, p50: ms, p95: ms, max: ms })
}

if (secoes.includes('ingestao')) {
  console.log('\n— Ingestão (ingestEvent em paralelo; --paralelo=N, padrão 10) —')
  const conn = `${ORG_GRANDE}_conn0`
  const PARALELO = Number((process.argv.find((a) => a.startsWith('--paralelo=')) ?? '--paralelo=10').slice(11)) || 10
  const TOTAL = 3000, CHATS = 300
  const base = Date.now() - 10 * 60000
  const rodada = Math.random().toString(36).slice(2, 7)
  const eventos = Array.from({ length: TOTAL }, (_, i) => ({
    eventId: `carga-${rodada}-${i}`, connectionId: conn, type: i % 3 === 2 ? 'message.sent' : 'message.received',
    occurredAt: new Date(base + i * 100).toISOString(),
    payload: { externalId: `carga-${rodada}-x${i}`, chatId: `5511${String(90000000 + (i % CHATS))}@s.whatsapp.net`, fromMe: i % 3 === 2, text: 'Oi, qual o valor da consulta?', pushName: `Carga ${i % CHATS}` },
  }))
  const lat: number[] = []
  let falhas = 0
  cenario = 'ingestão'
  const t0 = performance.now()
  let prox = 0
  await Promise.all(Array.from({ length: PARALELO }, async () => {
    while (prox < eventos.length) {
      const e = eventos[prox++]
      const t = performance.now()
      const r = await ingestEvent(e).catch(() => ({ ok: false }))
      lat.push(performance.now() - t)
      if (!r.ok) falhas += 1
    }
  }))
  cenario = ''
  const seg = (performance.now() - t0) / 1000
  const vazao = Math.round(TOTAL / seg)
  console.log(`${PARALELO} em paralelo: ${TOTAL} mensagens em ${seg.toFixed(1)} s = ${vazao} msg/s · latência p50 ${Math.round(pct(lat, 50))} ms, p95 ${Math.round(pct(lat, 95))} ms · falhas ${falhas}`)
  resultados.push({ nome: `ingestão ${TOTAL} msgs (${vazao} msg/s, ${falhas} falhas)`, n: TOTAL, p50: Math.round(pct(lat, 50)), p95: Math.round(pct(lat, 95)), max: Math.round(Math.max(...lat)) })
}

// ---------- planos de execução ----------
const linhas: string[] = []
const varreduras: string[] = []
for (const [sql, s] of sqls) {
  let plano: Array<{ detail: string }> = []
  try {
    plano = await client.$queryRawUnsafe(`EXPLAIN QUERY PLAN ${sql}`, ...(JSON.parse(s.params) as unknown[]))
  } catch (e) {
    plano = [{ detail: `(sem plano: ${e instanceof Error ? e.message.slice(0, 80) : e})` }]
  }
  const detalhes = plano.map((p) => p.detail)
  linhas.push(`### ${[...s.cenarios].join(', ')} · ${s.vezes}x · máx ${s.maxMs} ms\n${sql}\n  ${detalhes.join('\n  ')}\n`)
  // varredura de tabela inteira (sem índice) em tabela grande
  const ruins = detalhes.filter((d) => /^SCAN (main\.)?`?(Conversation|Message|Alert|AuditFinding|RevenueOpportunity|Contact|Notification|ConversationClassification|Promise|OpenQuestion|RecoveryItem|AgentMetric|DailyMetric|ConversationScore|RawChannelEvent)`?(?! USING)/.test(d))
  if (ruins.length) varreduras.push(`${s.maxMs.toString().padStart(5)} ms · ${[...s.cenarios][0]} · ${ruins.join(' | ')}`)
}
const saida = (process.argv.find((a) => a.startsWith('--saida=')) ?? '--saida=').slice(8).replace(/[^\w-]/g, '')
const planos = `carga-planos${saida ? '-' + saida : ''}.txt`, numeros = `carga-resultado${saida ? '-' + saida : ''}.json`
writeFileSync(join(process.cwd(), '.tmp', planos), linhas.join('\n'))
writeFileSync(join(process.cwd(), '.tmp', numeros), JSON.stringify(resultados, null, 2))
console.log(`\n— EXPLAIN QUERY PLAN: ${sqls.size} consultas distintas; ${varreduras.length} com varredura de tabela inteira —`)
for (const v of varreduras.sort().reverse()) console.log(v)
console.log(`\nplanos completos: .tmp/${planos} · números: .tmp/${numeros}`)
await client.$disconnect()
