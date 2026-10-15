import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, badRequest, publicMember } from '@/lib/api-auth'
import { sendInvite } from '@/lib/invites'
import { isRole } from '@/lib/permissions'
import { readJson } from '@/lib/json-body'

export async function GET() {
  try {
    const g = await guard('members.view')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const members = await db.organizationMember.findMany({
      where: { organizationId: org.id },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.name,
        email: m.email,
        role: m.role,
        team: m.team,
        status: m.status,
        mfaEnabled: m.mfaEnabled,
        lastAccessAt: m.lastAccessAt?.toISOString() || null,
        invitedAt: m.invitedAt.toISOString(),
        invitedBy: m.invitedBy,
      })),
    })
  } catch (error) {
    console.error('Members GET error:', error)
    return NextResponse.json({ error: 'Failed to load members' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const g = await guard('members.manage')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const j = await readJson(request)
    if (!j.ok) return j.res
    const body = j.body
    const { name, email, role, team } = body as {
      name?: string
      email?: string
      role?: string
      team?: string
    }

    if (!name || !email) {
      return NextResponse.json(
        { error: 'name and email are required' },
        { status: 400 }
      )
    }

    const finalRole = role || 'member'
    if (!isRole(finalRole)) return badRequest('Papel inválido')

    // E-mail é a identidade de login: precisa ser único em toda a plataforma, não só na organização.
    const normalizedEmail = email.trim().toLowerCase()
    const taken = await db.organizationMember.findFirst({ where: { email: normalizedEmail } })
    if (taken) {
      return NextResponse.json({ error: 'Este e-mail já está em uso' }, { status: 409 })
    }

    const member = await db.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: normalizedEmail, // use email as userId for now
        name,
        email: normalizedEmail,
        role: finalRole,
        team,
        status: 'invited', // só vira 'active' quando a pessoa aceitar o convite e criar a própria senha
        invitedBy: g.auth.memberId,
      },
    })

    await audit(g.auth, { action: 'member.invited', targetType: 'member', targetId: member.id, targetLabel: normalizedEmail, details: { role: finalRole } })
    // E-mail não saiu (sem provedor ou falha no envio): o admin recebe o link para repassar.
    const { inviteLink, emailStatus } = await sendInvite(g.auth, member)
    return NextResponse.json({ success: true, member: publicMember(member), inviteLink, emailStatus }, { status: 201 })
  } catch (error) {
    console.error('Members POST error:', error)
    return NextResponse.json({ error: 'Failed to invite member' }, { status: 500 })
  }
}
