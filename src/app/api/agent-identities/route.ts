import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { can } from '@/lib/permissions'
import { KIND_RANK } from '@/lib/analysis/agents'
import { formatIdentity, IDENTITY_SELECT, isNoise } from '@/lib/agent-identities'

// P5 · Equipe › Identidades do WhatsApp: o que o sistema detectou em cada conexão, a sugestão e o vínculo confirmado.
// Leitura para quem vê a Equipe; confirmar/trocar/desfazer/ignorar só admin e gestor (PATCH /api/agent-identities/[id]).
export async function GET() {
  try {
    const g = await guard('agents.view')
    if (!g.ok) return g.res
    const orgId = g.auth.orgId

    const [connections, agents, identities, suggestedConversations] = await Promise.all([
      db.whatsAppConnection.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, phoneLast4: true }, orderBy: { name: 'asc' } }),
      db.agent.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } }),
      db.agentIdentity.findMany({ where: { connection: { organizationId: orgId } }, select: IDENTITY_SELECT }),
      db.conversation.count({ where: { organizationId: orgId, agentId: null, suggestedAgentId: { not: null }, NOT: { contact: { excluded: true } } } }),
    ])
    const names = new Map(agents.map((a) => [a.id, a.name]))
    const confirmers = await db.organizationMember.findMany({
      where: { organizationId: orgId, id: { in: identities.map((i) => i.confirmedBy).filter((x): x is string => !!x) } },
      select: { id: true, name: true },
    })
    const memberNames = new Map(confirmers.map((m) => [m.id, m.name]))

    let hidden = 0
    const visible = identities.filter((i) => {
      if (isNoise(i)) hidden += 1
      return !isNoise(i)
    })
    const formatted = visible
      .map((i) => formatIdentity(i, names, memberNames))
      .sort((a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) || b.conversationCount - a.conversationCount || a.displayName.localeCompare(b.displayName))

    return NextResponse.json({
      canManage: can(g.auth.role, 'agents.manage'),
      agents: agents.filter((a) => a.status === 'active').map((a) => ({ id: a.id, name: a.name })),
      connections: connections.map((c) => ({ ...c, identities: formatted.filter((i) => i.connectionId === c.id) })),
      summary: {
        confirmed: formatted.filter((i) => i.status === 'confirmed').length,
        pending: formatted.filter((i) => i.status === 'suggested' || i.status === 'unconfirmed').length,
        ignored: formatted.filter((i) => i.status === 'ignored').length,
        hidden,
        suggestedConversations,
      },
    })
  } catch (error) {
    console.error('Agent identities GET error:', error)
    return NextResponse.json({ error: 'Falha ao carregar as identidades' }, { status: 500 })
  }
}
