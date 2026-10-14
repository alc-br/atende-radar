import { NextResponse } from 'next/server'
import { guard } from '@/lib/api-auth'
import { allow } from '@/lib/rate-limit'
import { replaceCard } from '@/lib/billing/service'
import { readJson } from '@/lib/json-body'

// Troca o cartão da cobrança automática (o novo cartão também chega como token gerado no navegador).
export async function POST(request: Request) {
  const g = await guard('billing.manage')
  if (!g.ok) return g.res
  if (!allow(`card:${g.auth.orgId}`, Number(process.env.CHECKOUT_ATTEMPTS_PER_HOUR) || 8, 3_600_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde uma hora ou fale com o suporte.', code: 'too_many_attempts' }, { status: 429 })
  }
  const j = await readJson<Parameters<typeof replaceCard>[1]>(request, { optional: true })
  if (!j.ok) return j.res
  const body = j.body
  if (!body) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  const result = await replaceCard(g.auth, body)
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  return NextResponse.json(result)
}
