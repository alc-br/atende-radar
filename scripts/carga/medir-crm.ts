// Carga do CRM comercial (F7, metas do §13.4: lista p95 ≤ 500 ms, mutação p95 ≤ 800 ms, fila p95 ≤ 60 s). Semeia, se
// faltar, uma empresa de CRM grande (volume em CRM_TAMANHO) + 20 pequenas e mede, direto no banco (sem servidor), as
// MESMAS funções que as rotas /api/crm/** chamam (src/lib/crm/queries.ts, overview.ts, deals.ts, activities.ts, worker.ts).
// Só roda contra um arquivo dentro de .tmp (nunca dev.db/test.db/produção). Uso (PowerShell, na raiz do repositório):
//   $env:DATABASE_URL = "file:$PWD\.tmp\carga-crm.db"; bunx prisma db push --skip-generate
//   $env:NODE_ENV = "production"; bun scripts/carga/medir-crm.ts [--saida=nome]
// Com o banco de carga do AtendeRadar (scripts/carga/semear.ts) no mesmo arquivo, mede também a captura inicial do CRM
// sobre a empresa grande (20 mil conversas) até a rodada que não acha nada novo, e o atraso da fila em regime normal.
// Cada SQL executado passa por EXPLAIN QUERY PLAN no fim (.tmp/carga-crm-planos.txt). Nada aqui envia mensagem.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import { exigirBancoDeCarga, ORG_GRANDE } from './comum'

exigirBancoDeCarga()

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
const { createOrganizationDefaults } = await import('../../src/lib/org-defaults')
const { setCrmEnabled } = await import('../../src/lib/crm/tenant')
const { normName } = await import('../../src/lib/crm/text')
const q = await import('../../src/lib/crm/queries')
const { crmOverview } = await import('../../src/lib/crm/overview')
const { crmTx, createDeal, moveDealStage, closeDeal } = await import('../../src/lib/crm/deals')
const { createActivity } = await import('../../src/lib/crm/activities')
const { processCrmOutbox, outboxHealth } = await import('../../src/lib/crm/worker')
const { captureOrg, captureCrmChanges } = await import('../../src/lib/crm/capture')
await import('../../src/lib/crm/consumer') // a fila precisa do consumidor registrado, como na rota do tick
type OwnerScope = import('../../src/lib/crm/scope').OwnerScope

// Volume declarado (§13.4). A empresa grande é ~10x a maior carteira esperada no lançamento.
const CRM_TAMANHO = { pessoas: 10_000, empresas: 2_000, negocios: 5_000, abertos: 3_000, ganhos: 1_200, perdidos: 800, tarefas: 15_000, tarefasAbertas: 6_000, membros: 30, pequenas: 20 }
const ORG = 'org_crm_carga'

// gerador determinístico (mesma semente = mesmo banco)
let seed = 20261031
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
const NOW = Date.now()
const DAY = 86400000

async function emLotes<T>(rows: T[], tamanho: number, gravar: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += tamanho) await gravar(rows.slice(i, i + tamanho))
}

const SEGMENTOS = ['Varejo', 'Odontologia', 'Estética', 'Imobiliária', 'Educação', 'Serviços']
const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Íris', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula']
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Lima', 'Carvalho', 'Ribeiro', 'Almeida', 'Costa', 'Gomes']
const TAREFAS = ['Ligar para confirmar a proposta', 'Enviar o orçamento revisado', 'Retornar a mensagem', 'Agendar a visita', 'Cobrar a resposta']
const TIPOS = ['call', 'follow_up', 'meeting', 'email', 'task']
const MOTIVOS = ['price', 'competitor', 'no_response', 'timing', 'other']

interface Org { id: string; members: { id: string; team: string | null; role: string; email: string }[]; pipelineId: string; stageIds: string[] }

async function semearEmpresa(id: string, escala: number): Promise<Org> {
  const t0 = performance.now()
  const ownerEmail = `dono@${id}.carga.test`
  await db.organization.create({ data: { id, name: `Empresa ${id}`, displayName: `Empresa ${id}`, segment: 'varejo' } })
  await createOrganizationDefaults(db as never, id, ownerEmail)
  const nMembros = Math.max(3, Math.round(CRM_TAMANHO.membros * escala))
  const equipes = ['Equipe 1', 'Equipe 2', 'Equipe 3', 'Equipe 4']
  const members = [
    { id: `${id}_m_dono`, organizationId: id, userId: `${id}_u_dono`, name: 'Dono', email: ownerEmail, role: 'owner', team: null as string | null },
    ...equipes.slice(0, Math.max(1, Math.round(4 * escala))).map((t, i) => ({ id: `${id}_m_sup${i}`, organizationId: id, userId: `${id}_u_sup${i}`, name: `Supervisor ${i + 1}`, email: `supervisor${i + 1}@${id}.carga.test`, role: 'supervisor', team: t })),
  ]
  while (members.length < nMembros) {
    const i = members.length
    members.push({ id: `${id}_m_at${i}`, organizationId: id, userId: `${id}_u_at${i}`, name: `Vendedor ${i}`, email: `vendedor${i}@${id}.carga.test`, role: 'atendente', team: equipes[i % equipes.length] })
  }
  await db.organizationMember.createMany({ data: members })
  await setCrmEnabled(id, true, 'carga')
  const pipeline = await db.crmPipeline.findFirstOrThrow({ where: { organizationId: id }, include: { stages: { orderBy: { position: 'asc' } } } })
  const stageIds = pipeline.stages.map((s) => s.id)
  const donos = members.filter((m) => m.role !== 'owner').map((m) => m.id)

  const n = (k: keyof typeof CRM_TAMANHO) => Math.max(1, Math.round(CRM_TAMANHO[k] * escala))
  const companies = Array.from({ length: n('empresas') }, (_, i) => {
    const name = `Empresa Cliente ${i + 1} ${pick(SOBRENOMES)}`
    return { id: `${id}_co${i}`, organizationId: id, name, nameNorm: normName(name), segment: pick(SEGMENTOS), ownerMemberId: pick(donos), createdAt: new Date(NOW - rnd() * 365 * DAY) }
  })
  await emLotes(companies, 500, (lote) => db.crmCompany.createMany({ data: lote }))
  const people = Array.from({ length: n('pessoas') }, (_, i) => {
    const name = `${pick(NOMES)} ${pick(SOBRENOMES)} ${i + 1}`
    const email = `cliente${i + 1}@${id}.carga.test`
    return {
      id: `${id}_p${i}`, organizationId: id, name, nameNorm: normName(name), email, emailNorm: email, phoneLast4: String(1000 + (i % 9000)),
      companyId: rnd() < 0.6 ? companies[Math.floor(rnd() * companies.length)].id : null, ownerMemberId: rnd() < 0.85 ? pick(donos) : null,
      source: rnd() < 0.5 ? 'atenderadar' : 'manual', createdAt: new Date(NOW - rnd() * 365 * DAY), lastInteractionAt: new Date(NOW - rnd() * 60 * DAY),
    }
  })
  await emLotes(people, 500, (lote) => db.crmPerson.createMany({ data: lote }))
  const [abertos, ganhos] = [n('abertos'), n('ganhos')]
  const deals = Array.from({ length: n('negocios') }, (_, i) => {
    const status = i < abertos ? 'open' : i < abertos + ganhos ? 'won' : 'lost'
    const p = people[Math.floor(rnd() * people.length)]
    const amount = rnd() < 0.7 ? Math.round(500 + rnd() * 20000) * 100 : null
    const closedAt = status === 'open' ? null : new Date(NOW - rnd() * 90 * DAY)
    return {
      id: `${id}_d${i}`, organizationId: id, pipelineId: pipeline.id, stageId: pick(stageIds), title: `Proposta ${i + 1} · ${p.name}`, personId: p.id, companyId: p.companyId,
      ownerMemberId: rnd() < 0.9 ? pick(donos) : null, source: rnd() < 0.6 ? 'atenderadar' : 'manual', status, amountCents: amount, amountSource: amount ? 'declared' : 'unknown',
      estimatedAmountCents: amount ? null : rnd() < 0.5 ? Math.round(1000 + rnd() * 9000) * 100 : null, closedAt, lostReasonCode: status === 'lost' ? pick(MOTIVOS) : null,
      createdAt: new Date(NOW - (90 + rnd() * 200) * DAY), stageChangedAt: new Date(NOW - rnd() * 30 * DAY), updatedAt: new Date(NOW - rnd() * 30 * DAY),
    }
  })
  await emLotes(deals, 500, (lote) => db.crmDeal.createMany({ data: lote }))
  const nAbertas = n('tarefasAbertas')
  const tasks = Array.from({ length: n('tarefas') }, (_, i) => {
    const d = rnd() < 0.8 ? deals[Math.floor(rnd() * deals.length)] : null
    const open = i < nAbertas
    return {
      id: `${id}_t${i}`, organizationId: id, type: pick(TIPOS), title: pick(TAREFAS), dealId: d?.id ?? null, personId: d?.personId ?? people[Math.floor(rnd() * people.length)].id,
      ownerMemberId: d?.ownerMemberId ?? pick(donos), dueAt: new Date(NOW + (rnd() * 60 - 30) * DAY), status: open ? (rnd() < 0.8 ? 'open' : 'in_progress') : 'done',
      completedAt: open ? null : new Date(NOW - rnd() * 60 * DAY), createdAt: new Date(NOW - rnd() * 120 * DAY),
    }
  })
  await emLotes(tasks, 500, (lote) => db.crmActivity.createMany({ data: lote }))
  console.log(`  ${id}: ${members.length} membros, ${companies.length} empresas, ${people.length} pessoas, ${deals.length} negócios, ${tasks.length} tarefas · ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  return { id, members: members.map((m) => ({ id: m.id, team: m.team, role: m.role, email: m.email })), pipelineId: pipeline.id, stageIds }
}

async function carregarEmpresa(id: string): Promise<Org | null> {
  const org = await db.organization.findUnique({ where: { id }, select: { id: true } })
  if (!org) return null
  const members = await db.organizationMember.findMany({ where: { organizationId: id }, select: { id: true, team: true, role: true, email: true } })
  const pipeline = await db.crmPipeline.findFirstOrThrow({ where: { organizationId: id }, include: { stages: { orderBy: { position: 'asc' } } } })
  return { id, members, pipelineId: pipeline.id, stageIds: pipeline.stages.map((s) => s.id) }
}

console.log('— semeando (se faltar) —')
const grande = (await carregarEmpresa(ORG)) ?? (await semearEmpresa(ORG, 1))
for (let i = 0; i < CRM_TAMANHO.pequenas; i++) if (!(await carregarEmpresa(`${ORG}_p${i}`))) await semearEmpresa(`${ORG}_p${i}`, 0.02)
const contagem = {
  pessoas: await db.crmPerson.count({ where: { organizationId: ORG } }),
  empresas: await db.crmCompany.count({ where: { organizationId: ORG } }),
  negocios: await db.crmDeal.count({ where: { organizationId: ORG } }),
  tarefas: await db.crmActivity.count({ where: { organizationId: ORG } }),
  negociosNoBanco: await db.crmDeal.count(),
}
console.log(`  volume da empresa grande: ${JSON.stringify(contagem)}`)

// ---------- medição ----------
interface Resultado { nome: string; n: number; p50: number; p95: number; max: number; meta?: number }
const resultados: Resultado[] = []
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }
async function medir(nome: string, fn: (i: number) => Promise<unknown>, meta: number, n = 15) {
  cenario = nome
  await fn(0) // aquecimento (e captura do SQL)
  cenario = ''
  const ts: number[] = []
  for (let i = 1; i <= n; i++) {
    const t = performance.now()
    await fn(i)
    ts.push(performance.now() - t)
  }
  registrar(nome, ts, meta)
}
function registrar(nome: string, ts: number[], meta?: number) {
  const r = { nome, n: ts.length, p50: Math.round(pct(ts, 50)), p95: Math.round(pct(ts, 95)), max: Math.round(Math.max(...ts)), meta }
  resultados.push(r)
  console.log(`${nome.padEnd(58)} p50 ${String(r.p50).padStart(6)} ms   p95 ${String(r.p95).padStart(6)} ms   ${meta === undefined ? '(informativo)' : r.p95 <= meta ? 'ok' : `ACIMA da meta de ${meta} ms`}`)
}
async function medirUmaVez<T>(nome: string, fn: () => Promise<T>): Promise<T> {
  cenario = nome
  const t = performance.now()
  const out = await fn()
  const ms = Math.round(performance.now() - t)
  cenario = ''
  resultados.push({ nome, n: 1, p50: ms, p95: ms, max: ms })
  console.log(`${nome.padEnd(58)} ${String(ms).padStart(6)} ms (1 execução) ${out ? JSON.stringify(out).slice(0, 120) : ''}`)
  return out
}

const sup = grande.members.find((m) => m.role === 'supervisor')!
const vend = grande.members.find((m) => m.role === 'atendente')!
const TODOS: OwnerScope = { kind: 'all' }
const EQUIPE: OwnerScope = { kind: 'team', team: sup.team!, memberIds: grande.members.filter((m) => m.team === sup.team).map((m) => m.id) }
const PROPRIO: OwnerScope = { kind: 'own', memberId: vend.id, email: vend.email }
const LISTA = 500, MUTACAO = 800
const umDeal = await db.crmDeal.findFirstOrThrow({ where: { organizationId: ORG, status: 'open' }, orderBy: { id: 'asc' } })
const umaPessoa = await db.crmPerson.findFirstOrThrow({ where: { organizationId: ORG }, orderBy: { id: 'asc' } })
const umaEmpresa = await db.crmCompany.findFirstOrThrow({ where: { organizationId: ORG }, orderBy: { id: 'asc' } })
const periodo = { from: new Date(NOW - 30 * DAY), to: new Date(NOW + DAY) }

console.log('\n— leituras (as das telas) —')
await medir('negócios · lista (empresa toda, pág. 1)', () => q.listDeals(db, ORG, TODOS, {}), LISTA)
await medir('negócios · lista (busca por título)', () => q.listDeals(db, ORG, TODOS, { q: 'Ana' }), LISTA)
await medir('negócios · lista (por valor, pág. 40)', () => q.listDeals(db, ORG, TODOS, { sort: 'amount', page: '40' }), LISTA)
await medir('negócios · lista (vendedor: só os dele)', () => q.listDeals(db, ORG, PROPRIO, {}), LISTA)
await medir('negócios · quadro (empresa toda)', () => q.boardDeals(db, ORG, TODOS, {}), LISTA)
await medir('negócios · quadro (supervisor: equipe)', () => q.boardDeals(db, ORG, EQUIPE, {}), LISTA)
await medir('negócios · quadro (vendedor)', () => q.boardDeals(db, ORG, PROPRIO, {}), LISTA)
await medir('negócios · detalhe', () => q.dealDetail(db, ORG, TODOS, umDeal.id), LISTA)
await medir('contatos · lista (empresa toda)', () => q.listPeople(db, ORG, TODOS, {}), LISTA)
await medir('contatos · lista (busca por nome)', () => q.listPeople(db, ORG, TODOS, { q: 'carla' }), LISTA)
await medir('contatos · lista (vendedor: dele ou com negócio dele)', () => q.listPeople(db, ORG, PROPRIO, {}), LISTA)
await medir('contatos · lista (supervisor: equipe)', () => q.listPeople(db, ORG, EQUIPE, {}), LISTA)
await medir('contatos · detalhe', () => q.personDetail(db, ORG, TODOS, umaPessoa.id), LISTA)
await medir('empresas · lista', () => q.listCompanies(db, ORG, TODOS, {}), LISTA)
await medir('empresas · lista (vendedor)', () => q.listCompanies(db, ORG, PROPRIO, {}), LISTA)
await medir('empresas · detalhe', () => q.companyDetail(db, ORG, TODOS, umaEmpresa.id), LISTA)
await medir('tarefas · abertas', () => q.listActivities(db, ORG, TODOS, { status: 'open' }), LISTA)
await medir('tarefas · atrasadas', () => q.listActivities(db, ORG, TODOS, { overdue: '1' }), LISTA)
await medir('tarefas · do vendedor', () => q.listActivities(db, ORG, PROPRIO, {}), LISTA)
await medir('visão comercial · 30 dias (empresa toda)', () => crmOverview(db, ORG, TODOS, periodo), LISTA)
await medir('visão comercial · 30 dias (supervisor)', () => crmOverview(db, ORG, EQUIPE, periodo), LISTA)
await medir('visão comercial · 30 dias (vendedor)', () => crmOverview(db, ORG, PROPRIO, periodo), LISTA)
await medir('integração · estado da fila', () => outboxHealth(ORG), LISTA)

// a fila (outbox) leva só o que vem da Auditoria para o CRM; a gravação no CRM é uma transação com o registro, a versão
// e o histórico do negócio (CrmDealEvent)
console.log('\n— gravações (cada uma é uma transação: registro, versão e histórico) —')
const ator = { memberId: grande.members[0].id, label: 'Carga', origin: 'manual' as const }
const criados: { id: string; version: number }[] = []
await medir('negócio · criar', async () => {
  const d = await crmTx((tx) => createDeal(tx, ORG, TODOS, { title: `Carga ${criados.length}`, personId: umaPessoa.id, ownerMemberId: vend.id, amountCents: 150000 }, ator))
  criados.push({ id: d.id, version: d.version })
}, MUTACAO)
const alvo = await db.crmDeal.findMany({ where: { organizationId: ORG, status: 'open' }, orderBy: { id: 'desc' }, take: 40, select: { id: true, version: true, stageId: true } })
await medir('negócio · mudar de etapa', async (i) => {
  const d = alvo[i]
  const stage = grande.stageIds.find((s) => s !== d.stageId)!
  await crmTx((tx) => moveDealStage(tx, ORG, TODOS, d.id, stage, d.version, ator))
}, MUTACAO)
await medir('tarefa · criar ligada ao negócio', (i) => crmTx((tx) => createActivity(tx, ORG, TODOS, { type: 'call', title: 'Ligar', dealId: alvo[i].id, dueAt: new Date(NOW + DAY).toISOString() }, ator)), MUTACAO)
await medir('negócio · fechar como ganho', (i) => {
  const d = criados[i]
  return crmTx((tx) => closeDeal(tx, ORG, TODOS, d.id, { outcome: 'won', version: d.version, amountCents: 150000 }, ator))
}, MUTACAO)

// captura do AtendeRadar → CRM sobre a empresa grande do banco de carga (semear.ts), se existir
if (await db.organization.findUnique({ where: { id: ORG_GRANDE }, select: { id: true } })) {
  console.log('\n— captura da auditoria (empresa grande do banco de carga) —')
  await setCrmEnabled(ORG_GRANDE, true, 'carga')
  // atraso de cada evento = processado − gravado
  const atrasos = async (desde: Date) =>
    (await db.crmOutboxEvent.findMany({ where: { organizationId: ORG_GRANDE, processedAt: { not: null }, createdAt: { gte: desde } }, select: { createdAt: true, processedAt: true } }))
      .map((e) => e.processedAt!.getTime() - e.createdAt.getTime())
  const tCaptura = new Date()
  // cada rodada lê até 2000 linhas por recurso (BATCH × MAX_BATCHES em capture.ts); a janela inicial de uma empresa
  // grande leva algumas rodadas, e só a rodada depois delas é a "sem nada novo"
  for (let rodada = 1; rodada <= 20; rodada++) {
    const r = await medirUmaVez(`captura · rodada ${rodada} da janela inicial`, () => captureOrg(ORG_GRANDE).then((x) => ({ emitted: x.emitted, skipped: x.skipped, rows: x.rows })))
    if (!r.emitted) break
  }
  const ev = await db.crmOutboxEvent.count({ where: { organizationId: ORG_GRANDE, status: { in: ['pending', 'failed'] } } })
  await medirUmaVez(`captura · fila de ${ev} eventos até esvaziar`, async () => {
    let r = 0
    for (; r < 500; r++) {
      const s = await processCrmOutbox({ organizationId: ORG_GRANDE })
      if (!s.processed && !s.retry && !s.dead) break
    }
    return { rodadas: r, dlq: await db.crmOutboxEvent.count({ where: { organizationId: ORG_GRANDE, status: 'dead' } }), negocios: await db.crmDeal.count({ where: { organizationId: ORG_GRANDE } }) }
  })
  // na janela inicial o evento espera atrás de milhares de outros: informativo, sem meta
  const inicial = await atrasos(tCaptura)
  if (inicial.length) registrar(`fila · atraso na janela inicial (${inicial.length} eventos)`, inicial)

  // regime normal: o motor de análise reestima 200 oportunidades; a captura seguinte (no servidor, a cada 15 s) grava
  // os eventos e o "chute" de 1 s depois de gravar os processa. captureCrmChanges é a função do agendador
  // (background.ts): é ela que dá o chute; captureOrg sozinha só grava
  const reestimar = await db.revenueOpportunity.findMany({ where: { conversation: { organizationId: ORG_GRANDE }, status: 'active' }, orderBy: { id: 'asc' }, take: 200, select: { id: true, expectedValue: true } })
  for (const o of reestimar) await db.revenueOpportunity.update({ where: { id: o.id }, data: { expectedValue: o.expectedValue + 10 } })
  const tNormal = new Date()
  await medirUmaVez(`fila · ${reestimar.length} reestimativas, da captura ao CRM`, async () => {
    await captureCrmChanges()
    for (let i = 0; i < 600; i++) {
      if (!(await db.crmOutboxEvent.count({ where: { organizationId: ORG_GRANDE, status: { in: ['pending', 'processing', 'failed'] } } }))) break
      await new Promise((r) => setTimeout(r, 200))
    }
    return { emitted: await db.crmOutboxEvent.count({ where: { organizationId: ORG_GRANDE, createdAt: { gte: tNormal } } }), pendentes: await db.crmOutboxEvent.count({ where: { organizationId: ORG_GRANDE, status: { in: ['pending', 'processing', 'failed'] } } }), dlq: await db.crmOutboxEvent.count({ where: { organizationId: ORG_GRANDE, status: 'dead' } }) }
  })
  const normal = await atrasos(tNormal)
  if (normal.length) registrar(`fila · atraso em regime normal (${normal.length} eventos)`, normal, 60_000)
} else console.log('\n(captura não medida: o banco não tem a empresa grande de scripts/carga/semear.ts)')

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
  const ruins = detalhes.filter((d) => /^SCAN (main\.)?`?(CrmPerson|CrmCompany|CrmDeal|CrmActivity|CrmOutboxEvent|CrmDealEvent|CrmSuggestion|OrganizationMember)`?(?! USING)/.test(d))
  if (ruins.length) varreduras.push(`${s.maxMs.toString().padStart(5)} ms · ${[...s.cenarios][0]} · ${ruins.join(' | ')}`)
}
const saida = (process.argv.find((a) => a.startsWith('--saida=')) ?? '--saida=').slice(8).replace(/[^\w-]/g, '')
const planos = `carga-crm-planos${saida ? '-' + saida : ''}.txt`, numeros = `carga-crm-resultado${saida ? '-' + saida : ''}.json`
writeFileSync(join(process.cwd(), '.tmp', planos), linhas.join('\n'))
writeFileSync(join(process.cwd(), '.tmp', numeros), JSON.stringify({ volume: contagem, tamanho: CRM_TAMANHO, resultados }, null, 2))
const acima = resultados.filter((r) => r.meta && r.p95 > r.meta)
console.log(`\n— EXPLAIN QUERY PLAN: ${sqls.size} consultas distintas; ${varreduras.length} com varredura de tabela inteira —`)
for (const v of varreduras.sort().reverse()) console.log(v)
console.log(`\n${acima.length ? `${acima.length} medida(s) ACIMA da meta: ${acima.map((r) => r.nome).join('; ')}` : 'todas as medidas dentro da meta'}`)
console.log(`planos completos: .tmp/${planos} · números: .tmp/${numeros}`)
await client.$disconnect()
