import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const unreadOnly = searchParams.get('unread') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')

    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const where: Record<string, unknown> = { organizationId: org.id }
    if (userId) where.userId = userId
    if (unreadOnly) where.read = false

    const [notifications, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.notification.count({ where }),
      db.notification.count({ where: { organizationId: org.id, read: false } }),
    ])

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: JSON.parse(n.data || '{}') as Record<string, unknown>,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      unreadCount,
    })
  } catch (error) {
    console.error('Notifications GET error:', error)
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }
}
