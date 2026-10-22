import { NextResponse } from 'next/server'
import { operatorGuard } from '@/lib/support-admin'
import { aiEnabled } from '@/lib/analysis/ai-classify'
import { clusterNovelSignals } from '@/lib/analysis/novelty'

/** "Agrupar agora": agrupa as frases pendentes sem esperar a semana. Precisa da IA ligada. */
export async function POST() {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  if (!aiEnabled()) return NextResponse.json({ error: 'A classificação por IA está desligada' }, { status: 409 })
  const r = await clusterNovelSignals(new Date(), { force: true })
  if (!r) return NextResponse.json({ error: 'Não foi possível agrupar agora. Tente novamente em alguns minutos.' }, { status: 502 })
  return NextResponse.json(r)
}
