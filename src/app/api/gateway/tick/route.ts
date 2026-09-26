import { NextResponse } from 'next/server'
import { gatewayGuard } from '@/lib/gateway-auth'
import { analyzeAll, analyzeOrganization } from '@/lib/analysis/engine'

// Roda o motor de análise agora (mesma função que o agendador interno chama a cada minuto).
// Serve também para um agendador externo (cron) e para os testes. Exige o segredo do gateway.
export async function POST(request: Request) {
  const denied = gatewayGuard(request)
  if (denied) return denied
  const body = (await request.json().catch(() => null)) as { organizationId?: unknown } | null
  const orgId = typeof body?.organizationId === 'string' && body.organizationId ? body.organizationId : null
  const summary = orgId ? await analyzeOrganization(orgId) : await analyzeAll()
  return NextResponse.json({ ok: true, ...summary })
}
