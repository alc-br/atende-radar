import { NextResponse } from 'next/server'
import { guard } from '@/lib/api-auth'
import { cancelDeletion, deletionInfoFor, DELETION_GRACE_DAYS, requestDeletion } from '@/lib/org-deletion'

// Encerrar a conta (LGPD): GET = situação (qualquer membro, para a faixa de aviso); POST = pedir (só o dono, com senha
// e o nome da empresa); DELETE = desistir dentro do prazo (só o dono).
export async function GET() {
  const g = await guard()
  if (!g.ok) return g.res
  return NextResponse.json({ deletion: await deletionInfoFor(g.auth.orgId), graceDays: DELETION_GRACE_DAYS })
}

export async function POST(request: Request) {
  const g = await guard('organization.delete')
  if (!g.ok) return g.res
  const body = (await request.json().catch(() => null)) as { password?: unknown; confirmName?: unknown } | null
  const result = await requestDeletion(g.auth, body ?? {})
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, deletion: result.deletion })
}

export async function DELETE() {
  const g = await guard('organization.delete')
  if (!g.ok) return g.res
  const result = await cancelDeletion(g.auth)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, deletion: null })
}
