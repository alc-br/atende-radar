import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, isPlatformOperator, badRequest, notFound } from '@/lib/api-auth'

const STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'expired']

// Operador da plataforma ativa/troca/estende a assinatura de uma empresa (até existir cobrança automática).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (!g.ok) return g.res
  if (!isPlatformOperator(g.auth.email)) {
    return NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 })
  }
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { planId?: string; status?: string; periodEnd?: string } | null
  if (!body) return badRequest('Corpo inválido')

  const org = await db.organization.findUnique({ where: { id }, select: { id: true } })
  if (!org) return notFound('Organization')
  if (body.status !== undefined && !STATUSES.includes(body.status)) return badRequest('Status inválido')
  if (body.planId && !(await db.plan.findUnique({ where: { id: body.planId }, select: { id: true } }))) return notFound('Plano')

  const data: Record<string, unknown> = {}
  if (body.planId) data.planId = body.planId
  if (body.status) data.status = body.status
  if (body.periodEnd) {
    const d = new Date(body.periodEnd)
    if (Number.isNaN(d.getTime())) return badRequest('periodEnd inválido')
    data.currentPeriodEnd = d
  }

  const existing = await db.subscription.findUnique({ where: { organizationId: id } })
  if (!existing && !body.planId) return badRequest('Empresa sem assinatura: informe o plano')
  const sub = existing
    ? await db.subscription.update({ where: { organizationId: id }, data, include: { plan: true } })
    : await db.subscription.create({ data: { organizationId: id, planId: body.planId!, status: body.status ?? 'active', ...data }, include: { plan: true } })

  return NextResponse.json({ success: true, subscription: { status: sub.status, plan: sub.plan.name, currentPeriodEnd: sub.currentPeriodEnd.toISOString() } })
}
