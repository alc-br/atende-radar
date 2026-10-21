import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { allow } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/email-verification'

// "Reenviar e-mail de confirmação" da faixa do painel: manda um link novo para o PRÓPRIO endereço de quem está logado.
// Até 3 por hora, para a faixa não virar um jeito de lotar a caixa de alguém.
export async function POST() {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const m = await db.organizationMember.findUnique({ where: { id: g.auth.memberId }, select: { id: true, name: true, email: true, emailVerifiedAt: true } })
  if (!m) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (m.emailVerifiedAt) return NextResponse.json({ success: true, alreadyVerified: true })
  if (!allow(`verify-resend:${m.id}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Já enviamos alguns e-mails nesta hora. Confira a caixa de spam ou tente de novo mais tarde.' }, { status: 429 })
  }
  await sendVerificationEmail(m)
  return NextResponse.json({ success: true, email: m.email })
}
