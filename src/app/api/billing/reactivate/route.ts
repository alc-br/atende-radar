import { NextResponse } from 'next/server'
import { guard } from '@/lib/api-auth'
import { reactivateRenewal } from '@/lib/billing/service'

// Reativa a renovação cancelada enquanto o período pago vale. Nada é cobrado agora: a próxima cobrança fica para o
// dia seguinte ao fim do período, no mesmo cartão e pelo mesmo valor (ver reactivateRenewal).
export async function POST() {
  const g = await guard('billing.manage')
  if (!g.ok) return g.res
  const result = await reactivateRenewal(g.auth)
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  return NextResponse.json(result)
}
