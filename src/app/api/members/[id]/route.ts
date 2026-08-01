import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { role, team } = body as { role?: string; team?: string }

    const existing = await db.organizationMember.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (role !== undefined) data.role = role
    if (team !== undefined) data.team = team

    const updated = await db.organizationMember.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, member: updated })
  } catch (error) {
    console.error('Member PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.organizationMember.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    await db.organizationMember.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Member DELETE error:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
