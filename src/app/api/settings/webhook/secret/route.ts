import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, notFound } from '@/lib/api-auth'
import { generateSecret } from '@/lib/webhook-url'

// Gera um segredo novo (o anterior para de valer na hora). É a única vez que o novo segredo aparece.
export async function POST() {
  const g = await guard('settings.manage')
  if (!g.ok) return g.res
  const existing = await db.webhookEndpoint.findUnique({ where: { organizationId: g.auth.orgId } })
  if (!existing) return notFound('Webhook')
  const secret = generateSecret()
  await db.webhookEndpoint.update({ where: { id: existing.id }, data: { secret } })
  await audit(g.auth, { action: 'webhook.secret_rotated', targetType: 'webhook', targetId: existing.id, targetLabel: new URL(existing.url).host })
  return NextResponse.json({ secret, secretHint: `…${secret.slice(-4)}` })
}
