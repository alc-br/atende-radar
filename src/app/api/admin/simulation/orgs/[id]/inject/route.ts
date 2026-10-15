import { NextResponse } from 'next/server'
import { readJson } from '@/lib/json-body'
import { auditSimulation, simulationAccess } from '@/lib/simulation/access'
import { injectManual } from '@/lib/simulation/runner'

// Ambiente de simulação (S1): mensagem avulsa numa empresa simulada mantida (mesmo caminho da ingestão real).
// Corpo: { chat, from: "customer" | "company", text, name?, agent?, minutesAgo?, connection? }. Empresa real → 404.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await simulationAccess(request)
  if (!a.ok) return a.res
  const { id } = await params
  const j = await readJson<Record<string, unknown>>(request)
  if (!j.ok) return j.res
  const b = j.body
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const chat = str(b.chat, 60)
  const text = str(b.text, 4000)
  const from = b.from === 'customer' || b.from === 'company' ? b.from : null
  const minutesAgo = b.minutesAgo === undefined ? 0 : Number(b.minutesAgo)
  const connection = b.connection === undefined ? 0 : Number(b.connection)
  if (!chat || !text || !from) return NextResponse.json({ error: 'Informe chat, from (customer ou company) e text' }, { status: 400 })
  if (!Number.isFinite(minutesAgo) || minutesAgo < 0 || minutesAgo > 7 * 24 * 60) return NextResponse.json({ error: 'minutesAgo inválido (0 a 10080)' }, { status: 400 })
  if (!Number.isInteger(connection) || connection < 0 || connection > 50) return NextResponse.json({ error: 'connection inválida' }, { status: 400 })
  const r = await injectManual(id, { chat, from, text, name: str(b.name, 80), agent: str(b.agent, 80), minutesAgo, connection }, a.by)
  if (!r) return NextResponse.json({ error: 'Empresa simulada não encontrada' }, { status: 404 })
  await auditSimulation(a, 'simulation.inject', { organizationId: id, from, ok: r.ok }, id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true, conversationId: r.conversationId })
}
