import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/passwords'
import { allow, exceeded } from '@/lib/rate-limit'
import { reissueSessionCookie } from '@/lib/session-cookie'

// Trocar a própria senha (P7): exige a senha atual e segue as mesmas regras do cadastro/recuperação.
// Senha atual errada conta como tentativa: 5 em 15 min bloqueiam a troca (como o login), para uma sessão
// esquecida aberta não virar um jeito de adivinhar a senha.
const MAX_FAILS = 5
const WINDOW_MS = 15 * 60000

export async function POST(request: Request) {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const key = `password-change:${g.auth.memberId}`
  if (exceeded(key, MAX_FAILS, WINDOW_MS)) {
    return NextResponse.json({ error: 'Muitas tentativas com a senha atual errada. Tente novamente em 15 minutos.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as { currentPassword?: unknown; newPassword?: unknown } | null
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
  if (!currentPassword) return NextResponse.json({ error: 'Informe a senha atual.' }, { status: 400 })
  if (!newPassword) return NextResponse.json({ error: 'Informe a nova senha.' }, { status: 400 })

  const member = await db.organizationMember.findUnique({ where: { id: g.auth.memberId } })
  if (!member) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!member.passwordHash) {
    return NextResponse.json({ error: 'Esta conta não tem senha própria. Use "Esqueceu sua senha?" na tela de entrar para criar uma.' }, { status: 400 })
  }

  if (!verifyPassword(currentPassword, member.passwordHash)) {
    allow(key, Number.MAX_SAFE_INTEGER, WINDOW_MS) // conta a falha
    return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 })
  }

  const problem = passwordProblem(newPassword, member.email)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  if (newPassword === currentPassword) return NextResponse.json({ error: 'A nova senha precisa ser diferente da atual.' }, { status: 400 })

  const updated = await db.organizationMember.update({
    where: { id: member.id },
    data: {
      passwordHash: hashPassword(newPassword),
      failedLogins: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 }, // derruba as sessões abertas em outros aparelhos
    },
  })
  // quem trocou continua logado neste aparelho
  const keptSession = await reissueSessionCookie(updated.sessionVersion)
  await audit(g.auth, { action: 'account.password_changed', targetType: 'member', targetId: member.id, targetLabel: member.email })
  return NextResponse.json({ success: true, keptSession })
}
