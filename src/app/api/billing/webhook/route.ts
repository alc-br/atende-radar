import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkBasicAuth, subscriptionIdFromEvent } from '@/lib/billing/core'
import { pagarme, pagarmeConfig, PagarmeError } from '@/lib/billing/pagarme'
import { applyProviderState, APP_TAG } from '@/lib/billing/service'

// Aviso (webhook) do Pagar.me. Público (fora do proxy de sessão), protegido por autenticação básica
// (PAGARME_WEBHOOK_USER / PAGARME_WEBHOOK_PASS, as mesmas cadastradas no painel do Pagar.me).
// O conteúdo do aviso NÃO é confiado: ele só diz QUAL assinatura mudou; a situação é lida de novo na API.
// A conta do Pagar.me pode ser compartilhada com outros sistemas: avisos que não são do AtendeRadar respondem 200 e são ignorados.
export async function POST(request: Request) {
  if (!checkBasicAuth(request.headers.get('authorization'), process.env.PAGARME_WEBHOOK_USER ?? '', process.env.PAGARME_WEBHOOK_PASS ?? '')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const cfg = pagarmeConfig()
  if (!cfg) return NextResponse.json({ error: 'Pagamento não configurado' }, { status: 503 })

  const event = (await request.json().catch(() => null)) as { id?: string; type?: string } | null
  if (!event?.id || !event.type) return NextResponse.json({ error: 'Aviso inválido' }, { status: 400 })

  const already = await db.paymentEvent.findUnique({ where: { providerEventId: String(event.id) } })
  if (already && already.outcome !== 'error') return NextResponse.json({ received: true, duplicate: true })

  const subId = subscriptionIdFromEvent(event)
  let outcome = 'ignored'
  let orgId: string | null = null
  let error: string | null = null
  if (subId) {
    try {
      const sub = await pagarme.getSubscription(cfg, subId)
      const meta = (sub.metadata ?? {}) as Record<string, string>
      if (meta.app === APP_TAG && meta.organizationId && (await db.organization.findUnique({ where: { id: meta.organizationId }, select: { id: true } }))) {
        orgId = meta.organizationId
        const r = await applyProviderState(cfg, orgId, sub)
        outcome = r.kind === 'ignored' ? 'ignored' : 'synced'
      }
    } catch (e) {
      // 404 = assinatura de outro ambiente/conta: não é nossa. Outros erros: o Pagar.me reenvia o aviso.
      if (e instanceof PagarmeError && e.status === 404) outcome = 'ignored'
      else {
        outcome = 'error'
        error = e instanceof Error ? e.message.slice(0, 500) : 'erro'
      }
    }
  }

  const data = { type: String(event.type).slice(0, 80), providerSubscriptionId: subId, organizationId: orgId, outcome, error }
  await db.paymentEvent.upsert({ where: { providerEventId: String(event.id) }, create: { providerEventId: String(event.id), ...data }, update: data })
  if (outcome === 'error') return NextResponse.json({ error: 'Falha ao processar; tente de novo' }, { status: 500 })
  return NextResponse.json({ received: true, outcome })
}
