import { randomBytes } from 'node:crypto'
import { db } from '../db'
import { createOrganizationDefaults } from '../org-defaults'
import { enforceQuota } from '../quotas'
import { SIMULATION_EMAIL_DOMAIN, SIMULATOR_PROVIDER } from '../sandbox'
import type { Scenario } from './types'

// Monta a empresa simulada de um cenário. Usa os mesmos pedaços do cadastro real (regras e relatórios padrão,
// assinatura no plano escolhido, cotas do plano), com três marcas que a isolam:
//  · Organization.isSimulation = true (fica fora de motor agendado, e-mails, webhooks, cobrança, analytics, Admin);
//  · membros sintéticos <papel>.<execução>@sim.invalid SEM senha (o login comum recusa esse domínio);
//  · conexões com provider 'simulator' (o WhatsApp real nunca abre nem alimenta).

export const SIMULATION_TTL_MS = 24 * 3600_000
const DAY = 86400000

export interface SimOrg {
  orgId: string
  runKey: string
  connectionIds: string[]
  agentIds: string[]
}

/** Número fictício de 11 dígitos (DDD 11, celular) para uma conexão simulada. */
const fakePhone = () => `+55119${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`

export async function buildOrganization(scenario: Scenario, virtualStart: Date, now = new Date()): Promise<SimOrg> {
  const plan = await db.plan.findUnique({ where: { code: scenario.plan } })
  if (!plan) throw new Error(`Plano "${scenario.plan}" não existe no banco`)
  const runKey = randomBytes(4).toString('hex')
  const name = `[SIMULAÇÃO] ${scenario.title}`.slice(0, 120)
  const owner = `gestor.${runKey}@${SIMULATION_EMAIL_DOMAIN}`
  const settings = { outsideRule: 'atraso', ...(scenario.settings ?? {}) }

  const orgId = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name, displayName: name, adminEmail: owner, status: 'active', segment: 'geral',
        settingsJson: JSON.stringify(settings), isSimulation: true, simulationExpiresAt: new Date(now.getTime() + SIMULATION_TTL_MS),
      },
    })
    // assinatura ativa (período de 30 dias, sem cobrança: não há assinatura no provedor)
    await tx.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'active', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * DAY) } })
    await createOrganizationDefaults(tx, org.id, owner)
    // membros sintéticos (sem senha): gestor (admin) e um atendente
    await tx.organizationMember.createMany({
      data: [
        { organizationId: org.id, userId: `sim-admin-${runKey}`, name: 'Gestor (simulação)', email: owner, role: 'admin', status: 'active', alertEmails: false },
        { organizationId: org.id, userId: `sim-agent-${runKey}`, name: 'Atendente (simulação)', email: `atendente.${runKey}@${SIMULATION_EMAIL_DOMAIN}`, role: 'atendente', status: 'active', alertEmails: false },
      ],
    })
    return org.id
  })

  const sim: SimOrg = { orgId, runKey, connectionIds: [], agentIds: [] }
  for (let i = 0; i < (scenario.connections ?? 1); i++) {
    const r = await addConnection(sim, virtualStart)
    if (r.status !== 201) throw new Error(`O plano ${plan.name} não comporta ${scenario.connections} conexões (402 na ${i + 1}ª)`)
  }
  for (const agentName of scenario.agents ?? []) {
    const r = await addAgent(sim, agentName)
    if (r.status !== 201) throw new Error(`O plano ${plan.name} não comporta ${scenario.agents!.length} atendentes (402 em "${agentName}")`)
  }
  if (scenario.subscription === 'trial_expired') {
    // teste grátis que terminou 1 dia antes do início virtual (depois de montar conexões e atendentes, que a cota
    // de uma assinatura vencida bloquearia)
    const trialEnd = new Date(virtualStart.getTime() - DAY)
    await db.subscription.update({ where: { organizationId: orgId }, data: { status: 'trialing', trialEnd, currentPeriodStart: new Date(trialEnd.getTime() - 14 * DAY), currentPeriodEnd: trialEnd } })
  }
  return sim
}

/** Cadastra uma conexão simulada, passando pela cota do plano como a tela de Conexões. */
export async function addConnection(sim: SimOrg, at: Date): Promise<{ status: number }> {
  const blocked = await enforceQuota(sim.orgId, 'connections')
  if (blocked) return { status: blocked.status }
  const phone = fakePhone()
  const n = sim.connectionIds.length + 1
  const c = await db.whatsAppConnection.create({
    data: {
      organizationId: sim.orgId, name: `Número simulado ${n}`, provider: SIMULATOR_PROVIDER, phoneNumber: phone, phoneLast4: phone.slice(-4),
      status: 'connected', pairedAt: at, lastSeenAt: at,
    },
  })
  sim.connectionIds.push(c.id)
  return { status: 201 }
}

/** Cadastra um atendente, passando pela cota do plano como a tela de Atendentes. */
export async function addAgent(sim: SimOrg, name?: string): Promise<{ status: number }> {
  const blocked = await enforceQuota(sim.orgId, 'agents')
  if (blocked) return { status: blocked.status }
  const n = sim.agentIds.length + 1
  const agentName = name ?? `Atendente ${n}`
  const slug = agentName.normalize('NFD').replace(/[^\w]+/g, '.').replace(/^\.|\.$/g, '').toLowerCase() || `atendente${n}`
  const a = await db.agent.create({ data: { organizationId: sim.orgId, name: agentName, email: `${slug}.${sim.runKey}@${SIMULATION_EMAIL_DOMAIN}`, role: 'atendente' } })
  sim.agentIds.push(a.id)
  return { status: 201 }
}
