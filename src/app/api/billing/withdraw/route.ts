import { NextResponse } from 'next/server'
import { guard } from '@/lib/api-auth'
import { withdraw } from '@/lib/billing/service'

// Direito de arrependimento (7 dias do pagamento da contratação): encerra o plano agora e estorna o valor integral.
export async function POST() {
  const g = await guard('billing.manage')
  if (!g.ok) return g.res
  const result = await withdraw(g.auth)
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  return NextResponse.json(result)
}
