import { NextResponse } from 'next/server'
import { auditSimulation, simulationAccess } from '@/lib/simulation/access'
import { cleanSimulations } from '@/lib/simulation/cleanup'

// Ambiente de simulação (S1): apaga TODAS as empresas simuladas (só isSimulation; empresa real nunca é tocada).
export async function POST(request: Request) {
  const a = await simulationAccess(request)
  if (!a.ok) return a.res
  const r = await cleanSimulations(a.by)
  await auditSimulation(a, 'simulation.clean', { deleted: r.deleted })
  return NextResponse.json({ ok: true, deleted: r.deleted })
}
