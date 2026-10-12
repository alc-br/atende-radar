import { NextResponse } from 'next/server'
import { guard } from '@/lib/api-auth'
import { cancelAtPeriodEnd } from '@/lib/billing/service'

// Cancela a renovação automática: o Pagar.me para de cobrar agora; o plano vale até o fim do período já pago.
export async function POST() {
  const g = await guard('billing.manage')
  if (!g.ok) return g.res
  const result = await cancelAtPeriodEnd(g.auth)
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  return NextResponse.json(result)
}
