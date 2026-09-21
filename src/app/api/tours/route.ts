import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export async function GET() {
  const g = await guard('tours.use')
  if (!g.ok) return g.res

  const member = await db.organizationMember.findUnique({ where: { id: g.auth.memberId } })
  if (!member) {
    return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ seen: safeJsonParse<string[]>(member.seenToursJson, []) })
}

export async function PATCH(request: Request) {
  const g = await guard('tours.use')
  if (!g.ok) return g.res

  const body = await request.json()
  const { tourId } = body as { tourId?: string }
  if (!tourId) {
    return NextResponse.json({ error: 'tourId é obrigatório' }, { status: 400 })
  }

  const member = await db.organizationMember.findUnique({ where: { id: g.auth.memberId } })
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
