import { NextResponse } from 'next/server'
import { guard } from '@/lib/api-auth'
import { allow } from '@/lib/rate-limit'
import { checkout, type CheckoutInput } from '@/lib/billing/service'
import { readJson } from '@/lib/json-body'
import { attributionFrom } from '@/lib/attribution'

// Checkout transparente: o navegador já trocou o cartão por um token no Pagar.me; aqui chegam só o token, o plano,
// o ciclo e os dados de cobrança. Limite de tentativas por empresa contra teste de cartões roubados.
export async function POST(request: Request) {
  const g = await guard('billing.manage', { allowLocked: true })
  if (!g.ok) return g.res
  const limit = Number(process.env.CHECKOUT_ATTEMPTS_PER_HOUR) || 8
  if (!allow(`checkout:${g.auth.orgId}`, limit, 3_600_000)) {
    return NextResponse.json({ error: 'Muitas tentativas de pagamento. Aguarde uma hora ou fale com o suporte.', code: 'too_many_attempts' }, { status: 429 })
  }
  const j = await readJson<CheckoutInput>(request, { optional: true })
  if (!j.ok) return j.res
  const body = j.body
  if (!body) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  const result = await checkout(g.auth, body, attributionFrom(request.headers)) // origem da venda, para a conversão do servidor
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  return NextResponse.json(result)
}
