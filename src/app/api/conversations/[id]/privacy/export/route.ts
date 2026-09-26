import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, notFound } from '@/lib/api-auth'
import { audit } from '@/lib/audit'

// Portabilidade (LGPD): tudo o que a empresa guarda sobre UM cliente final, em JSON legível, para entregar ao titular.
// Só quem configura a empresa (privacy.manage). O telefone completo nunca é guardado, então nunca sai daqui.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('privacy.manage')
  if (!g.ok) return g.res
  const { id } = await params

  const conv = await db.conversation.findFirst({ where: { id, organizationId: g.auth.orgId }, select: { id: true, contactId: true } })
  if (!conv) return notFound('Conversation')

  const [org, contact, conversations] = await Promise.all([
    db.organization.findUnique({ where: { id: g.auth.orgId }, select: { name: true, displayName: true } }),
    conv.contactId ? db.contact.findUnique({ where: { id: conv.contactId } }) : null,
    db.conversation.findMany({
      where: conv.contactId ? { organizationId: g.auth.orgId, contactId: conv.contactId } : { id: conv.id },
      orderBy: { openedAt: 'asc' },
      include: {
        connection: { select: { name: true } },
        agent: { select: { name: true } },
        messages: { orderBy: { occurredAt: 'asc' }, select: { direction: true, messageType: true, text: true, occurredAt: true } },
        classifications: { select: { classificationType: true, label: true, confidence: true, reviewedStatus: true, createdAt: true } },
        promises: { select: { action: true, dueAt: true, status: true, promisorAgent: true } },
        alerts: { select: { ruleName: true, severity: true, status: true, createdAt: true } },
        opportunities: { select: { status: true, expectedValue: true, rangeLow: true, rangeHigh: true, createdAt: true } },
      },
    }),
  ])

  const data = {
    formato: 'AtendeRadar · exportação de dados de um cliente (LGPD, portabilidade)',
    geradoEm: new Date().toISOString(),
    empresa: org?.displayName || org?.name || null,
    contact: contact
      ? { displayName: contact.displayName, phoneLast4: contact.phoneLast4, excluded: contact.excluded, firstSeenAt: contact.firstSeenAt?.toISOString() ?? null, lastSeenAt: contact.lastSeenAt?.toISOString() ?? null }
      : null,
    conversations: conversations.map((c) => ({
      id: c.id,
      connection: c.connection?.name ?? null,
      agent: c.agent?.name ?? null,
      openedAt: c.openedAt.toISOString(),
      closedAt: c.closedAt?.toISOString() ?? null,
      operationalStatus: c.operationalStatus,
      primaryIntent: c.primaryIntent,
      sentiment: c.sentiment,
      urgency: c.urgency,
      score: c.score,
      messages: c.messages.map((m) => ({ direction: m.direction === 'inbound' ? 'cliente' : 'empresa', type: m.messageType, text: m.text, occurredAt: m.occurredAt.toISOString() })),
      classifications: c.classifications.map((k) => ({ type: k.classificationType, label: k.label, confidence: k.confidence, reviewed: k.reviewedStatus, at: k.createdAt.toISOString() })),
      promises: c.promises.map((p) => ({ action: p.action, by: p.promisorAgent, dueAt: p.dueAt?.toISOString() ?? null, status: p.status })),
      alerts: c.alerts.map((a) => ({ rule: a.ruleName, severity: a.severity, status: a.status, at: a.createdAt.toISOString() })),
      opportunities: c.opportunities.map((o) => ({ status: o.status, expectedValue: o.expectedValue, rangeLow: o.rangeLow, rangeHigh: o.rangeHigh, at: o.createdAt.toISOString() })),
    })),
  }

  await audit(g.auth, { action: 'privacy.export', targetType: 'conversation', targetId: conv.id, details: { conversations: conversations.length } })
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="dados-cliente-${contact?.phoneLast4 ?? 'x'}-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
