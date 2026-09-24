import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { consumeToken } from '@/lib/auth-tokens'
import { hashPassword, passwordProblem } from '@/lib/passwords'
import { allow, clientIp } from '@/lib/rate-limit'

const INVALID = 'Link inválido ou expirado. Peça um novo.'

export async function POST(request: Request) {
  if (!allow(`reset:${clientIp(request)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 })
  }
  const body = (await request.json().catch(() => null)) as { token?: string; password?: string } | null
  if (!body?.token || !body.password) return NextResponse.json({ error: INVALID }, { status: 400 })

  // Senha fraca é recusada ANTES de gastar o token, para o link não ser queimado por engano.
  const early = passwordProblem(body.password)
  if (early) return NextResponse.json({ error: early }, { status: 400 })

  const memberId = await consumeToken(body.token, 'reset')
  if (!memberId) return NextResponse.json({ error: INVALID }, { status: 400 })

  const member = await db.organizationMember.findUnique({ where: { id: memberId } })
  if (!member || member.status === 'suspended') return NextResponse.json({ error: INVALID }, { status: 400 })

  await db.organizationMember.update({
    where: { id: memberId },
    data: {
      passwordHash: hashPassword(body.password),
      failedLogins: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 }, // derruba as sessões abertas com a senha antiga
      emailVerifiedAt: member.emailVerifiedAt ?? new Date(), // quem recebeu o e-mail prova que é dono dele
      status: 'active',
    },
  })
  return NextResponse.json({ success: true })
}
