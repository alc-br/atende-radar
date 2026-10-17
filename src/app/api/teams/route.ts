import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, badRequest } from '@/lib/api-auth'
import { linkSupervisorTeam, supervisorOptions, validateTeamRefs } from '@/lib/team-refs'
import { readJson } from '@/lib/json-body'

export async function GET() {
  try {
    const g = await guard('teams.view')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const [teams, agents, supervisors] = await Promise.all([
      db.team.findMany({
        where: { organizationId: org.id },
        orderBy: { name: 'asc' },
      }),
      db.agent.findMany({
        where: { organizationId: org.id },
        select: { id: true, name: true, team: true, status: true },
      }),
      supervisorOptions(org.id),
    ])

    return NextResponse.json({
      teams: teams.map((t) => {
        // supervisor é um membro; equipes antigas guardavam um atendente
        const supervisor = t.supervisorId ? supervisors.find((m) => m.id === t.supervisorId) ?? agents.find((a) => a.id === t.supervisorId) : null
        const members = agents.filter((a) => a.team === t.name && a.status === 'active')
        return {
          id: t.id,
          name: t.name,
          code: t.code,
          unitId: t.unitId,
          supervisorId: t.supervisorId,
          supervisorName: supervisor?.name || null,
          connectionIds: JSON.parse(t.connectionIds || '[]') as string[],
          slaConfig: JSON.parse(t.slaConfig || '{}') as Record<string, unknown>,
          goals: JSON.parse(t.goals || '{}') as Record<string, unknown>,
          active: t.active,
          memberCount: members.length,
          members: members.map((m) => m.name),
        }
      }),
      // quem pode ser supervisor (Criar equipe): membros com papel supervisor, gestor ou admin
      supervisorOptions: supervisors.map((m) => ({ id: m.id, name: m.name, role: m.role, pending: m.status === 'invited' })),
    })
  } catch (error) {
    console.error('Teams GET error:', error)
    return NextResponse.json({ error: 'Failed to load teams' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const g = await guard('teams.manage')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const j = await readJson(request)
    if (!j.ok) return j.res
    const body = j.body
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

    const refError = await validateTeamRefs(org.id, supervisorId, connectionIds)
    if (refError) return badRequest(refError)

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

    await linkSupervisorTeam(org.id, supervisorId, team.name)
    await audit(g.auth, { action: 'team.created', targetType: 'team', targetId: team.id, targetLabel: team.name })
    return NextResponse.json({ success: true, team }, { status: 201 })
  } catch (error) {
    console.error('Teams POST error:', error)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}
