import { NextResponse } from 'next/server'
import { readJson } from '@/lib/json-body'
import { allow, clientIp } from '@/lib/rate-limit'
import { CONSENT_CHOICES, countConsentChoice, type ConsentChoice } from '@/lib/product-events'

// Escolha no aviso de cookies (docs/operacao/medicao.md): soma 1 no contador do dia para "aceitou todos", "recusou" ou
// "configurou". Mede a taxa de aceite sem cookie, sem IP guardado e sem identificador (o IP só serve, em memória, para o
// limite de chamadas). Acima do limite responde 204 sem contar.
const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const limit = Number(process.env.CONSENT_RATE_LIMIT_PER_MIN) || 10
  if (!allow(`consent:${clientIp(request)}`, limit, 60_000)) return noContent()
  const j = await readJson<{ choice?: unknown }>(request)
  if (!j.ok) return j.res
  const choice = j.body.choice
  if (typeof choice !== 'string' || !(CONSENT_CHOICES as readonly string[]).includes(choice)) {
    return NextResponse.json({ error: 'Escolha inválida' }, { status: 400 })
  }
  await countConsentChoice(choice as ConsentChoice)
  return noContent()
}
