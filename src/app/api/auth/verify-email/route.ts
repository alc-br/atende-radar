import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { consumeToken } from '@/lib/auth-tokens'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null
  const memberId = body?.token ? await consumeToken(body.token, 'verify') : null
  if (!memberId) return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 400 })
  await db.organizationMember.update({ where: { id: memberId }, data: { emailVerifiedAt: new Date() } })
  return NextResponse.json({ success: true })
}
