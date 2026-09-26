import { NextResponse } from 'next/server'
import { guard, isPlatformOperator } from '@/lib/api-auth'

// Quem sou eu: papel atual (vem do banco, não do cookie) e se sou operador da plataforma. A interface usa isto para montar o menu.
export async function GET() {
  const g = await guard()
  if (!g.ok) return g.res
  const { memberId, orgId, role, email, name, emailVerified, team } = g.auth
  return NextResponse.json({
    member: { id: memberId, name, email, role, emailVerified, team },
    organizationId: orgId,
    isPlatformOperator: isPlatformOperator(email),
  })
}
