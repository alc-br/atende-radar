import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const connections = await db.whatsAppConnection.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { conversations: true },
        },
      },
    })

    // Determine quality based on status and recency
    const formatted = connections.map((c) => {
      let quality: 'good' | 'medium' | 'bad' | null = null
      if (c.status === 'connected') {
        const minutesSinceEvent = c.lastEventAt
          ? (Date.now() - c.lastEventAt.getTime()) / 60000
          : 9999
        quality = minutesSinceEvent < 5 ? 'good' : minutesSinceEvent < 30 ? 'medium' : 'bad'
      } else if (c.status === 'disconnected') {
        quality = 'bad'
      } else if (c.status === 'syncing') {
        quality = 'medium'
      } else if (c.status === 'degraded') {
        quality = 'medium'
      }

      return {
        id: c.id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        phoneLast4: c.phoneLast4,
        status: c.status,
        provider: c.provider,
        lastEventAt: c.lastEventAt?.toISOString() || null,
        lastSyncAt: c.lastSyncAt?.toISOString() || null,
        pairedAt: c.pairedAt?.toISOString() || null,
        messageCount: c._count.conversations,
        quality,
      }
    })

    return NextResponse.json({ connections: formatted })
  } catch (error) {
    console.error('Connections GET error:', error)
    return NextResponse.json({ error: 'Failed to load connections' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, phoneNumber } = body as { name?: string; phoneNumber?: string }

    if (!name || !phoneNumber) {
      return NextResponse.json(
        { error: 'name and phoneNumber are required' },
        { status: 400 }
      )
    }

    const phoneLast4 = phoneNumber.slice(-4)

    const connection = await db.whatsAppConnection.create({
      data: {
        organizationId: org.id,
        name,
        phoneNumber,
        phoneLast4,
        status: 'qr_required',
      },
    })

    return NextResponse.json({ success: true, connection }, { status: 201 })
  } catch (error) {
    console.error('Connections POST error:', error)
    return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 })
  }
}
