import { NextResponse } from 'next/server'
import { gatewayGuard } from '@/lib/gateway-auth'
import { analyzeAll, analyzeOrganization } from '@/lib/analysis/engine'
import { runScheduledReports } from '@/lib/reports/schedule'
import { readJson } from '@/lib/json-body'
import { trialEndingNotices } from '@/lib/billing/trial'
import { processWebhookOutbox } from '@/lib/webhooks'
import { purgeDueDeletions } from '@/lib/org-deletion'
import { purgeProductEvents } from '@/lib/privacy'
import { flushAlertEmails } from '@/lib/alert-email'
import { retryFailedEmails } from '@/lib/mailer'
import { endExpiredPlans } from '@/lib/billing/service'
import { disconnectLockedOrgs, pastDueNotices } from '@/lib/billing/delinquency'

// Roda o motor de análise agora (mesma função que o agendador interno chama a cada minuto).
// Serve também para um agendador externo (cron) e para os testes. Também processa a fila de webhooks. Exige o segredo do gateway.
// Com { reportsAt: ISO } roda os relatórios agendados como se fosse aquele instante (testes de horário/dia da semana).
// Com { deletionsAt: ISO } apaga as empresas cujo prazo de exclusão vence até aquele instante. Só fora de produção:
// em produção adiantar o relógio apagaria empresas antes do prazo de desistência.
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
  // Com { delinquencyAt: ISO } roda os avisos da inadimplência e a desconexão das empresas bloqueadas como se fosse
  // aquele instante. Só fora de produção: adiantar o relógio desconectaria números antes do prazo.
  if (body && 'delinquencyAt' in body) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'delinquencyAt só existe fora de produção' }, { status: 400 })
    const at = new Date(String((body as { delinquencyAt?: unknown }).delinquencyAt))
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'delinquencyAt inválido' }, { status: 400 })
    return NextResponse.json({ ok: true, pastDueNotices: await pastDueNotices(at, orgId ?? undefined), disconnected: await disconnectLockedOrgs(at, orgId ?? undefined) })
  }
  if (body && 'deletionsAt' in body) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'deletionsAt só existe fora de produção' }, { status: 400 })
    const at = new Date(String((body as { deletionsAt?: unknown }).deletionsAt))
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'deletionsAt inválido' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await purgeDueDeletions(at, orgId ?? undefined)) })
  }
  const deletions = await purgeDueDeletions()
  const productEvents = await purgeProductEvents().catch((e) => {
    console.error('[tick] retenção dos eventos de produto falhou', e instanceof Error ? e.message : e)
    return null
  })
  const summary = orgId ? await analyzeOrganization(orgId) : await analyzeAll()
  // fila de webhooks: entrega o que venceu (nos testes o agendador está desligado; isto deixa o envio determinístico)
  const webhooks = await processWebhookOutbox(orgId ? { organizationId: orgId } : {})
  // alertas por e-mail: envia os pendentes que já podem sair e tenta de novo os e-mails que falharam
  const now = new Date()
  const alertEmails = await flushAlertEmails(now, orgId ?? undefined)
  const emailRetries = await retryFailedEmails(now, { organizationId: orgId ?? undefined })
  // planos com a renovação cancelada cujo período pago acabou (o mesmo passo da varredura de cobrança)
  const endedPlans = await endExpiredPlans(now, orgId ?? undefined)
  // inadimplência (lembretes e bloqueio) e números das empresas bloqueadas há 2 dias
  const pastDue = await pastDueNotices(now, orgId ?? undefined)
  const disconnected = await disconnectLockedOrgs(now, orgId ?? undefined)
  return NextResponse.json({ ok: true, ...summary, webhooks, alertEmails, emailRetries, endedPlans, pastDueNotices: pastDue, disconnected, deletedOrganizations: deletions.deleted, purgedProductEvents: productEvents })
}
