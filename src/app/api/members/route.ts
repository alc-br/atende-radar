import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const members = await db.organizationMember.findMany({
      where: { organizationId: org.id },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.name,
        email: m.email,
        role: m.role,
        team: m.team,
        status: m.status,
        mfaEnabled: m.mfaEnabled,
        lastAccessAt: m.lastAccessAt?.toISOString() || null,
        invitedAt: m.invitedAt.toISOString(),
        invitedBy: m.invitedBy,
      })),
    })
  } catch (error) {
    console.error('Members GET error:', error)
    return NextResponse.json({ error: 'Failed to load members' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

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

    const member = await db.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: email, // use email as userId for now
        name,
        email,
        role: role || 'member',
        team,
        invitedBy: 'current_user', // would be real user in production
      },
    })

    return NextResponse.json({ success: true, member }, { status: 201 })
  } catch (error) {
    console.error('Members POST error:', error)
    return NextResponse.json({ error: 'Failed to invite member' }, { status: 500 })
  }
}
