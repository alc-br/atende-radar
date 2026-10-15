import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { badRequest, guard, isPlatformOperator, notFound } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { parsePlanPatch } from '@/lib/plan-catalog'

// Admin › Planos (V7): o operador da plataforma edita nome, descrição, destaques, "Mais escolhido", preço para novas
// contratações e se o plano está à venda.
// - Preço: só vale para contratações novas. Quem já assina segue pagando o valor da própria assinatura no Pagar.me
//   (o valor fica gravado na assinatura do provedor, e a reativação da renovação reaproveita esse valor).
// - Desativar: o plano some da página de vendas e de Planos e não pode ser contratado; quem já tem continua com ele.
// - Limites (cotas) não são editados aqui: valem para quem já assina.
// O sync do deploy (scripts/sync-plan-catalog.ts) não sobrescreve o que foi editado aqui.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (!g.ok) return g.res
  if (!isPlatformOperator(g.auth.email)) return NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 })
  const { id } = await params
  const j = await readJson<unknown>(request)
  if (!j.ok) return j.res
  const parsed = parsePlanPatch(j.body)
  if (!parsed.ok) return badRequest(parsed.error)
  const patch = parsed.patch

  const plan = await db.plan.findUnique({ where: { id } })
  if (!plan) return notFound('Plano')
  // o cadastro novo entra no plano ativo mais barato (api/auth/signup): sempre sobra pelo menos um à venda
  if (patch.active === false && plan.active && (await db.plan.count({ where: { active: true } })) <= 1) {
    return NextResponse.json({ error: 'Este é o único plano à venda. Ative outro antes de desativar este.', code: 'last_active_plan' }, { status: 409 })
  }

  const features = patch.features ? { ...(JSON.parse(plan.features || '{}') as Record<string, boolean>), ...patch.features } : undefined
  const data = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.monthlyPrice !== undefined ? { monthlyPrice: patch.monthlyPrice } : {}),
    ...(patch.annualPrice !== undefined ? { annualPrice: patch.annualPrice } : {}),
    ...(patch.highlight !== undefined ? { highlight: patch.highlight } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
    ...(features ? { features: JSON.stringify(features) } : {}),
  }
  // de/para só do que mudou (auditoria)
  const before: Record<string, unknown> = { ...plan, features: JSON.parse(plan.features || '{}') }
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const [k, v] of Object.entries({ ...data, ...(features ? { features } : {}) })) {
    if (JSON.stringify(before[k]) !== JSON.stringify(v)) changes[k] = { from: before[k], to: v }
  }
  if (!Object.keys(changes).length) return NextResponse.json({ success: true, changed: [] })

  const updated = await db.plan.update({ where: { id }, data })
  // registro no log da empresa do operador (o catálogo não pertence a uma empresa cliente)
  await audit(g.auth, { action: 'plan.updated', targetType: 'plan', targetId: plan.id, targetLabel: `${plan.code} · ${updated.name}`, details: { operator: true, changes } })
  return NextResponse.json({ success: true, changed: Object.keys(changes) })
}
