import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      organizations,
      totalUsers,
      totalConnections,
      conversationsToday,
      activeAlerts,
      subscriptions,
      recentNotifications,
    ] = await Promise.all([
      db.organization.findMany({
        include: {
          _count: { select: { connections: true, agents: true } },
          subscription: { include: { plan: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.organizationMember.count(),
      db.whatsAppConnection.count(),
      db.conversation.count({ where: { createdAt: { gte: todayStart } } }),
      db.alert.count({ where: { status: 'new' } }),
      db.subscription.findMany({ include: { plan: { select: { monthlyPrice: true } } } }),
      db.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { organization: { select: { name: true } } },
      }),
    ])

    const globalUsers = await db.organizationMember.findMany({
      include: { organization: { select: { name: true } } },
      orderBy: { lastAccessAt: 'desc' },
    })

    const monthlyRevenue = subscriptions.reduce(
      (sum, s) => sum + (s.status === 'active' ? s.plan.monthlyPrice : 0),
      0
    )

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
      },
      organizations: organizations.map((o) => ({
        id: o.id,
        name: o.displayName,
        cnpj: o.cnpj,
        segment: o.segment,
        plan: o.subscription?.plan.name || null,
        connections: o._count.connections,
        agents: o._count.agents,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
      users: globalUsers.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        organization: m.organization.name,
        role: m.role,
        status: m.status,
        lastAccessAt: m.lastAccessAt?.toISOString() || null,
      })),
      activity: recentNotifications.map((n) => ({
        id: n.id,
        timestamp: n.createdAt.toISOString(),
        action: n.title,
        organization: n.organization.name,
        details: n.message,
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
