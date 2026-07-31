import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, action } = body as { name?: string; action?: string }

    const existing = await db.whatsAppConnection.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = { updatedAt: new Date() }

    if (name) data.name = name

    if (action === 'pause') {
      data.status = 'paused'
      data.disabledAt = new Date()
    } else if (action === 'resume') {
      data.status = 'connected'
      data.disabledAt = null
    }

    const updated = await db.whatsAppConnection.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, connection: updated })
  } catch (error) {
    console.error('Connection PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.whatsAppConnection.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    await db.whatsAppConnection.update({
      where: { id },
      data: {
        status: 'disconnected',
        disabledAt: new Date(),
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Connection DELETE error:', error)
    return NextResponse.json({ error: 'Failed to disconnect connection' }, { status: 500 })
  }
}
