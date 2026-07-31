import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const teams = await db.team.findMany({
      where: { organizationId: org.id },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        unitId: t.unitId,
        supervisorId: t.supervisorId,
        connectionIds: JSON.parse(t.connectionIds || '[]') as string[],
        slaConfig: JSON.parse(t.slaConfig || '{}') as Record<string, unknown>,
        goals: JSON.parse(t.goals || '{}') as Record<string, unknown>,
        active: t.active,
      })),
    })
  } catch (error) {
    console.error('Teams GET error:', error)
    return NextResponse.json({ error: 'Failed to load teams' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, code, supervisorId, connectionIds, slaConfig, goals } = body as {
      name?: string
      code?: string
      supervisorId?: string
      connectionIds?: string[]
      slaConfig?: Record<string, unknown>
      goals?: Record<string, unknown>
    }

    if (!name || !code) {
      return NextResponse.json(
        { error: 'name and code are required' },
        { status: 400 }
      )
    }

    const team = await db.team.create({
      data: {
        organizationId: org.id,
        name,
        code,
        supervisorId,
        connectionIds: JSON.stringify(connectionIds || []),
        slaConfig: JSON.stringify(slaConfig || {}),
        goals: JSON.stringify(goals || {}),
      },
    })

    return NextResponse.json({ success: true, team }, { status: 201 })
  } catch (error) {
    console.error('Teams POST error:', error)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}
