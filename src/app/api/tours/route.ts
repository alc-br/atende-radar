import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const member = await db.organizationMember.findUnique({ where: { id: session.user.id } })
  if (!member) {
    return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ seen: safeJsonParse<string[]>(member.seenToursJson, []) })
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await request.json()
  const { tourId } = body as { tourId?: string }
  if (!tourId) {
    return NextResponse.json({ error: 'tourId é obrigatório' }, { status: 400 })
  }

  const member = await db.organizationMember.findUnique({ where: { id: session.user.id } })
  if (!member) {
    return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
  }

  const current = safeJsonParse<string[]>(member.seenToursJson, [])
  const seen = current.includes(tourId) ? current : [...current, tourId]

  await db.organizationMember.update({
    where: { id: member.id },
    data: { seenToursJson: JSON.stringify(seen) },
  })

  return NextResponse.json({ success: true, seen })
}
