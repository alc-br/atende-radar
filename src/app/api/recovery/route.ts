import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const assignedTo = searchParams.get('assignedTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const where: Prisma.RecoveryItemWhereInput = { organizationId: org.id }

    if (status && status !== 'all') {
      where.status = status
    }
    if (assignedTo) {
      where.assignedTo = assignedTo
    }

    const [items, total] = await Promise.all([
      db.recoveryItem.findMany({
        where,
        include: {
          agent: { select: { id: true, name: true } },
          opportunity: {
            select: {
              id: true,
              expectedValue: true,
              rangeLow: true,
              rangeHigh: true,
              conversation: {
                select: {
                  id: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
        orderBy: { priorityScore: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.recoveryItem.count({ where }),
    ])

    const formatted = items.map((item) => ({
      id: item.id,
      conversationId: item.conversationId,
      customerName: item.customerName || 'Desconhecido',
      reason: item.reason,
      originalAgentName: item.originalAgentName,
      assignedTo: item.assignedTo,
      priorityScore: +item.priorityScore.toFixed(2),
      dueAt: item.dueAt?.toISOString(),
      status: item.status,
      attempts: item.attempts,
      outcome: item.outcome,
      recoveredValue: item.recoveredValue ?? undefined,
      potentialValue: item.opportunity?.expectedValue ?? 0,
      lastInteraction: item.opportunity?.conversation?.updatedAt?.toISOString() || item.createdAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
    }))

    return NextResponse.json({
      items: formatted,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Recovery GET error:', error)
    return NextResponse.json({ error: 'Failed to load recovery items' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      conversationId,
      opportunityId,
      agentId,
      reason,
      customerName,
      originalAgentName,
      assignedTo,
      priorityScore,
      dueAt,
    } = body as {
      conversationId?: string
      opportunityId?: string
      agentId?: string
      reason?: string
      customerName?: string
      originalAgentName?: string
      assignedTo?: string
      priorityScore?: number
      dueAt?: string
    }

    const item = await db.recoveryItem.create({
      data: {
        organizationId: org.id,
        conversationId,
        opportunityId,
        agentId,
        reason,
        customerName,
        originalAgentName,
        assignedTo,
        priorityScore: priorityScore ?? 0.5,
        dueAt: dueAt ? new Date(dueAt) : null,
        status: 'new',
      },
    })

    return NextResponse.json({ success: true, item }, { status: 201 })
  } catch (error) {
    console.error('Recovery POST error:', error)
    return NextResponse.json({ error: 'Failed to create recovery item' }, { status: 500 })
  }
}
