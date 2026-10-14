import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'

// Meu perfil (P7): qualquer pessoa logada vê e altera os PRÓPRIOS dados. Nunca outro membro.

export async function GET() {
  const g = await guard()
  if (!g.ok) return g.res
  const m = await db.organizationMember.findUnique({ where: { id: g.auth.memberId } })
  if (!m) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  return NextResponse.json({
    profile: {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      hasPassword: !!m.passwordHash,
      emailVerified: !!m.emailVerifiedAt,
      termsVersion: m.termsVersion,
      termsAcceptedAt: m.termsAcceptedAt?.toISOString() || null,
    },
  })
}

const Body = z.object({
  name: z.string().trim().min(2, 'O nome precisa ter pelo menos 2 letras.').max(120, 'Nome longo demais (máximo 120 caracteres).'),
})

export async function PATCH(request: Request) {
  const g = await guard()
  if (!g.ok) return g.res
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' }, { status: 400 })
  }
  const { name } = parsed.data
  if (name !== g.auth.name) {
    await db.organizationMember.update({ where: { id: g.auth.memberId }, data: { name } })
    // só a chave alterada; o nome em si não vai para o registro
    await audit(g.auth, { action: 'account.profile_updated', targetType: 'member', targetId: g.auth.memberId, targetLabel: g.auth.email, details: { keys: ['name'] } })
  }
  return NextResponse.json({ success: true, profile: { name } })
}
