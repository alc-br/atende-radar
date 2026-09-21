import { db } from './db'

/** Supervisor e conexões de uma equipe precisam pertencer à mesma organização. Devolve a mensagem de erro, ou null se ok. */
export async function validateTeamRefs(
  orgId: string,
  supervisorId?: string | null,
  connectionIds?: string[]
): Promise<string | null> {
  if (supervisorId) {
    const agent = await db.agent.findFirst({ where: { id: supervisorId, organizationId: orgId }, select: { id: true } })
    if (!agent) return 'supervisorId inválido'
  }
  if (connectionIds && connectionIds.length > 0) {
    const found = await db.whatsAppConnection.count({ where: { id: { in: connectionIds }, organizationId: orgId } })
    if (found !== new Set(connectionIds).size) return 'connectionIds inválido'
  }
  return null
}
