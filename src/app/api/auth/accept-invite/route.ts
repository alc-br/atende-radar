import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { consumeToken } from '@/lib/auth-tokens'
import { hashPassword, passwordProblem } from '@/lib/passwords'
import { allow, clientIp } from '@/lib/rate-limit'

const INVALID = 'Convite inválido ou expirado. Peça um novo ao administrador.'

export async function POST(request: Request) {
  if (!allow(`invite:${clientIp(request)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 })
  }
  const body = (await request.json().catch(() => null)) as { token?: string; password?: string; name?: string } | null
  if (!body?.token || !body.password) return NextResponse.json({ error: INVALID }, { status: 400 })

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
      ...(name && name.length >= 2 ? { name } : {}),
    },
  })
  return NextResponse.json({ success: true })
}
