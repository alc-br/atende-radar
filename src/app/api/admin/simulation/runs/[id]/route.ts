import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { simulationAccess } from '@/lib/simulation/access'

// Ambiente de simulação (S1): resultado completo de uma execução.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await simulationAccess(request)
  if (!a.ok) return a.res
  const { id } = await params
  const run = await db.simulationRun.findUnique({ where: { id } })
  if (!run) return NextResponse.json({ error: 'Execução não encontrada' }, { status: 404 })
  const { resultJson, ...rest } = run
  const result = (() => {
    try {
      return resultJson ? (JSON.parse(resultJson) as unknown) : null
    } catch {
      return null
    }
  })()
  return NextResponse.json({ run: rest, result })
}
