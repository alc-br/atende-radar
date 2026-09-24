import { NextResponse } from 'next/server'
import { gatewayGuard } from '@/lib/gateway-auth'
import { analyzeAll } from '@/lib/analysis/engine'

// Roda o motor de análise agora (mesma função que o agendador interno chama a cada minuto).
// Serve também para um agendador externo (cron) e para os testes. Exige o segredo do gateway.
export async function POST(request: Request) {
  const denied = gatewayGuard(request)
  if (denied) return denied
  const summary = await analyzeAll()
  return NextResponse.json({ ok: true, ...summary })
}
