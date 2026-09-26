import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, agentScope } from '@/lib/api-auth'
import { enforceQuota } from '@/lib/quotas'

export async function GET() {
  try {
    const g = await guard('agents.view')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const agents = await db.agent.findMany({
      where: agentScope(g.auth),
      include: {
        metrics: { orderBy: { date: 'desc' }, take: 2 },
        identities: { orderBy: { confidence: 'desc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    })

    const formatted = agents.map((a) => {
      const latest = a.metrics[0]
      const prev = a.metrics[1]
      const trend =
        latest && prev
          ? latest.score > prev.score
            ? 'up'
            : latest.score < prev.score
              ? 'down'
              : 'stable'
          : 'stable'
      const identity = a.identities[0]

      return {
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        team: a.team,
        status: a.status,
        score: latest ? Math.round(latest.score) : 0,
        conversations: latest?.conversations ?? 0,
        avgResponseTime: latest ? +(latest.avgResponseTime).toFixed(1) : 0,
        opportunities: latest?.opportunitiesHandled ?? 0,
        opportunitiesLost: latest?.opportunitiesLost ?? 0,
        promisesKept: latest?.promisesKept ?? 0,
        promisesTotal: latest?.promisesTotal ?? 0,
        trend,
        whatsappIdentity: identity ? identity.displayName : null,
      }
    })

    return NextResponse.json({ agents: formatted })
  } catch (error) {
    console.error('Team GET error:', error)
    return NextResponse.json({ error: 'Failed to load team data' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const g = await guard('agents.manage')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const overQuota = await enforceQuota(g.auth.orgId, 'agents')
    if (overQuota) return overQuota

    const body = await request.json()
    const { name, email, role, team } = body as {
      name?: string
      email?: string
      role?: string
      team?: string
    }

    if (!name || !email) {
      return NextResponse.json(
        { error: 'name and email are required' },
        { status: 400 }
      )
    }

    const agent = await db.agent.create({
      data: {
        organizationId: org.id,
        name,
        email,
        role: role || 'atendente',
        team,
      },
    })

    return NextResponse.json({ success: true, agent }, { status: 201 })
  } catch (error) {
    console.error('Team POST error:', error)
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
  }
}
