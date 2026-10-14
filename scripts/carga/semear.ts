// Banco de CARGA (T15): 1 empresa grande (20 mil conversas, 200 mil mensagens, alertas, membros, equipes) + 50 pequenas.
// Só roda contra um arquivo dentro de .tmp (nunca dev.db/test.db/produção). Uso (PowerShell, na raiz do repositório):
//   $env:DATABASE_URL = "file:$PWD\.tmp\carga.db"; bunx prisma db push --skip-generate; bun scripts/carga/semear.ts
// Grava .tmp/carga-credenciais.json (login de teste do dono da empresa grande, para medir a API com `next start`).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { exigirBancoDeCarga, ORG_GRANDE, TAMANHO } from './comum'

exigirBancoDeCarga()
const { db } = await import('../../src/lib/db')
const { createOrganizationDefaults } = await import('../../src/lib/org-defaults')
const { hashPassword } = await import('../../src/lib/passwords')

// gerador determinístico (mesma semente = mesmo banco)
let seed = 20261014
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
const chance = (p: number) => rnd() < p
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('')

const NOW = Date.now()
const MIN = 60000
const DAY = 86400000

async function emLotes<T>(rows: T[], tamanho: number, gravar: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += tamanho) await gravar(rows.slice(i, i + tamanho))
}

const ENTRADA = [
  'Oi, qual o valor da limpeza?', 'Quanto custa o clareamento?', 'Quero agendar uma consulta para sexta', 'Vocês têm horário amanhã de manhã?',
  'Bom dia, gostaria de saber o endereço', 'Pode mandar o link de pagamento', 'Tem desconto no pix?', 'Ainda estou aguardando resposta',
  'Obrigado!', 'Perfeito, combinado', 'Qual a forma de pagamento?', 'Quero fechar o pacote', 'Tenho uma dúvida sobre o tratamento',
]
const SAIDA = [
  'Olá! Tudo bem? Já te passo os valores.', 'O valor é R$ 250,00 à vista.', 'Temos horário amanhã às 9h, pode ser?', 'Vou verificar e te retorno até amanhã',
  'Segue o link de pagamento.', 'Combinado, te espero!', 'Fica na Rua das Flores, 100.', 'Te mando o orçamento hoje à tarde',
]
const INTENTS = ['preco', 'compra', 'agendamento', 'consulta', 'suporte', 'negociacao', null] as const
const STAGES = ['discovery', 'qualification', 'price', 'proposal', 'negotiation', 'decision', 'post_sale']
const SENTIMENTS = ['neutral', 'neutral', 'neutral', 'positive', 'frustrated', 'anxious']
const URGENCIES = ['low', 'normal', 'normal', 'high', 'critical']
const RULES = ['Cliente sem resposta', 'Orçamento pendente', 'Alta intenção sem retorno', 'Cliente frustrado', 'Promessa vencida']
const FINDING = ['no_response', 'pending_quote', 'slow_response', 'customer_frustrated', 'overdue_promise']

interface Opcoes { orgId: string; nome: string; conversas: number; msgsPorConversa: number; atendentes: number; equipes: number; conexoes: number; senhaDono?: string }

async function semearOrganizacao(o: Opcoes) {
  const t0 = performance.now()
  const org = o.orgId
  const ownerEmail = `dono@${org}.carga.test`
  await db.organization.create({ data: { id: org, name: o.nome, displayName: o.nome, segment: 'odontologia' } })
  await createOrganizationDefaults(db as never, org, ownerEmail)

  const conns = Array.from({ length: o.conexoes }, (_, i) => ({
    id: `${org}_conn${i}`, organizationId: org, name: `Número ${i + 1}`, phoneNumber: `+55119${String(10000000 + i).slice(-8)}`, phoneLast4: String(1000 + i), status: 'connected', pairedAt: new Date(NOW - 60 * DAY),
  }))
  await db.whatsAppConnection.createMany({ data: conns })

  const teamNames = Array.from({ length: o.equipes }, (_, i) => `Equipe ${i + 1}`)
  await db.team.createMany({ data: teamNames.map((n, i) => ({ id: `${org}_team${i}`, organizationId: org, name: n, code: `EQ${i + 1}` })) })
  const agents = Array.from({ length: o.atendentes }, (_, i) => ({
    id: `${org}_ag${i}`, organizationId: org, name: `Atendente ${i + 1}`, email: `atendente${i + 1}@${org}.carga.test`, team: teamNames[i % teamNames.length],
  }))
  await db.agent.createMany({ data: agents })

  const members = [
    { id: `${org}_m_dono`, organizationId: org, userId: `${org}_u_dono`, name: 'Dono', email: ownerEmail, role: 'owner', passwordHash: o.senhaDono ? hashPassword(o.senhaDono) : null, emailVerifiedAt: new Date(NOW) },
    ...teamNames.map((t, i) => ({ id: `${org}_m_sup${i}`, organizationId: org, userId: `${org}_u_sup${i}`, name: `Supervisor ${i + 1}`, email: `supervisor${i + 1}@${org}.carga.test`, role: 'supervisor', team: t })),
    ...agents.map((a, i) => ({ id: `${org}_m_at${i}`, organizationId: org, userId: `${org}_u_at${i}`, name: a.name, email: a.email, role: 'atendente', team: a.team })),
  ]
  await db.organizationMember.createMany({ data: members })

  const contacts: Array<Record<string, unknown>> = []
  const convs: Array<Record<string, unknown>> = []
  const msgs: Array<Record<string, unknown>> = []
  const opps: Array<Record<string, unknown>> = []
  const alerts: Array<Record<string, unknown>> = []
  const findings: Array<Record<string, unknown>> = []
  const promises: Array<Record<string, unknown>> = []
  const questions: Array<Record<string, unknown>> = []
  const classes: Array<Record<string, unknown>> = []
  const scores: Array<Record<string, unknown>> = []
  const notifs: Array<Record<string, unknown>> = []
  const recov: Array<Record<string, unknown>> = []

  for (let i = 0; i < o.conversas; i++) {
    const cid = `${org}_c${i}`
    const contactId = `${org}_ct${i}`
    const conn = conns[i % conns.length]
    // abertura espalhada em 120 dias, mais conversas nos dias recentes
    const openedAt = new Date(NOW - Math.floor(Math.pow(rnd(), 1.6) * 120 * DAY) - 30 * MIN)
    const recent = NOW - openedAt.getTime() < 2 * DAY
    let status: string
    if (recent) status = chance(0.35) ? 'waiting_company' : 'waiting_customer'
    else status = chance(0.03) ? 'waiting_customer' : chance(0.75) ? 'closed' : chance(0.5) ? 'won' : 'lost'
    const open = status === 'waiting_company' || status === 'waiting_customer'

    // mensagens alternadas, começando pelo cliente; esperando a empresa = cliente falou por último
    let n = Math.max(2, Math.round(o.msgsPorConversa * (0.5 + rnd())))
    if (status === 'waiting_company' && n % 2 === 0) n += 1
    if (status !== 'waiting_company' && n % 2 === 1) n += 1
    let t = openedAt.getTime()
    let lastIn = 0, lastOut = 0
    const ultimaPermitida = NOW - 2 * MIN
    for (let k = 0; k < n; k++) {
      t = Math.min(ultimaPermitida, t + Math.floor(1 + rnd() * 25) * MIN)
      const inbound = k % 2 === 0
      if (inbound) lastIn = t
      else lastOut = t
      msgs.push({
        id: `${cid}_m${k}`, conversationId: cid, connectionId: conn.id, externalId: `${cid}_x${k}`, direction: inbound ? 'inbound' : 'outbound', senderType: inbound ? 'customer' : 'agent',
        text: inbound ? pick(ENTRADA) : pick(SAIDA), occurredAt: new Date(t), createdAt: new Date(t),
      })
    }
    const intent = pick(INTENTS)
    const agentIdx = chance(0.85) ? Math.floor(rnd() * agents.length) : -1
    const hasOpp = intent === 'preco' || intent === 'compra' || intent === 'agendamento' || intent === 'negociacao'
    const value = hasOpp ? Math.round(150 + rnd() * 3000) : 0
    const closedAt = open ? null : new Date(t + 30 * MIN)
    contacts.push({ id: contactId, organizationId: org, connectionId: conn.id, displayName: `Cliente ${i + 1}`, phoneHash: hex(64), phoneLast4: String(1000 + (i % 9000)), firstSeenAt: openedAt, lastSeenAt: new Date(t) })
    convs.push({
      id: cid, organizationId: org, connectionId: conn.id, contactId, agentId: agentIdx >= 0 ? agents[agentIdx].id : null, operationalStatus: status,
      inferredStage: pick(STAGES), primaryIntent: intent, urgency: pick(URGENCIES), sentiment: pick(SENTIMENTS), score: Math.round(40 + rnd() * 55),
      riskScore: open ? +(rnd()).toFixed(2) : 0, potentialValue: open || status === 'lost' ? value : 0, confidence: +(0.4 + rnd() * 0.35).toFixed(2),
      lastInboundAt: lastIn ? new Date(lastIn) : null, lastOutboundAt: lastOut ? new Date(lastOut) : null,
      waitingSince: status === 'waiting_company' ? new Date(lastIn) : null, needsAnalysisAt: open && chance(0.2) ? new Date(NOW) : null,
      openedAt, closedAt, createdAt: openedAt, updatedAt: new Date(closedAt?.getTime() ?? t),
    })
    for (const type of ['intent', 'sentiment', 'urgency', 'stage']) {
      classes.push({ id: `${cid}_cl_${type}`, conversationId: cid, classificationType: type, label: type === 'intent' ? intent ?? 'consulta' : 'neutral', confidence: 0.6, source: 'heuristic', createdAt: openedAt })
    }
    scores.push({ id: `${cid}_sc`, conversationId: cid, total: 70, componentScores: '{}', calculatedAt: new Date(t) })
    if (hasOpp) {
      opps.push({
        id: `${cid}_op`, conversationId: cid, status: open ? 'active' : status === 'won' ? 'won' : 'lost', baseTicket: value, expectedValue: Math.round(value * 0.18),
        rangeLow: Math.round(value * 0.1), rangeHigh: Math.round(value * 0.3), confidence: 0.6, createdAt: openedAt, updatedAt: new Date(t),
      })
    }
    if (chance(0.1)) {
      promises.push({ id: `${cid}_pr`, conversationId: cid, sourceMessage: `${cid}_m1`, promisorAgent: agentIdx >= 0 ? agents[agentIdx].name : 'Empresa', action: 'Enviar orçamento', dueAt: new Date(openedAt.getTime() + DAY), status: open ? 'open' : 'kept', confidence: 0.6 })
    }
    if (chance(0.05)) questions.push({ id: `${cid}_q`, conversationId: cid, sourceMessage: `${cid}_m0`, normalizedQuestion: 'qual o valor?', askedAt: openedAt, status: open ? 'open' : 'answered', confidence: 0.6 })

    // alertas: abertos nas que esperam a empresa; resolvidos/dispensados em metade das encerradas
    const ruleIdx = Math.floor(rnd() * RULES.length)
    const alertStatus = status === 'waiting_company' ? 'new' : !open && chance(0.5) ? pick(['resolved', 'resolved', 'resolved', 'dismissed', 'false_positive']) : null
    if (alertStatus) {
      const created = new Date(Math.min(NOW - MIN, openedAt.getTime() + 40 * MIN))
      findings.push({ id: `${cid}_f`, conversationId: cid, type: FINDING[ruleIdx], severity: pick(['low', 'medium', 'high', 'critical']), status: alertStatus === 'new' ? 'new' : 'resolved', detectedAt: created, confidence: 0.6, createdAt: created })
      alerts.push({
        id: `${cid}_al`, organizationId: org, conversationId: cid, findingId: `${cid}_f`, ruleName: RULES[ruleIdx], severity: pick(['low', 'medium', 'high', 'critical']),
        title: `${RULES[ruleIdx]}: Cliente ${i + 1}`, description: 'Última mensagem do cliente: "qual o valor?"', customerName: `Cliente ${i + 1}`, agentName: agentIdx >= 0 ? agents[agentIdx].name : null,
        status: alertStatus, potentialValue: value || null, confidence: 0.6, createdAt: created, updatedAt: created,
      })
      if (NOW - created.getTime() < 30 * DAY) notifs.push({ id: `${cid}_n`, organizationId: org, type: 'alert', title: `${RULES[ruleIdx]}: Cliente ${i + 1}`, message: 'qual o valor?', data: JSON.stringify({ alertId: `${cid}_al`, conversationId: cid }), read: chance(0.7), createdAt: created })
    }
    if (hasOpp && (status === 'lost' || status === 'waiting_company') && chance(0.4)) {
      recov.push({ id: `${cid}_rc`, organizationId: org, conversationId: cid, opportunityId: `${cid}_op`, agentId: agentIdx >= 0 ? agents[agentIdx].id : null, reason: 'Abandono do cliente', priorityScore: +(rnd()).toFixed(2), status: pick(['new', 'in_progress', 'recovered', 'lost']), customerName: `Cliente ${i + 1}`, createdAt: new Date(t), updatedAt: new Date(t) })
    }
  }

  // ordem respeita as chaves estrangeiras
  await emLotes(contacts, 2000, (l) => db.contact.createMany({ data: l as never }))
  await emLotes(convs, 1000, (l) => db.conversation.createMany({ data: l as never }))
  await emLotes(msgs, 2500, (l) => db.message.createMany({ data: l as never }))
  await emLotes(opps, 2000, (l) => db.revenueOpportunity.createMany({ data: l as never }))
  await emLotes(findings, 2000, (l) => db.auditFinding.createMany({ data: l as never }))
  await emLotes(alerts, 1500, (l) => db.alert.createMany({ data: l as never }))
  await emLotes(promises, 2000, (l) => db.promise.createMany({ data: l as never }))
  await emLotes(questions, 2000, (l) => db.openQuestion.createMany({ data: l as never }))
  await emLotes(classes, 3000, (l) => db.conversationClassification.createMany({ data: l as never }))
  await emLotes(scores, 3000, (l) => db.conversationScore.createMany({ data: l as never }))
  await emLotes(notifs, 2000, (l) => db.notification.createMany({ data: l as never }))
  await emLotes(recov, 1500, (l) => db.recoveryItem.createMany({ data: l as never }))

  // histórico diário do painel e do desempenho por atendente (120 dias)
  const days = Array.from({ length: 120 }, (_, d) => new Date(NOW - d * DAY).toISOString().slice(0, 10))
  await db.dailyMetric.createMany({
    data: days.map((date) => ({ organizationId: org, date, conversationsStarted: Math.round(o.conversas / 120), customersWaiting: 5, medianFirstResponse: 8.5, opportunitiesDetected: 20, opportunitiesAtRisk: 3, overduePromises: 1, potentialValueAtRisk: 4200, overallScore: 71, messagesReceived: 800, messagesSent: 780 })),
  })
  await emLotes(agents.flatMap((a) => days.map((date) => ({ organizationId: org, agentId: a.id, date, conversations: 4, avgResponseTime: 9, score: 70 + Math.round(rnd() * 20), opportunitiesHandled: 2, opportunitiesLost: 1, promisesKept: 1, promisesTotal: 2 }))), 2000, (l) => db.agentMetric.createMany({ data: l }))
  await emLotes(Array.from({ length: Math.round(o.conversas / 4) }, (_, i) => ({ organizationId: org, actorEmail: ownerEmail, actorRole: 'owner', action: pick(['alert.resolved', 'member.updated', 'settings.updated', 'report.exported']), createdAt: new Date(NOW - Math.floor(rnd() * 120 * DAY)), targetId: `x${i}` })), 2000, (l) => db.auditLog.createMany({ data: l }))
  await db.reportRun.createMany({ data: Array.from({ length: 60 }, (_, i) => ({ organizationId: org, reportType: pick(['daily', 'weekly', 'agent']), status: 'completed', periodStart: new Date(NOW - (i + 1) * DAY), periodEnd: new Date(NOW - i * DAY), createdAt: new Date(NOW - i * DAY) })) })

  const ms = Math.round(performance.now() - t0)
  return { conversas: convs.length, mensagens: msgs.length, alertas: alerts.length, ms }
}

const senha = `Carga-${randomBytes(9).toString('base64url')}`
const grande = await semearOrganizacao({ orgId: ORG_GRANDE, nome: 'Clínica Carga Grande', conversas: TAMANHO.conversas, msgsPorConversa: TAMANHO.mensagens / TAMANHO.conversas, atendentes: 40, equipes: 5, conexoes: 3, senhaDono: senha })
console.log(`empresa grande: ${grande.conversas} conversas, ${grande.mensagens} mensagens, ${grande.alertas} alertas (${grande.ms} ms)`)
let pequenas = 0
for (let i = 0; i < 50; i++) {
  const r = await semearOrganizacao({ orgId: `org_carga_p${i}`, nome: `Pequena ${i + 1}`, conversas: 100, msgsPorConversa: 6, atendentes: 3, equipes: 1, conexoes: 1 })
  pequenas += r.conversas
}
console.log(`50 empresas pequenas: ${pequenas} conversas`)
writeFileSync(join(process.cwd(), '.tmp', 'carga-credenciais.json'), JSON.stringify({ email: `dono@${ORG_GRANDE}.carga.test`, password: senha }, null, 2))
const [c, m] = await Promise.all([db.conversation.count(), db.message.count()])
console.log(`total no banco: ${c} conversas, ${m} mensagens`)
await db.$disconnect()
