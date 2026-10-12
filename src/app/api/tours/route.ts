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

  // Ler-alterar-gravar com troca condicional: duas abas (ou dois pedidos ao mesmo tempo) não apagam o tour que a outra marcou
  for (let attempt = 0; attempt < 5; attempt++) {
    const member = await db.organizationMember.findUnique({ where: { id: g.auth.memberId }, select: { id: true, seenToursJson: true } })
    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    }
    const current = safeJsonParse<string[]>(member.seenToursJson, [])
    if (current.includes(tourId)) return NextResponse.json({ success: true, seen: current })
    const seen = [...current, tourId]
    const { count } = await db.organizationMember.updateMany({
      where: { id: member.id, seenToursJson: member.seenToursJson },
      data: { seenToursJson: JSON.stringify(seen) },
    })
    if (count === 1) return NextResponse.json({ success: true, seen })
  }
  return NextResponse.json({ error: 'Tente de novo' }, { status: 409 })
}
