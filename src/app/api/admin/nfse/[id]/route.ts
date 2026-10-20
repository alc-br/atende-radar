import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readJson } from '@/lib/json-body'
import { operatorGuard } from '@/lib/support-admin'
import { audit } from '@/lib/audit'
import { CANCEL_REASONS } from '@/lib/nfse/xml'
import { kickNfse, requestCancel, retryNfse, type CancelMotivo } from '@/lib/nfse/service'

type Params = { params: Promise<{ id: string }> }

/**
 * { action: 'retry' }: nova tentativa de uma emissão ou cancelamento que falhou.
 * { action: 'cancel', motivo: 'erro'|'naoPrestado'|'outros', texto }: cancela uma nota emitida.
 */
export async function POST(request: Request, { params }: Params) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const { id } = await params
  const doc = await db.nfseDocument.findUnique({ where: { id }, select: { id: true, chave: true, status: true } })
  if (!doc) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })
  const j = await readJson<{ action?: unknown; motivo?: unknown; texto?: unknown }>(request)
  if (!j.ok) return j.res
  const { action, motivo, texto } = j.body
  if (action === 'retry') {
    if (!(await retryNfse(id))) return NextResponse.json({ error: 'Só emissão ou cancelamento com falha pode ser tentado de novo' }, { status: 409 })
    await audit(g.auth, { action: 'nfse.retry', targetType: 'nfse', targetId: id, targetLabel: doc.chave ?? undefined, details: { from: doc.status } })
    kickNfse()
    return NextResponse.json({ ok: true })
  }
  if (action === 'cancel') {
    if (typeof motivo !== 'string' || !(motivo in CANCEL_REASONS)) return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 })
    const r = await requestCancel(id, motivo as CancelMotivo, typeof texto === 'string' ? texto : '')
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error.startsWith('Só') || r.error.startsWith('Fora do prazo') ? 409 : 400 })
    await audit(g.auth, { action: 'nfse.cancel_requested', targetType: 'nfse', targetId: id, targetLabel: doc.chave ?? undefined, details: { motivo } })
    kickNfse()
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "action deve ser 'retry' ou 'cancel'" }, { status: 400 })
}
