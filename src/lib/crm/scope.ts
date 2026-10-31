import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import { isOwnScopeOnly, supervisorTeam, type AuthContext } from '@/lib/api-auth'

// Escopo de dados do CRM por papel (docs/crm/04-api-crm.md › Permissões), sempre somado ao organizationId:
//  - atendente: só o que é dele (responsável = ele);
//  - supervisor com equipe: responsáveis da equipe + o que está sem responsável;
//  - admin e gestor (e supervisor sem equipe): a empresa toda.
// analista e visualizador não têm permissão de lista: só os agregados de /api/crm/overview.
// Os filtros recebem a empresa e o escopo (não o login) para servir também ao domínio, dentro da transação.

export type OwnerScope =
  | { kind: 'all' }
  | { kind: 'own'; memberId: string; email: string }
  | { kind: 'team'; team: string; memberIds: string[] }

type Client = PrismaClient | Prisma.TransactionClient

export async function ownerScope(auth: AuthContext): Promise<OwnerScope> {
  if (isOwnScopeOnly(auth)) return { kind: 'own', memberId: auth.memberId, email: auth.email }
  const team = supervisorTeam(auth)
  if (!team) return { kind: 'all' }
  const rows = await db.organizationMember.findMany({ where: { organizationId: auth.orgId, team: { not: null } }, select: { id: true, team: true } })
  return { kind: 'team', team, memberIds: rows.filter((r) => r.team?.trim() === team.trim()).map((r) => r.id) }
}

/** O responsável `ownerMemberId` está dentro do escopo? (mutação e atribuição) */
export function ownerInScope(scope: OwnerScope, ownerMemberId: string | null | undefined): boolean {
  if (scope.kind === 'all') return true
  if (scope.kind === 'own') return ownerMemberId === scope.memberId
  return !ownerMemberId || scope.memberIds.includes(ownerMemberId)
}

function ownerFilter(scope: OwnerScope): { ownerMemberId?: string | { in: string[] } | null; OR?: { ownerMemberId: { in: string[] } | null }[] } {
  if (scope.kind === 'own') return { ownerMemberId: scope.memberId }
  if (scope.kind === 'team') return { OR: [{ ownerMemberId: { in: scope.memberIds } }, { ownerMemberId: null }] }
  return {}
}

const ownerIs = (scope: Exclude<OwnerScope, { kind: 'all' }>) =>
  scope.kind === 'own' ? { ownerMemberId: scope.memberId } : { ownerMemberId: { in: scope.memberIds } }

// Nos filtros por relação ("tem negócio dele"), o organizationId vai também dentro da subconsulta. O Prisma gera um
// EXISTS ligado a cada linha de fora, e sem a empresa ele não usa os índices (organizationId, …): com 10 mil pessoas,
// a contagem da lista do vendedor levava 13 s (docs/crm/08-testes-e2e.md › Carga).

export function dealScopeWhere(organizationId: string, scope: OwnerScope): Prisma.CrmDealWhereInput {
  return { organizationId, ...ownerFilter(scope) }
}

/** Pessoa: a dele (responsável) ou a que tem negócio dele. */
export function personWhere(organizationId: string, scope: OwnerScope): Prisma.CrmPersonWhereInput {
  const base: Prisma.CrmPersonWhereInput = { organizationId }
  if (scope.kind === 'all') return base
  const owner = ownerIs(scope)
  const or: Prisma.CrmPersonWhereInput[] = [owner, { deals: { some: { organizationId, ...owner } } }]
  if (scope.kind === 'team') or.push({ ownerMemberId: null })
  return { ...base, OR: or }
}

export function companyWhere(organizationId: string, scope: OwnerScope): Prisma.CrmCompanyWhereInput {
  const base: Prisma.CrmCompanyWhereInput = { organizationId }
  if (scope.kind === 'all') return base
  const owner = ownerIs(scope)
  const or: Prisma.CrmCompanyWhereInput[] = [owner, { deals: { some: { organizationId, ...owner } } }, { people: { some: { organizationId, ...owner } } }]
  if (scope.kind === 'team') or.push({ ownerMemberId: null })
  return { ...base, OR: or }
}

/** Atividade: a dele ou a de negócio dele. */
export function activityWhere(organizationId: string, scope: OwnerScope): Prisma.CrmActivityWhereInput {
  const base: Prisma.CrmActivityWhereInput = { organizationId }
  if (scope.kind === 'all') return base
  const owner = ownerIs(scope)
  const or: Prisma.CrmActivityWhereInput[] = [owner, { deal: { organizationId, ...owner } }]
  if (scope.kind === 'team') or.push({ ownerMemberId: null })
  return { ...base, OR: or }
}

/** Sugestão: pelo responsável do negócio ou pelo atendente da conversa de origem. */
export async function suggestionWhere(client: Client, organizationId: string, scope: OwnerScope): Promise<Prisma.CrmSuggestionWhereInput> {
  const base: Prisma.CrmSuggestionWhereInput = { organizationId }
  if (scope.kind === 'all') return base
  if (scope.kind === 'own') {
    const agents = await client.agent.findMany({ where: { organizationId, email: scope.email }, select: { id: true } })
    return { ...base, OR: [{ ownerMemberId: scope.memberId }, { agentId: { in: agents.map((a) => a.id) } }] }
  }
  const agents = await client.agent.findMany({ where: { organizationId, team: scope.team }, select: { id: true } })
  return {
    ...base,
    OR: [{ ownerMemberId: { in: scope.memberIds } }, { agentId: { in: agents.map((a) => a.id) } }, { AND: [{ agentId: null }, { ownerMemberId: null }] }],
  }
}
