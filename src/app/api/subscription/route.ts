import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

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

    // Get current usage metrics
    const currentMonth = new Date()
    currentMonth.setDate(1)
    currentMonth.setHours(0, 0, 0, 0)

    const [conversationCount, messageCount, connectionCount, agentCount, alertRuleCount] =
      await Promise.all([
        db.conversation.count({
          where: { organizationId: org.id, createdAt: { gte: currentMonth } },
        }),
        db.message.count({
          where: {
            conversation: { organizationId: org.id, createdAt: { gte: currentMonth } },
          },
        }),
        db.whatsAppConnection.count({ where: { organizationId: org.id } }),
        db.agent.count({ where: { organizationId: org.id } }),
        db.alertRule.count({ where: { organizationId: org.id } }),
      ])

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
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
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      usage: {
        conversations: {
          current: conversationCount,
          limit: subscription.plan.maxConversationsMonthly,
          percentage: Math.round(
            (conversationCount / subscription.plan.maxConversationsMonthly) * 100
          ),
        },
        messages: {
          current: messageCount,
          limit: subscription.plan.maxMessagesMonthly,
          percentage: Math.round(
            (messageCount / subscription.plan.maxMessagesMonthly) * 100
          ),
        },
        connections: {
          current: connectionCount,
          limit: subscription.plan.maxConnections,
          percentage: Math.round(
            (connectionCount / subscription.plan.maxConnections) * 100
          ),
        },
        agents: {
          current: agentCount,
          limit: subscription.plan.maxAgents,
          percentage: Math.round((agentCount / subscription.plan.maxAgents) * 100),
        },
        alertRules: {
          current: alertRuleCount,
          limit: subscription.plan.maxAlertRules,
          percentage: Math.round((alertRuleCount / subscription.plan.maxAlertRules) * 100),
        },
      },
    })
  } catch (error) {
    console.error('Subscription GET error:', error)
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 })
  }
}
