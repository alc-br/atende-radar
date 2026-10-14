import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { consumeToken } from '@/lib/auth-tokens'
import { readJson } from '@/lib/json-body'

export async function POST(request: Request) {
  const j = await readJson<{ token?: string }>(request, { optional: true })
  if (!j.ok) return j.res
  const body = j.body
  const memberId = body?.token ? await consumeToken(body.token, 'verify') : null
  if (!memberId) return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 400 })
  await db.organizationMember.update({ where: { id: memberId }, data: { emailVerifiedAt: new Date() } })
  return NextResponse.json({ success: true })
}
