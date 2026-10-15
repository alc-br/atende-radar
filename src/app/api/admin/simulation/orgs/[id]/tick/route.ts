import { NextResponse } from 'next/server'
import { auditSimulation, simulationAccess } from '@/lib/simulation/access'
import { tickManual } from '@/lib/simulation/runner'

// Ambiente de simulação (S1): roda o motor agora numa empresa simulada mantida. Empresa real → 404.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await simulationAccess(request)
  if (!a.ok) return a.res
  const { id } = await params
  const summary = await tickManual(id, a.by)
  if (!summary) return NextResponse.json({ error: 'Empresa simulada não encontrada' }, { status: 404 })
  await auditSimulation(a, 'simulation.tick', { organizationId: id, alertsOpened: summary.alertsOpened, alertsResolved: summary.alertsResolved }, id)
  return NextResponse.json({ ok: true, summary })
}
