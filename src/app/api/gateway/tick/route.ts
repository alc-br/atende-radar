import { NextResponse } from 'next/server'
import { gatewayGuard } from '@/lib/gateway-auth'
import { analyzeAll, analyzeOrganization } from '@/lib/analysis/engine'
import { runScheduledReports } from '@/lib/reports/schedule'
import { readJson } from '@/lib/json-body'
import { trialEndingNotices } from '@/lib/billing/trial'
import { processWebhookOutbox } from '@/lib/webhooks'

// Roda o motor de análise agora (mesma função que o agendador interno chama a cada minuto).
// Serve também para um agendador externo (cron) e para os testes. Também processa a fila de webhooks. Exige o segredo do gateway.
// Com { reportsAt: ISO } roda os relatórios agendados como se fosse aquele instante (testes de horário/dia da semana).
export async function POST(request: Request) {
  const denied = gatewayGuard(request)
  if (denied) return denied
  const j = await readJson<{ organizationId?: unknown }>(request, { optional: true })
  if (!j.ok) return j.res
  const body = j.body
  const orgId = typeof body?.organizationId === 'string' && body.organizationId ? body.organizationId : null
  if (body && 'reportsAt' in body) {
    const at = new Date(String((body as { reportsAt?: unknown }).reportsAt))
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'reportsAt inválido' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await runScheduledReports(at, orgId ?? undefined)) })
  }
  // Com { trialNoticesAt: ISO } cria os avisos de fim do teste grátis como se fosse aquele instante.
  if (body && 'trialNoticesAt' in body) {
    const at = new Date(String((body as { trialNoticesAt?: unknown }).trialNoticesAt))
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'trialNoticesAt inválido' }, { status: 400 })
    return NextResponse.json({ ok: true, trialNotices: await trialEndingNotices(at, orgId ?? undefined) })
  }
  const summary = orgId ? await analyzeOrganization(orgId) : await analyzeAll()
  // fila de webhooks: entrega o que venceu (nos testes o agendador está desligado; isto deixa o envio determinístico)
  const webhooks = await processWebhookOutbox(orgId ? { organizationId: orgId } : {})
  return NextResponse.json({ ok: true, ...summary, webhooks })
}
