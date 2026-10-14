import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { reissueSessionCookie } from '@/lib/session-cookie'

// "Sair de todos os aparelhos" (P7): muda a sessionVersion, então toda sessão aberta com a versão antiga deixa de
// valer na próxima chamada (guard). A sessão de quem pediu é regravada com a versão nova e continua aberta.
export async function DELETE() {
  const g = await guard()
  if (!g.ok) return g.res
  const updated = await db.organizationMember.update({
    where: { id: g.auth.memberId },
    data: { sessionVersion: { increment: 1 } },
  })
  const keptSession = await reissueSessionCookie(updated.sessionVersion)
  await audit(g.auth, { action: 'account.sessions_revoked', targetType: 'member', targetId: g.auth.memberId, targetLabel: g.auth.email })
  return NextResponse.json({ success: true, keptSession })
}
