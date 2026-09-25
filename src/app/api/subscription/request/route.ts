import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest, notFound } from '@/lib/api-auth'
import { sendMail } from '@/lib/mailer'

// Pedido de troca de plano. Enquanto não há cobrança automática, quem troca é a equipe (operador da plataforma).
export async function POST(request: Request) {
  const g = await guard('billing.manage')
  if (!g.ok) return g.res
  const body = (await request.json().catch(() => null)) as { planId?: string } | null
  if (!body?.planId) return badRequest('planId é obrigatório')

  const plan = await db.plan.findFirst({ where: { id: body.planId, active: true } })
  if (!plan) return notFound('Plano')
  const org = await db.organization.findUnique({ where: { id: g.auth.orgId }, select: { displayName: true } })
  const sub = await db.subscription.findUnique({ where: { organizationId: g.auth.orgId }, include: { plan: true } })

  await db.notification.create({
    data: {
      organizationId: g.auth.orgId,
      type: 'plan_request',
      title: `Pedido de troca de plano registrado: ${plan.name}`,
      message: 'Nossa equipe entra em contato para combinar o pagamento e ativar o novo plano.',
      data: JSON.stringify({ planId: plan.id }),
    },
  })

  const to = process.env.SALES_EMAIL
  if (to) {
    await sendMail({
      to,
      subject: `Pedido de troca de plano — ${org?.displayName ?? g.auth.orgId}`,
      text: `Empresa: ${org?.displayName} (${g.auth.orgId})\nSolicitante: ${g.auth.name} <${g.auth.email}>\nPlano atual: ${sub?.plan.name ?? '—'}\nPlano pedido: ${plan.name} (R$ ${plan.monthlyPrice}/mês)\n`,
    })
  }
  return NextResponse.json({ success: true, requested: plan.name })
}
