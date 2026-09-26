import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, badRequest, publicMember } from '@/lib/api-auth'
import { issueToken } from '@/lib/auth-tokens'
import { appUrl, sendMail } from '@/lib/mailer'
import { isRole } from '@/lib/permissions'

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

    const body = await request.json()
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
    const token = await issueToken(member.id, 'invite')
    await sendMail({
      to: normalizedEmail,
      subject: `${g.auth.name} convidou você para o AtendeRadar`,
      text: `Olá, ${name}!

${g.auth.name} convidou você para o AtendeRadar como "${finalRole}".
Crie a sua senha e entre por este link (vale por 7 dias):
${appUrl()}/accept-invite?token=${token}
`,
    })

    // Sem provedor de e-mail configurado o convite não chega à pessoa: o admin recebe o link para repassar.
    const inviteLink = process.env.MAIL_PROVIDER === 'resend' ? undefined : `${appUrl()}/accept-invite?token=${token}`
    return NextResponse.json({ success: true, member: publicMember(member), inviteLink }, { status: 201 })
  } catch (error) {
    console.error('Members POST error:', error)
    return NextResponse.json({ error: 'Failed to invite member' }, { status: 500 })
  }
}
