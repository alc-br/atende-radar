import { db } from '../db'
import { deleteSimulationOrganization } from '../org-deletion'
import { SimulationDisabledError, simulationEnabled } from '../sandbox'

// Limpeza das empresas simuladas. Separado do runner para o agendador (background.ts) importar só isto.

/** Apaga TODAS as empresas simuladas (só isSimulation; nunca uma real). */
export async function cleanSimulations(startedBy: string): Promise<{ deleted: number }> {
  if (!simulationEnabled()) throw new SimulationDisabledError()
  const deleted = await deleteWhere({ isSimulation: true })
  await db.simulationRun.create({ data: { kind: 'clean', startedBy, status: 'done', finishedAt: new Date(), resultJson: JSON.stringify({ deleted }) } })
  return { deleted }
}

/** Agendador (background.ts): apaga as simuladas que passaram das 24 h. Roda mesmo com a simulação desligada (só limpa). */
export async function purgeExpiredSimulations(now = new Date()): Promise<{ deleted: number }> {
  return { deleted: await deleteWhere({ isSimulation: true, simulationExpiresAt: { lte: now } }) }
}

async function deleteWhere(where: { isSimulation: true; simulationExpiresAt?: { lte: Date } }): Promise<number> {
  const orgs = await db.organization.findMany({ where, select: { id: true }, take: 200 })
  let deleted = 0
  for (const o of orgs) {
    try {
      if (await deleteSimulationOrganization(o.id)) deleted++ // confere isSimulation de novo antes de apagar
    } catch (e) {
      console.error('[simulation] falha ao apagar empresa simulada', o.id, e instanceof Error ? e.message : e)
    }
  }
  return deleted
}
