import { NextResponse } from 'next/server'
import { readJson } from '@/lib/json-body'
import { auditSimulation, simulationAccess } from '@/lib/simulation/access'
import { runScenarios, scenarioById } from '@/lib/simulation/runner'

// Ambiente de simulação (S1): roda um cenário (ou "todos") e devolve o resultado por asserção.
// Corpo: { scenarioId: string | "todos", keep?: boolean } (keep mantém a empresa simulada por 24 h).
export async function POST(request: Request) {
  const a = await simulationAccess(request)
  if (!a.ok) return a.res
  const j = await readJson<{ scenarioId?: unknown; keep?: unknown }>(request)
  if (!j.ok) return j.res
  const id = typeof j.body.scenarioId === 'string' ? j.body.scenarioId : ''
  if (!id || (id !== 'todos' && !scenarioById(id))) return NextResponse.json({ error: 'Cenário não existe' }, { status: 400 })
  const keep = j.body.keep === true
  const results = await runScenarios(id, { keep, startedBy: a.by })
  const passed = results.filter((r) => r.status === 'passed').length
  await auditSimulation(a, 'simulation.run', { scenarioId: id, keep, total: results.length, passed })
  return NextResponse.json({ ok: passed === results.length, total: results.length, passed, failed: results.length - passed, results })
}
