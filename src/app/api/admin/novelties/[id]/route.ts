import { NextResponse } from 'next/server'
import { readJson } from '@/lib/json-body'
import { operatorGuard } from '@/lib/support-admin'
import { audit } from '@/lib/audit'
import { decideNovelty, NOVELTY_STATUSES, type NoveltyStatus } from '@/lib/analysis/novelty'

type Params = { params: Promise<{ id: string }> }

/** { status: 'mapped' | 'dismissed' | 'new' }: vale mapear, descartar ou voltar para "a decidir". */
export async function PATCH(request: Request, { params }: Params) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const { id } = await params
  const j = await readJson<{ status?: unknown }>(request)
  if (!j.ok) return j.res
  const { status } = j.body
  if (typeof status !== 'string' || !(NOVELTY_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "status deve ser 'new', 'mapped' ou 'dismissed'" }, { status: 400 })
  }
  const cluster = await decideNovelty(id, status as NoveltyStatus, g.auth.email)
  if (!cluster) return NextResponse.json({ error: 'Tema não encontrado' }, { status: 404 })
  await audit(g.auth, { action: 'novelty.decided', targetType: 'novelty', targetId: id, targetLabel: cluster.title, details: { status } })
  return NextResponse.json({ cluster })
}
