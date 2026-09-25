import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest, notFound } from '@/lib/api-auth'
import { eraseConversations, excludeContactOf } from '@/lib/privacy'

// Pedidos de privacidade sobre UM cliente (titular): parar de monitorar ou apagar todos os dados dele.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('privacy.manage')
  if (!g.ok) return g.res
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { action?: string } | null
  if (body?.action !== 'exclude' && body?.action !== 'erase') return badRequest('action deve ser "exclude" ou "erase"')

  const conv = await db.conversation.findFirst({ where: { id, organizationId: g.auth.orgId }, select: { id: true, contactId: true } })
  if (!conv) return notFound('Conversation')

  if (body.action === 'exclude') {
    await excludeContactOf(g.auth.orgId, id)
    return NextResponse.json({ success: true, action: 'exclude' })
  }

  // apagar: todas as conversas do mesmo contato
  const all = conv.contactId
    ? await db.conversation.findMany({ where: { organizationId: g.auth.orgId, contactId: conv.contactId }, select: { id: true } })
    : [{ id: conv.id }]
  const erased = await eraseConversations(g.auth.orgId, all.map((c) => c.id))
  return NextResponse.json({ success: true, action: 'erase', erased })
}
