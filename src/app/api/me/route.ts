import { NextResponse } from 'next/server'
import { guard, isPlatformOperator } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { deletionInfo } from '@/lib/org-deletion'

// Quem sou eu: papel atual (vem do banco, não do cookie) e se sou operador da plataforma. A interface usa isto para montar o menu.
export async function GET() {
  const g = await guard()
  if (!g.ok) return g.res
  const { memberId, orgId, role, email, name, emailVerified, team } = g.auth
  // Nome da empresa para o seletor da barra superior
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true, displayName: true, deletionRequestedAt: true, deletionScheduledFor: true } })
  return NextResponse.json({
    member: { id: memberId, name, email, role, emailVerified, team },
    organizationId: orgId,
    organizationName: org?.displayName || org?.name || null,
    isPlatformOperator: isPlatformOperator(email),
    // exclusão da empresa pedida pelo dono: a faixa de aviso aparece para todos os membros
    organizationDeletion: org ? deletionInfo(org) : null,
  })
}
