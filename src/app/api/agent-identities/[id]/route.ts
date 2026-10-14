import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { audit, type AuditAction } from '@/lib/audit'
import { conversationsOfIdentities, formatIdentity, IDENTITY_SELECT, reattributeConversations } from '@/lib/agent-identities'

// P5 · Confirmar / trocar / desfazer / "não é atendente" numa identidade do WhatsApp. Só admin e gestor; tudo auditado.
// Depois recalcula o atendente SÓ das conversas onde a identidade apareceu (e os indicadores, se algo mudou).
type Body = { action?: string; agentId?: string | null }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard('agents.manage')
    if (!g.ok) return g.res
    const orgId = g.auth.orgId
    const { id } = await params
    const j = await readJson<Body>(request)
    if (!j.ok) return j.res
    const { action, agentId } = j.body
    if (action !== 'confirm' && action !== 'ignore' && action !== 'undo') return badRequest('action deve ser confirm, ignore ou undo')

    const identity = await db.agentIdentity.findFirst({
      where: { id, connection: { organizationId: orgId } },
      select: { ...IDENTITY_SELECT, connection: { select: { name: true } } },
    })
    if (!identity) return NextResponse.json({ error: 'Identidade não encontrada' }, { status: 404 })

    let auditAction: AuditAction
    let data: { associationStatus: string; agentId: string | null; confirmedBy: string | null; confirmedAt: Date | null }
    let agentName: string | null = null
    if (action === 'confirm') {
      const target = agentId || identity.suggestedAgentId
      if (!target) return badRequest('Escolha o atendente')
      const agent = await db.agent.findFirst({ where: { id: target, organizationId: orgId, status: 'active' }, select: { id: true, name: true } })
      if (!agent) return badRequest('Atendente inválido')
      agentName = agent.name
      auditAction = identity.associationStatus === 'confirmed' && identity.agentId && identity.agentId !== agent.id ? 'agent_identity.changed' : 'agent_identity.confirmed'
      data = { associationStatus: 'confirmed', agentId: agent.id, confirmedBy: g.auth.memberId, confirmedAt: new Date() }
    } else if (action === 'ignore') {
      auditAction = 'agent_identity.ignored'
      data = { associationStatus: 'ignored', agentId: null, confirmedBy: g.auth.memberId, confirmedAt: new Date() }
    } else {
      auditAction = 'agent_identity.undone'
      data = { associationStatus: 'unconfirmed', agentId: null, confirmedBy: null, confirmedAt: null }
    }

    const updated = await db.agentIdentity.update({ where: { id }, data, select: IDENTITY_SELECT })
    const convIds = await conversationsOfIdentities([id])
    const conversationsUpdated = await reattributeConversations(orgId, convIds)

    await audit(g.auth, {
      action: auditAction,
      targetType: 'agent_identity',
      targetId: id,
      targetLabel: `${identity.displayName} · ${identity.connection.name}`,
      details: {
        kind: identity.kind,
        agentId: data.agentId,
        agentName,
        previousAgentId: identity.agentId,
        previousStatus: identity.associationStatus,
        conversations: convIds.length,
        changed: conversationsUpdated,
      },
    })

    const agents = await db.agent.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } })
    const memberNames = new Map(updated.confirmedBy ? [[g.auth.memberId, g.auth.name ?? g.auth.email]] : [])
    return NextResponse.json({
      success: true,
      identity: formatIdentity(updated, new Map(agents.map((a) => [a.id, a.name])), memberNames as Map<string, string>),
      conversationsUpdated,
    })
  } catch (error) {
    console.error('Agent identity PATCH error:', error)
    return NextResponse.json({ error: 'Falha ao atualizar a identidade' }, { status: 500 })
  }
}
