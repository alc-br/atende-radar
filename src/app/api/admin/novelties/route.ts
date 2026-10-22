import { NextResponse } from 'next/server'
import { operatorGuard } from '@/lib/support-admin'
import { listNovelties } from '@/lib/analysis/novelty'

// Admin › Situações novas: temas que o Claude viu nas conversas e os alertas não cobrem. Só o operador da plataforma.
// Por tema vai a contagem de empresas, nunca quais.
export async function GET() {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  try {
    return NextResponse.json(await listNovelties())
  } catch (error) {
    console.error('Admin novelties error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Não foi possível carregar as situações novas' }, { status: 500 })
  }
}
