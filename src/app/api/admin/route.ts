import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, isPlatformOperator } from '@/lib/api-auth'
import { maskSensitive } from '@/lib/mask-sensitive'
import { effectiveStatus, graceEndsAt } from '@/lib/billing/core'
import { NOT_SIMULATION } from '@/lib/sandbox'
import fs from 'fs'
import path from 'path'

function resolveDbFilePath(): string | null {
  const url = process.env.DATABASE_URL
  if (!url || !url.startsWith('file:')) return null
  const raw = url.slice('file:'.length)
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw)
}

export async function GET() {
  try {
    // Painel da plataforma: só o operador (PLATFORM_ADMIN_EMAILS). Admin de cliente não entra.
    const g = await guard()
    if (!g.ok) return g.res
    if (!isPlatformOperator(g.auth)) {
      return NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    // empresas simuladas (S1) ficam fora de todos os números e listas do painel (têm a aba Simulação)
    const real = { organization: NOT_SIMULATION }

    const [
      organizations,
      totalUsers,
      totalConnections,
      conversationsToday,
      activeAlerts,
      subscriptions,
      recentNotifications,
      plans,
    ] = await Promise.all([
      db.organization.findMany({
        where: NOT_SIMULATION,
        include: {
          _count: { select: { connections: true, agents: true } },
          subscription: { include: { plan: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.organizationMember.count({ where: real }),
      db.whatsAppConnection.count({ where: real }),
      db.conversation.count({ where: { createdAt: { gte: todayStart }, ...real } }),
      db.alert.count({ where: { status: 'new', ...real } }),
      db.subscription.findMany({ where: real, include: { plan: { select: { monthlyPrice: true, annualPrice: true } } } }),
      db.notification.findMany({
        where: real,
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { organization: { select: { name: true } } },
      }),
      db.plan.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true, active: true, monthlyPrice: true } }),
    ])

    const globalUsers = await db.organizationMember.findMany({
      where: real,
      include: { organization: { select: { name: true } } },
      orderBy: { lastAccessAt: 'desc' },
    })

    // receita mensal recorrente: o plano anual entra pelo valor do ano dividido por 12 (não pelo preço mensal)
    const monthlyRevenue = Math.round(subscriptions.reduce(
      (sum, s) => sum + (s.status === 'active' ? (s.billingCycle === 'annual' ? s.plan.annualPrice / 12 : s.plan.monthlyPrice) : 0),
      0
    ) * 100) / 100
    // inadimplentes: renovação sem pagamento, ainda na tolerância (past_due) ou já bloqueadas (unpaid)
    const delinquentOrgs = organizations.filter((o) => o.subscription && ['past_due', 'unpaid'].includes(effectiveStatus(o.subscription))).length

    let dbHealthy = true
    try {
      await db.organization.count()
    } catch {
      dbHealthy = false
    }

    let storageBytes = 0
    const dbPath = resolveDbFilePath()
    if (dbPath) {
      try {
        storageBytes = fs.statSync(dbPath).size
      } catch {
        storageBytes = 0
      }
    }

    return NextResponse.json({
      kpis: {
        activeOrgs: organizations.filter((o) => o.status === 'active').length,
        whatsappConnections: totalConnections,
        totalUsers,
        conversationsToday,
        monthlyRevenue,
        activeAlerts,
        delinquentOrgs,
      },
      organizations: organizations.map((o) => ({
        id: o.id,
        name: o.displayName,
        cnpj: o.cnpj,
        segment: o.segment,
        plan: o.subscription?.plan.name || null,
        subscription: o.subscription
          ? { planId: o.subscription.planId, status: effectiveStatus(o.subscription), storedStatus: o.subscription.status, currentPeriodEnd: o.subscription.currentPeriodEnd.toISOString(), trialEnd: o.subscription.trialEnd?.toISOString() ?? null, recurring: !!o.subscription.providerSubscriptionId, graceEndsAt: graceEndsAt(o.subscription)?.toISOString() ?? null }
          : null,
        connections: o._count.connections,
        agents: o._count.agents,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        // exclusão pedida pelo dono (some de vez nesta data, salvo desistência)
        deletionRequestedAt: o.deletionRequestedAt?.toISOString() || null,
        deletionScheduledFor: o.deletionScheduledFor?.toISOString() || null,
      })),
      pendingDeletions: organizations
        .filter((o) => o.deletionScheduledFor)
        .sort((a, b) => a.deletionScheduledFor!.getTime() - b.deletionScheduledFor!.getTime())
        .map((o) => ({ id: o.id, name: o.displayName, requestedAt: o.deletionRequestedAt?.toISOString() || null, scheduledFor: o.deletionScheduledFor!.toISOString() })),
      users: globalUsers.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        organization: m.organization.name,
        role: m.role,
        status: m.status,
        lastAccessAt: m.lastAccessAt?.toISOString() || null,
      })),
      plans,
      activity: recentNotifications.map((n) => ({
        id: n.id,
        timestamp: n.createdAt.toISOString(),
        action: n.title,
        organization: n.organization.name,
        details: maskSensitive(n.message),
      })),
      system: {
        databaseHealthy: dbHealthy,
        authHealthy: true,
        storageBytes,
      },
    })
  } catch (error) {
    console.error('Admin GET error:', error)
    return NextResponse.json({ error: 'Failed to load admin data' }, { status: 500 })
  }
}
