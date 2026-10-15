import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, conversationScope } from '@/lib/api-auth'
import { decryptPhone, formatPhone } from '@/lib/phone-crypto'

// B5/B9 · telefone completo do cliente da conversa. Só para quem já pode abrir ESTA conversa (mesmo escopo da tela
// de detalhe: o atendente só as dele, o supervisor só a equipe). Cada consulta vai para o registro de auditoria.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('conversations.view')
  if (!g.ok) return g.res
  const { id } = await params
  const conversation = await db.conversation.findFirst({
    where: { id, ...conversationScope(g.auth) },
    select: { id: true, contact: { select: { id: true, phoneLast4: true, phoneEncrypted: true } } },
  })
  if (!conversation) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  const digits = conversation.contact ? decryptPhone(g.auth.orgId, conversation.contact.phoneEncrypted) : null
  if (!digits) {
    return NextResponse.json({ error: 'O telefone completo deste contato não está guardado. Aparece só o final.' }, { status: 404 })
  }
  await audit(g.auth, {
    action: 'contact.phone_viewed',
    targetType: 'contact',
    targetId: conversation.contact!.id,
    targetLabel: `***${conversation.contact!.phoneLast4 || ''}`,
    details: { conversationId: conversation.id },
  })
  return NextResponse.json({ phone: formatPhone(digits) }, { headers: { 'Cache-Control': 'no-store' } })
}
