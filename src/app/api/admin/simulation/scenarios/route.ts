import { NextResponse } from 'next/server'
import { simulationAccess } from '@/lib/simulation/access'
import { scenarioCatalog } from '@/lib/simulation/scenarios'

// Ambiente de simulação (S1): catálogo de cenários. Operador da plataforma ou Bearer SIMULATION_SECRET.
export async function GET(request: Request) {
  const a = await simulationAccess(request)
  if (!a.ok) return a.res
  return NextResponse.json({ scenarios: scenarioCatalog() })
}
