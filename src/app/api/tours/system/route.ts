import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { track } from '@/lib/product-events'
import { applyUpdate, parseProgress, parseUpdate } from '@/lib/system-tour/progress'
import { ttsAvailable } from '@/lib/system-tour/tts'

// Tour pelo sistema (manual interativo): progresso por capítulo de cada membro, para continuar depois ou em outro aparelho.

export async function GET() {
  const g = await guard('tours.use')
  if (!g.ok) return g.res

  const member = await db.organizationMember.findUnique({ where: { id: g.auth.memberId }, select: { systemTourJson: true } })
  if (!member) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
  // audio: o servidor gera a narração (Azure Speech, com cache); sem isso, o painel usa direto a voz do navegador
  return NextResponse.json({ progress: parseProgress(member.systemTourJson), audio: ttsAvailable() })
}

export async function PATCH(request: Request) {
  const g = await guard('tours.use')
  if (!g.ok) return g.res

  const j = await readJson(request)
  if (!j.ok) return j.res
  const update = parseUpdate(j.body)
  if (typeof update === 'string') return NextResponse.json({ error: update }, { status: 400 })

  // Ler-alterar-gravar com troca condicional (duas abas abertas não apagam o progresso uma da outra)
  for (let attempt = 0; attempt < 5; attempt++) {
    const member = await db.organizationMember.findUnique({ where: { id: g.auth.memberId }, select: { id: true, systemTourJson: true } })
    if (!member) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    const current = parseProgress(member.systemTourJson)
    const next = applyUpdate(current, update)
    const { count } = await db.organizationMember.updateMany({
      where: { id: member.id, systemTourJson: member.systemTourJson },
      data: { systemTourJson: JSON.stringify(next) },
    })
    if (count === 1) {
      // Taxa de conclusão em Admin › Produto: conta só a 1ª vez que o capítulo é concluído
      if (update.done && !current.chapters[update.chapterId]?.done) {
        await track('tour_completed', { organizationId: g.auth.orgId, memberId: g.auth.memberId }, { tour: `sistema:${update.chapterId}` })
      }
      return NextResponse.json({ progress: next })
    }
  }
  return NextResponse.json({ error: 'Tente novamente' }, { status: 409 })
}
