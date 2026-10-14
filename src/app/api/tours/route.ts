import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { track } from '@/lib/product-events'

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

  const j = await readJson(request)
  if (!j.ok) return j.res
  const body = j.body
  const { tourId, outcome } = body as { tourId?: string; outcome?: unknown }
  if (!tourId) {
    return NextResponse.json({ error: 'tourId é obrigatório' }, { status: 400 })
  }
  // I7 · taxa de conclusão do tour: "Concluir" no último passo = completed; "Pular tour" ou fechar = skipped
  const tourEvent = outcome === 'completed' ? 'tour_completed' : outcome === 'skipped' ? 'tour_skipped' : null
  const trackTour = () =>
    tourEvent && typeof tourId === 'string' && tourId.length <= 60
      ? track(tourEvent, { organizationId: g.auth.orgId, memberId: g.auth.memberId }, { tour: tourId })
      : Promise.resolve()

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
    if (count === 1) {
      await trackTour() // só na 1ª vez que o tour é marcado (repetir o PATCH não conta de novo)
      return NextResponse.json({ success: true, seen })
    }
  }
  return NextResponse.json({ error: 'Tente de novo' }, { status: 409 })
}
