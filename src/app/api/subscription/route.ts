import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { effectiveStatus } from '@/lib/billing/core'
import { countExports, currentUsage, usagePeriodStart } from '@/lib/quotas'
import { analysisGateStatus } from '@/lib/billing/analysis-gate'

// A troca de plano só acontece com pagamento confirmado: pelo checkout (POST /api/billing/checkout, Pagar.me) ou, sem
// pagamento on-line configurado, pelo pedido (POST /api/subscription/request) que o operador da plataforma ativa.
export async function PATCH() {
  const g = await guard('billing.manage')
  if (!g.ok) return g.res
  return NextResponse.json(
    { error: 'A troca de plano depende de pagamento. Contrate pelo checkout na tela Planos.', code: 'payment_required' },
    { status: 409 }
  )
}

export async function GET() {
  try {
    const g = await guard('billing.manage')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const subscription = await db.subscription.findUnique({
      where: { organizationId: org.id },
      include: {
        plan: true,
      },
    })

    if (!subscription) {
      return NextResponse.json({
        subscription: null,
        message: 'No active subscription found',
      })
    }

    // Uso no mês (conversas, mensagens, exportações) e uso fixo contado como nas cotas (as 8 regras padrão não contam)
    const currentMonth = usagePeriodStart()
    const [conversationCount, messageCount, fixed, exportCount, gate] = await Promise.all([
      db.conversation.count({
        where: { organizationId: org.id, createdAt: { gte: currentMonth } },
      }),
      db.message.count({
        where: {
          conversation: { organizationId: org.id, createdAt: { gte: currentMonth } },
        },
      }),
      currentUsage(org.id),
      countExports(org.id),
      analysisGateStatus(org.id),
    ])
    const { connections: connectionCount, agents: agentCount, alertRules: alertRuleCount } = fixed
    const pct = (current: number, limit: number | null) => (limit ? Math.round((current / limit) * 100) : 0)

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: effectiveStatus(subscription),
        plan: {
          id: subscription.plan.id,
          code: subscription.plan.code,
          name: subscription.plan.name,
          monthlyPrice: subscription.plan.monthlyPrice,
          annualPrice: subscription.plan.annualPrice,
        },
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        trialEnd: subscription.trialEnd?.toISOString() || null,
        trialDaysLeft: subscription.status === 'trialing' && subscription.trialEnd ? Math.max(0, Math.ceil((subscription.trialEnd.getTime() - Date.now()) / 86400000)) : null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      usage: {
        conversations: { current: conversationCount, limit: subscription.plan.maxConversationsMonthly, percentage: pct(conversationCount, subscription.plan.maxConversationsMonthly) },
        messages: { current: messageCount, limit: subscription.plan.maxMessagesMonthly, percentage: pct(messageCount, subscription.plan.maxMessagesMonthly) },
        connections: { current: connectionCount, limit: subscription.plan.maxConnections, percentage: pct(connectionCount, subscription.plan.maxConnections) },
        agents: { current: agentCount, limit: subscription.plan.maxAgents, percentage: pct(agentCount, subscription.plan.maxAgents) },
        alertRules: { current: alertRuleCount, limit: subscription.plan.maxAlertRules, percentage: pct(alertRuleCount, subscription.plan.maxAlertRules) },
        exports: { current: exportCount, limit: subscription.plan.maxExports, percentage: pct(exportCount, subscription.plan.maxExports) },
      },
      // T11 · análise pausada (teste vencido / assinatura encerrada) e conversas do mês acima do limite, sem análise
      analysis: { paused: gate.paused, unanalyzed: gate.skipped.size },
    })
  } catch (error) {
    console.error('Subscription GET error:', error)
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 })
  }
}
