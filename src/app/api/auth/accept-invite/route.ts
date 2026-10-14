import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { consumeToken } from '@/lib/auth-tokens'
import { hashPassword, passwordProblem } from '@/lib/passwords'
import { allow, clientIp } from '@/lib/rate-limit'
import { TERMS_REQUIRED_MESSAGE, termsAcceptance } from '@/lib/legal'

const INVALID = 'Convite inválido ou expirado. Peça um novo ao administrador.'

export async function POST(request: Request) {
  if (!allow(`invite:${clientIp(request)}`, Number(process.env.INVITE_RATE_LIMIT_PER_HOUR || 30), 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 })
  }
  const body = (await request.json().catch(() => null)) as { token?: string; password?: string; name?: string; acceptTerms?: unknown } | null
  if (!body?.token || !body.password) return NextResponse.json({ error: INVALID }, { status: 400 })

  // Recusas que não gastam o token (senha fraca, termos não aceitos): o link continua valendo para tentar de novo.
  if (body.acceptTerms !== true) return NextResponse.json({ error: TERMS_REQUIRED_MESSAGE }, { status: 400 })
  const early = passwordProblem(body.password)
  if (early) return NextResponse.json({ error: early }, { status: 400 })

  const memberId = await consumeToken(body.token, 'invite')
  if (!memberId) return NextResponse.json({ error: INVALID }, { status: 400 })

  const member = await db.organizationMember.findUnique({ where: { id: memberId } })
  if (!member || member.status === 'suspended') return NextResponse.json({ error: INVALID }, { status: 400 })

  const name = body.name?.trim()
  await db.organizationMember.update({
    where: { id: memberId },
    data: {
      passwordHash: hashPassword(body.password),
      status: 'active',
      emailVerifiedAt: new Date(),
      ...termsAcceptance(),
      ...(name && name.length >= 2 ? { name } : {}),
    },
  })
  return NextResponse.json({ success: true })
}
