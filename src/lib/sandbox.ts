import type { Prisma } from '@prisma/client'
import { db } from './db'

/*
 * Empresas "isoladas": a de demonstração (DEMO_ORG_ID, dados fixos) e as de SIMULAÇÃO (Organization.isSimulation,
 * criadas pelo operador em Admin › Simulação ou por `bun scripts/simular.ts`).
 *
 * Nenhuma das duas: entra no motor agendado (analyzeAll), recebe e-mail de alerta ou relatório agendado, dispara
 * webhook, aparece nos números do Admin/Produto ou recebe aviso de fim de teste.
 *
 * Diferença: a SIMULAÇÃO passa pelas regras do plano (cotas → 402, teste vencido pausa a análise) porque é isso que
 * os cenários testam; a demonstração fica fora delas (seus dados são fixos).
 */

export const demoOrgId = () => process.env.DEMO_ORG_ID || 'org_seed_1'
export const isDemoOrg = (orgId: string | null | undefined) => !!orgId && orgId === demoOrgId()

/** Domínio dos membros sintéticos das empresas simuladas (.invalid nunca resolve: e-mail nunca é entregue). */
export const SIMULATION_EMAIL_DOMAIN = 'sim.invalid'
export const isSimulationEmail = (email: string | null | undefined) => !!email && email.trim().toLowerCase().endsWith(`@${SIMULATION_EMAIL_DOMAIN}`)

/** Provider das conexões simuladas: o gateway real (Baileys) nunca abre nem recebe eventos delas. */
export const SIMULATOR_PROVIDER = 'simulator'

/** O ambiente de simulação só existe com SIMULATION_ENABLED=on (desligado por padrão, inclusive em produção). */
export const simulationEnabled = () => process.env.SIMULATION_ENABLED === 'on'

export class SimulationDisabledError extends Error {
  constructor() {
    super('Ambiente de simulação desligado (SIMULATION_ENABLED=on liga)')
  }
}

// Uma empresa nasce simulada ou real e nunca muda: o resultado pode ficar guardado (só para empresas que existem).
const cache = new Map<string, boolean>()

export async function isSimulationOrg(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false
  const hit = cache.get(orgId)
  if (hit !== undefined) return hit
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { isSimulation: true } })
  if (!org) return false
  if (cache.size > 5000) cache.clear()
  cache.set(orgId, org.isSimulation)
  return org.isSimulation
}

/** Demonstração ou simulação: fora de e-mails, webhooks, relatórios agendados, analytics e métricas. */
export async function isIsolatedOrg(orgId: string | null | undefined): Promise<boolean> {
  return isDemoOrg(orgId) || (await isSimulationOrg(orgId))
}

/** Filtro de organizações reais (nem demonstração nem simulação). */
export const REAL_ORGS = (): Prisma.OrganizationWhereInput => ({ isSimulation: false, id: { not: demoOrgId() } })

/** Filtro de organizações que não são simulação (para os números do Admin, que já mostram a demonstração). */
export const NOT_SIMULATION: Prisma.OrganizationWhereInput = { isSimulation: false }

/** Ids das empresas simuladas (tabelas sem relação com Organization, como ProductEvent, filtram por aqui). */
export async function simulationOrgIds(): Promise<string[]> {
  return (await db.organization.findMany({ where: { isSimulation: true }, select: { id: true } })).map((o) => o.id)
}
