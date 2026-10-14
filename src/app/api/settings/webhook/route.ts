import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { badRequest, guard } from '@/lib/api-auth'
import { isWebhookEvent, parseEvents, webhookView } from '@/lib/webhooks'
import { generateSecret, resolvesToBlocked, validateWebhookUrl } from '@/lib/webhook-url'

// Webhook de saída da organização (Configurações › Webhook). Só quem altera configurações (admin, gestor).
// O segredo só aparece na resposta da criação (e da troca, em /secret); depois a API mostra só o final dele.

export async function GET() {
  const g = await guard('settings.manage')
  if (!g.ok) return g.res
  return NextResponse.json(await webhookView(g.auth.orgId))
}

export async function PUT(request: Request) {
  const g = await guard('settings.manage')
  if (!g.ok) return g.res
  const body = (await request.json().catch(() => null)) as { url?: unknown; enabled?: unknown; events?: unknown } | null
  if (!body || typeof body !== 'object') return badRequest('Corpo inválido.')

  const existing = await db.webhookEndpoint.findUnique({ where: { organizationId: g.auth.orgId } })
  const data: { url?: string; enabled?: boolean; events?: string } = {}

  if (body.url !== undefined || !existing) {
    const check = validateWebhookUrl(body.url)
    if (!check.ok) return badRequest(check.error)
    if (await resolvesToBlocked(check.url)) return badRequest('Endereço interno ou privado não é permitido.')
    data.url = check.url
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return badRequest('enabled deve ser verdadeiro ou falso.')
    data.enabled = body.enabled
  }
  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || !body.events.every(isWebhookEvent)) return badRequest('Evento desconhecido.')
    data.events = JSON.stringify([...new Set(body.events)])
  }

  const host = new URL(data.url ?? existing!.url).host
  if (!existing) {
    const secret = generateSecret()
    await db.webhookEndpoint.create({
      data: { organizationId: g.auth.orgId, url: data.url!, enabled: data.enabled ?? false, secret, ...(data.events ? { events: data.events } : {}) },
    })
    await audit(g.auth, { action: 'webhook.created', targetType: 'webhook', targetLabel: host, details: { keys: Object.keys(data) } })
    return NextResponse.json({ ...(await webhookView(g.auth.orgId)), secret }, { status: 201 })
  }

  const changed = Object.keys(data).filter((k) => {
    if (k === 'events') return JSON.stringify(parseEvents(existing.events)) !== data.events
    return (existing as Record<string, unknown>)[k] !== (data as Record<string, unknown>)[k]
  })
  if (changed.length) {
    await db.webhookEndpoint.update({ where: { id: existing.id }, data })
    await audit(g.auth, { action: 'webhook.updated', targetType: 'webhook', targetId: existing.id, targetLabel: host, details: { keys: changed } })
  }
  return NextResponse.json(await webhookView(g.auth.orgId))
}

export async function DELETE() {
  const g = await guard('settings.manage')
  if (!g.ok) return g.res
  const existing = await db.webhookEndpoint.findUnique({ where: { organizationId: g.auth.orgId } })
  if (!existing) return NextResponse.json({ success: true })
  await db.webhookEndpoint.delete({ where: { id: existing.id } })
  // o que ainda estava na fila não sai mais
  await db.webhookDelivery.updateMany({ where: { organizationId: g.auth.orgId, status: 'pending' }, data: { status: 'skipped', payload: null, lastError: 'Webhook removido' } })
  await audit(g.auth, { action: 'webhook.removed', targetType: 'webhook', targetId: existing.id, targetLabel: new URL(existing.url).host })
  return NextResponse.json({ success: true })
}
