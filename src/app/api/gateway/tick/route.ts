import { NextResponse } from 'next/server'
import { gatewayGuard } from '@/lib/gateway-auth'
import { analyzeAll, analyzeOrganization } from '@/lib/analysis/engine'
import { runScheduledReports } from '@/lib/reports/schedule'

// Roda o motor de análise agora (mesma função que o agendador interno chama a cada minuto).
// Serve também para um agendador externo (cron) e para os testes. Exige o segredo do gateway.
// Com { reportsAt: ISO } roda os relatórios agendados como se fosse aquele instante (testes de horário/dia da semana).
export async function POST(request: Request) {
  const denied = gatewayGuard(request)
  if (denied) return denied
  const body = (await request.json().catch(() => null)) as { organizationId?: unknown } | null
  const orgId = typeof body?.organizationId === 'string' && body.organizationId ? body.organizationId : null
  if (body && 'reportsAt' in body) {
    const at = new Date(String((body as { reportsAt?: unknown }).reportsAt))
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'reportsAt inválido' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await runScheduledReports(at, orgId ?? undefined)) })
  }
  const summary = orgId ? await analyzeOrganization(orgId) : await analyzeAll()
  return NextResponse.json({ ok: true, ...summary })
}
