import { db } from './db'
import { decideAgent, identityKeysOf, resolveAttribution, suggestAgent, type IdentityKey } from './analysis/agents'
import { recomputeMetrics } from './analysis/metrics'

// P5 · Identidades do WhatsApp ↔ atendentes (§18.2). Detecção e sugestão automáticas; vínculo só com confirmação manual.

type AgentLite = { id: string; name: string }
type MessageLite = { direction: string; text: string | null; externalId: string | null; occurredAt: Date }

const OPEN_RECOVERY = ['new', 'assigned', 'in_progress']
const OPEN_ALERT = ['new', 'acknowledged', 'in_progress']

/**
 * Registra em quais identidades a conversa apareceu (idempotente: refaz a contagem a partir das mensagens).
 * Identidade nova já nasce com a sugestão. Devolve os ids das identidades tocadas.
 */
export async function recordSightings(
  conv: { id: string; connectionId: string | null },
  msgs: MessageLite[],
  ctx: { connectionName: string; agents: AgentLite[] }
): Promise<string[]> {
  if (!conv.connectionId) return []
  const byRef = new Map<string, { key: IdentityKey; count: number; first: Date; last: Date }>()
  for (const m of msgs) {
    for (const key of identityKeysOf(m)) {
      const s = byRef.get(key.ref)
      if (!s) byRef.set(key.ref, { key, count: 1, first: m.occurredAt, last: m.occurredAt })
      else {
        s.count += 1
        if (m.occurredAt < s.first) s.first = m.occurredAt
        if (m.occurredAt > s.last) s.last = m.occurredAt
      }
    }
  }
  if (byRef.size === 0) return []

  const existing = await db.agentIdentity.findMany({
    where: { connectionId: conv.connectionId, externalRef: { in: [...byRef.keys()] } },
    orderBy: { validFrom: 'asc' },
    select: { id: true, externalRef: true },
  })
  const touched: string[] = []
  for (const [ref, s] of byRef) {
    let identityId = existing.find((e) => e.externalRef === ref)?.id
    if (!identityId) {
      const sug = suggestAgent({ kind: s.key.kind, displayName: s.key.displayName, conversationCount: 1 }, ctx)
      identityId = (
        await db.agentIdentity.create({
          data: {
            connectionId: conv.connectionId, externalRef: ref, kind: s.key.kind, displayName: s.key.displayName,
            suggestedAgentId: sug.agentId, confidence: sug.confidence, suggestionReason: sug.reason, firstSeenAt: s.first, lastSeenAt: s.last,
          },
          select: { id: true },
        })
      ).id
    }
    await db.conversationIdentity.upsert({
      where: { conversationId_identityId: { conversationId: conv.id, identityId } },
      create: { conversationId: conv.id, identityId, messageCount: s.count, firstSeenAt: s.first, lastSeenAt: s.last },
      update: { messageCount: s.count, firstSeenAt: s.first, lastSeenAt: s.last },
    })
    touched.push(identityId)
  }
  return touched
}

/** Atualiza nº de conversas, nº de mensagens e quando a identidade foi vista pela primeira/última vez. */
export async function refreshIdentityStats(identityIds: string[]) {
  if (identityIds.length === 0) return
  const stats = await db.conversationIdentity.groupBy({
    by: ['identityId'],
    where: { identityId: { in: identityIds } },
    _count: { _all: true },
    _sum: { messageCount: true },
    _min: { firstSeenAt: true },
    _max: { lastSeenAt: true },
  })
  for (const s of stats) {
    await db.agentIdentity.update({
      where: { id: s.identityId },
      data: { conversationCount: s._count._all, messageCount: s._sum.messageCount ?? 0, firstSeenAt: s._min.firstSeenAt, lastSeenAt: s._max.lastSeenAt },
    })
  }
}

/** Refaz a sugestão de todas as identidades da empresa (atendentes entram e saem). Devolve as que trocaram de atendente sugerido. */
export async function refreshSuggestions(orgId: string, agents: AgentLite[]): Promise<string[]> {
  const identities = await db.agentIdentity.findMany({
    where: { connection: { organizationId: orgId } },
    select: { id: true, kind: true, displayName: true, conversationCount: true, suggestedAgentId: true, confidence: true, suggestionReason: true, connection: { select: { name: true } } },
  })
  const changed: string[] = []
  for (const i of identities) {
    const s = suggestAgent(i, { connectionName: i.connection.name, agents })
    if (s.agentId === i.suggestedAgentId && s.confidence === i.confidence && s.reason === i.suggestionReason) continue
    await db.agentIdentity.update({ where: { id: i.id }, data: { suggestedAgentId: s.agentId, confidence: s.confidence, suggestionReason: s.reason } })
    if (s.agentId !== i.suggestedAgentId) changed.push(i.id)
  }
  return changed
}

/** Atribuição (confirmado/sugerido) de cada conversa a partir das identidades vistas nela. */
export async function attributionFor(convIds: string[], activeAgentIds: Set<string>) {
  const rows = await db.conversationIdentity.findMany({
    where: { conversationId: { in: convIds } },
    select: { conversationId: true, firstSeenAt: true, identity: { select: { kind: true, associationStatus: true, agentId: true, suggestedAgentId: true } } },
  })
  const out = new Map<string, ReturnType<typeof resolveAttribution>>()
  for (const id of convIds) {
    const mine = rows.filter((r) => r.conversationId === id).map((r) => ({ ...r.identity, firstSeenAt: r.firstSeenAt }))
    out.set(id, resolveAttribution(mine, activeAgentIds))
  }
  return out
}

// ---------- formato da API (tela Equipe › Identidades do WhatsApp) ----------

export const IDENTITY_SELECT = {
  id: true, connectionId: true, kind: true, displayName: true, associationStatus: true, agentId: true, suggestedAgentId: true,
  confidence: true, suggestionReason: true, conversationCount: true, messageCount: true, lastSeenAt: true, confirmedAt: true, confirmedBy: true,
} as const

type IdentityRow = {
  id: string; connectionId: string; kind: string; displayName: string; associationStatus: string; agentId: string | null; suggestedAgentId: string | null
  confidence: number; suggestionReason: string | null; conversationCount: number; messageCount: number; lastSeenAt: Date | null; confirmedAt: Date | null; confirmedBy: string | null
}

/** Assinatura sem sugestão, sem decisão e vista em uma conversa só: provavelmente "Rótulo: valor", não gente. Fica fora da lista. */
export const isNoise = (i: Pick<IdentityRow, 'kind' | 'associationStatus' | 'suggestedAgentId' | 'conversationCount'>) =>
  i.kind === 'signature' && i.associationStatus === 'unconfirmed' && !i.suggestedAgentId && i.conversationCount < 2

/** Nível de confiança para a tela: alta ≥ 0,8 · média ≥ 0,6 · baixa abaixo disso. */
export const confidenceLevel = (c: number) => (c >= 0.8 ? 'alta' : c >= 0.6 ? 'media' : 'baixa')

/** Estado exibido: confirmed (vínculo confirmado) · suggested (palpite, falta confirmar) · unconfirmed (sem palpite) · ignored (não é atendente). */
export function formatIdentity(i: IdentityRow, agentNames: Map<string, string>, memberNames: Map<string, string>) {
  const status = i.associationStatus === 'confirmed' ? 'confirmed' : i.associationStatus === 'ignored' ? 'ignored' : i.suggestedAgentId ? 'suggested' : 'unconfirmed'
  const ref = (id: string | null) => (id && agentNames.has(id) ? { id, name: agentNames.get(id)! } : null)
  return {
    id: i.id,
    connectionId: i.connectionId,
    kind: i.kind,
    displayName: i.displayName,
    status,
    agent: status === 'confirmed' ? ref(i.agentId) : null,
    suggestedAgent: ref(i.suggestedAgentId),
    confidence: i.suggestedAgentId ? +i.confidence.toFixed(2) : null,
    confidenceLevel: i.suggestedAgentId ? confidenceLevel(i.confidence) : null,
    reason: i.suggestionReason,
    conversationCount: i.conversationCount,
    messageCount: i.messageCount,
    lastSeenAt: i.lastSeenAt?.toISOString() ?? null,
    confirmedAt: i.confirmedAt?.toISOString() ?? null,
    confirmedByName: i.confirmedBy ? memberNames.get(i.confirmedBy) ?? null : null,
  }
}

/** Conversas (da empresa) onde a identidade apareceu. */
export async function conversationsOfIdentities(identityIds: string[]): Promise<string[]> {
  if (identityIds.length === 0) return []
  const rows = await db.conversationIdentity.findMany({ where: { identityId: { in: identityIds } }, select: { conversationId: true }, distinct: ['conversationId'] })
  return rows.map((r) => r.conversationId)
}

/**
 * Recalcula SÓ o atendente das conversas indicadas (depois de confirmar/trocar/desfazer/ignorar um vínculo).
 * Barato: não relê nem reclassifica mensagens, só as identidades já registradas. Leva junto o nome do atendente
 * dos alertas abertos e o responsável dos itens de recuperação abertos. Devolve quantas conversas mudaram.
 */
export async function reattributeConversations(orgId: string, convIds: string[], opts: { metrics?: boolean } = {}): Promise<number> {
  if (convIds.length === 0) return 0
  const [agents, convs, feedbacks] = await Promise.all([
    db.agent.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, status: true } }),
    db.conversation.findMany({ where: { organizationId: orgId, id: { in: convIds } }, select: { id: true, agentId: true, agentAttribution: true, suggestedAgentId: true } }),
    db.classificationFeedback.findMany({ where: { organizationId: orgId, targetType: 'agent', targetId: { in: convIds } }, select: { targetId: true } }),
  ])
  const active = new Set(agents.filter((a) => a.status === 'active').map((a) => a.id))
  const nameOf = new Map(agents.map((a) => [a.id, a.name]))
  const manual = new Set(feedbacks.map((f) => f.targetId))
  const attr = await attributionFor(convs.map((c) => c.id), active)

  let changed = 0
  for (const c of convs) {
    const next = decideAgent(c, attr.get(c.id)!, manual.has(c.id))
    if (next.agentId === c.agentId && next.agentAttribution === c.agentAttribution && next.suggestedAgentId === c.suggestedAgentId) continue
    changed += 1
    await db.conversation.update({ where: { id: c.id }, data: next })
    if (next.agentId !== c.agentId) {
      const name = next.agentId ? nameOf.get(next.agentId) ?? null : null
      await db.alert.updateMany({ where: { organizationId: orgId, conversationId: c.id, status: { in: OPEN_ALERT } }, data: { agentName: name } })
      await db.recoveryItem.updateMany({ where: { organizationId: orgId, conversationId: c.id, status: { in: OPEN_RECOVERY } }, data: { agentId: next.agentId, originalAgentName: name } })
    }
  }
  if (changed > 0 && opts.metrics !== false) {
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } })
    await recomputeMetrics(orgId, org?.timezone || 'America/Sao_Paulo')
  }
  return changed
}
