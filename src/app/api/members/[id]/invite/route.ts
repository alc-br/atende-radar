import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, notFound, badRequest } from '@/lib/api-auth'
import { sendInvite } from '@/lib/invites'
import { allow } from '@/lib/rate-limit'

const NOT_PENDING = 'Este membro não tem convite pendente'

// Convite pendente (status 'invited'): reenviar gera link novo (o anterior deixa de valer); cancelar apaga o convite.
// Mesma permissão de quem convida (members.manage).

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('members.manage')
    if (!g.ok) return g.res
    const { id } = await params

    const member = await db.organizationMember.findFirst({ where: { id, organizationId: g.auth.orgId } })
    if (!member) return notFound('Member')
    if (member.status !== 'invited') return badRequest(NOT_PENDING)
    // evita usar o reenvio para mandar e-mail em massa para a mesma pessoa
    if (!allow(`invite-resend:${id}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitos reenvios para este convite. Tente novamente mais tarde.' }, { status: 429 })
    }

    const inviteLink = await sendInvite(g.auth, member)
    await db.organizationMember.update({ where: { id }, data: { invitedAt: new Date() } })
    await audit(g.auth, { action: 'member.invite_resent', targetType: 'member', targetId: id, targetLabel: member.email, details: { role: member.role } })
    return NextResponse.json({ success: true, inviteLink })
  } catch (error) {
    console.error('Invite resend error:', error)
    return NextResponse.json({ error: 'Failed to resend invite' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('members.manage')
    if (!g.ok) return g.res
    const { id } = await params

    const member = await db.organizationMember.findFirst({ where: { id, organizationId: g.auth.orgId } })
    if (!member) return notFound('Member')
    if (member.status !== 'invited') return badRequest(NOT_PENDING)

    // o link já enviado deixa de valer antes de o registro sumir
    await db.authToken.updateMany({ where: { memberId: id, type: 'invite', usedAt: null }, data: { usedAt: new Date() } })
    await db.organizationMember.delete({ where: { id } })
    await audit(g.auth, { action: 'member.invite_canceled', targetType: 'member', targetId: id, targetLabel: member.email, details: { role: member.role } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Invite cancel error:', error)
    return NextResponse.json({ error: 'Failed to cancel invite' }, { status: 500 })
  }
}
