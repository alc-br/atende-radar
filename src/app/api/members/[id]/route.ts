import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, notFound, badRequest, publicMember } from '@/lib/api-auth'
import { isRole } from '@/lib/permissions'

const STATUSES = ['active', 'suspended']
// 'invited' só sai de convite aceito; reativar um convidado não pode pular a criação de senha.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('members.manage')
    if (!g.ok) return g.res
    const { id } = await params
    const body = await request.json()
    const { role, team, status } = body as { role?: string; team?: string; status?: string }

    const existing = await db.organizationMember.findFirst({ where: { id, organizationId: g.auth.orgId } })
    if (!existing) return notFound('Member')

    if (role !== undefined && !isRole(role)) return badRequest('Papel inválido')
    if (status !== undefined && !STATUSES.includes(status)) return badRequest('Status inválido')
    if (status === 'active' && existing.status === 'invited') return badRequest('O convite ainda não foi aceito')
    // Evita que a organização fique sem ninguém capaz de administrá-la
    if (id === g.auth.memberId && ((role !== undefined && role !== existing.role) || (status !== undefined && status !== 'active'))) {
      return badRequest('Você não pode alterar o seu próprio papel ou status')
    }

    const data: Record<string, unknown> = {}
    if (role !== undefined) data.role = role
    if (team !== undefined) data.team = team
    if (status !== undefined) data.status = status

    const updated = await db.organizationMember.update({ where: { id }, data })
    if (role !== undefined && role !== existing.role) await audit(g.auth, { action: 'member.role_changed', targetType: 'member', targetId: id, targetLabel: existing.email, details: { from: existing.role, to: role } })
    if (status !== undefined && status !== existing.status) await audit(g.auth, { action: 'member.status_changed', targetType: 'member', targetId: id, targetLabel: existing.email, details: { from: existing.status, to: status } })
    if (team !== undefined && team !== existing.team) await audit(g.auth, { action: 'member.team_changed', targetType: 'member', targetId: id, targetLabel: existing.email, details: { from: existing.team, to: team } })

    return NextResponse.json({ success: true, member: publicMember(updated) })
  } catch (error) {
    console.error('Member PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('members.manage')
    if (!g.ok) return g.res
    const { id } = await params

    const existing = await db.organizationMember.findFirst({ where: { id, organizationId: g.auth.orgId } })
    if (!existing) return notFound('Member')
    if (id === g.auth.memberId) return badRequest('Você não pode remover a si mesmo')

    await db.organizationMember.delete({ where: { id } })
    await audit(g.auth, { action: 'member.removed', targetType: 'member', targetId: id, targetLabel: existing.email, details: { role: existing.role } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Member DELETE error:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
