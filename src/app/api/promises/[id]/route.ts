import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status } = body as { status?: string }

    const existing = await db.promise.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Promise not found' }, { status: 404 })
    }

    const updated = await db.promise.update({
      where: { id },
      data: { status: status ?? 'kept' },
    })

    return NextResponse.json({ success: true, promise: updated })
  } catch (error) {
    console.error('Promise PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update promise' }, { status: 500 })
  }
}
