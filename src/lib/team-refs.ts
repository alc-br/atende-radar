import { db } from './db'

/** Papéis que podem supervisionar uma equipe (Equipes › Criar equipe › Supervisor). */
export const SUPERVISOR_ROLES = ['supervisor', 'gestor', 'admin'] as const

/** Membros que podem ser supervisor (convite pendente incluso: a pessoa entra depois). Supervisores primeiro. */
export async function supervisorOptions(orgId: string) {
  const rows = await db.organizationMember.findMany({
    where: { organizationId: orgId, role: { in: [...SUPERVISOR_ROLES] }, status: { in: ['active', 'invited'] } },
    select: { id: true, name: true, role: true, status: true, team: true },
    orderBy: { name: 'asc' },
  })
  const rank = (r: string) => SUPERVISOR_ROLES.indexOf(r as (typeof SUPERVISOR_ROLES)[number])
  return rows.sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name, 'pt-BR'))
}

/**
 * Supervisor e conexões de uma equipe precisam pertencer à mesma organização. Devolve a mensagem de erro, ou null se ok.
 * O supervisor é um MEMBRO (papel supervisor, gestor ou admin). Equipes antigas guardavam um atendente: continuam valendo.
 */
export async function validateTeamRefs(
  orgId: string,
  supervisorId?: string | null,
  connectionIds?: string[]
): Promise<string | null> {
  if (supervisorId) {
    const member = await db.organizationMember.findFirst({
      where: { id: supervisorId, organizationId: orgId, role: { in: [...SUPERVISOR_ROLES] }, status: { in: ['active', 'invited'] } },
      select: { id: true },
    })
    const agent = member ? null : await db.agent.findFirst({ where: { id: supervisorId, organizationId: orgId }, select: { id: true } })
    if (!member && !agent) return 'supervisorId inválido'
  }
  if (connectionIds && connectionIds.length > 0) {
    const found = await db.whatsAppConnection.count({ where: { id: { in: connectionIds }, organizationId: orgId } })
    if (found !== new Set(connectionIds).size) return 'connectionIds inválido'
  }
  return null
}

/**
 * O escopo do supervisor vem da equipe gravada no membro: ao virar supervisor de uma equipe, o membro sem equipe
 * passa a ter esta (quem já tem outra equipe fica como está; o admin muda em Membros › equipe).
 */
export async function linkSupervisorTeam(orgId: string, supervisorId: string | null | undefined, teamName: string) {
  if (!supervisorId) return
  await db.organizationMember.updateMany({
    where: { id: supervisorId, organizationId: orgId, role: 'supervisor', OR: [{ team: null }, { team: '' }] },
    data: { team: teamName },
  })
}
