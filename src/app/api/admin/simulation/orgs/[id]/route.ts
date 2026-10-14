import { NextResponse } from 'next/server'
import { auditSimulation, simulationAccess } from '@/lib/simulation/access'
import { simulationSnapshot } from '@/lib/simulation/runner'

// Ambiente de simulação (S1): retrato (só leitura) de uma empresa simulada mantida. Empresa real → 404.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await simulationAccess(request)
  if (!a.ok) return a.res
  const { id } = await params
  const snap = await simulationSnapshot(id)
  if (!snap) return NextResponse.json({ error: 'Empresa simulada não encontrada' }, { status: 404 })
  await auditSimulation(a, 'simulation.viewed', { organizationId: id }, id)
  return NextResponse.json(snap)
}
