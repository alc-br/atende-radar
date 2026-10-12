import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { pagarmeConfig } from '@/lib/billing/pagarme'
import { syncOrganization } from '@/lib/billing/service'
import { effectiveStatus } from '@/lib/billing/core'

// Resumo da cobrança para a tela Planos: se o pagamento on-line está ligado (e em qual ambiente), a chave PÚBLICA
// para o navegador gerar o token do cartão, a cobrança automática vigente e as faturas.
// Reconsulta o Pagar.me se a última leitura tiver mais de 2 minutos (funciona mesmo sem webhook configurado).
export async function GET() {
  const g = await guard('billing.manage')
  if (!g.ok) return g.res
  const cfg = pagarmeConfig()
  if (cfg) await syncOrganization(g.auth.orgId, { maxAgeMs: 120_000 })

  const [sub, invoices] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId: g.auth.orgId }, include: { plan: { select: { id: true, name: true, code: true } } } }),
    db.billingInvoice.findMany({ where: { organizationId: g.auth.orgId }, orderBy: { createdAt: 'desc' }, take: 24 }),
  ])

  return NextResponse.json({
    enabled: !!cfg,
    mode: cfg?.mode ?? null,
    publicKey: cfg?.publicKey ?? null,
    subscription: sub
      ? {
          status: effectiveStatus(sub),
          plan: sub.plan,
          recurring: !!sub.providerSubscriptionId && sub.billingMode === cfg?.mode,
          billingMode: sub.billingMode,
          billingCycle: sub.billingCycle,
          cardBrand: sub.cardBrand,
          cardLast4: sub.cardLast4,
          currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          pending: !!sub.pendingProviderSubscriptionId,
          lastPaymentError: sub.lastPaymentError,
        }
      : null,
    invoices: invoices.map((i) => ({
      id: i.id,
      planName: i.planName,
      billingCycle: i.billingCycle,
      amount: i.amountCents / 100,
      status: i.status,
      dueAt: i.dueAt?.toISOString() ?? null,
      paidAt: i.paidAt?.toISOString() ?? null,
      periodStart: i.periodStart?.toISOString() ?? null,
      periodEnd: i.periodEnd?.toISOString() ?? null,
      failureMessage: i.failureMessage,
      createdAt: i.createdAt.toISOString(),
    })),
  })
}
