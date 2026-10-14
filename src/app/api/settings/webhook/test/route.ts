import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, notFound } from '@/lib/api-auth'
import { allow } from '@/lib/rate-limit'
import { sendTestEvent } from '@/lib/webhooks'

// "Enviar teste": manda um evento webhook.test assinado agora (mesmo se o webhook estiver desligado) e devolve o resultado.
export async function POST() {
  const g = await guard('settings.manage')
  if (!g.ok) return g.res
  const exists = await db.webhookEndpoint.count({ where: { organizationId: g.auth.orgId } })
  if (!exists) return notFound('Webhook')
  if (!allow(`webhook-test:${g.auth.orgId}`, 30, 60 * 60_000)) {
    return NextResponse.json({ error: 'Muitos testes seguidos. Tente de novo mais tarde.' }, { status: 429 })
  }
  const result = await sendTestEvent(g.auth.orgId)
  return NextResponse.json({ ok: result.ok, statusCode: result.statusCode ?? null, error: result.error ?? null })
}
