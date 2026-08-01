import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, supervisorId, active, connectionIds, slaConfig, goals } = body as {
      name?: string
      supervisorId?: string | null
      active?: boolean
      connectionIds?: string[]
      slaConfig?: Record<string, unknown>
      goals?: Record<string, unknown>
    }

    const existing = await db.team.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (supervisorId !== undefined) data.supervisorId = supervisorId
    if (active !== undefined) data.active = active
    if (connectionIds !== undefined) data.connectionIds = JSON.stringify(connectionIds)
    if (slaConfig !== undefined) data.slaConfig = JSON.stringify(slaConfig)
    if (goals !== undefined) data.goals = JSON.stringify(goals)

    const updated = await db.team.update({ where: { id }, data })

    return NextResponse.json({ success: true, team: updated })
  } catch (error) {
    console.error('Team PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.team.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    await db.team.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Team DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
  }
}
