import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { simulationAccess } from '@/lib/simulation/access'

// Ambiente de simulação (S1): últimas execuções (rodar, injetar, tick, limpar) com quem fez, e as empresas mantidas.
export async function GET(request: Request) {
  const a = await simulationAccess(request)
  if (!a.ok) return a.res
  const [runs, kept] = await Promise.all([
    db.simulationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, kind: true, scenarioId: true, status: true, organizationId: true, startedBy: true, createdAt: true, finishedAt: true },
    }),
    db.organization.findMany({
      where: { isSimulation: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, displayName: true, simulationExpiresAt: true, createdAt: true },
    }),
  ])
  return NextResponse.json({ runs, keptOrganizations: kept })
}
