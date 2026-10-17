import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { verifyPassword } from '@/lib/passwords'
import { allow, exceeded } from '@/lib/rate-limit'
import { readJson } from '@/lib/json-body'
import { emailInUse, requestEmailChange } from '@/lib/email-change'

// Troca do próprio e-mail de acesso (P7): pede a senha atual e manda o link de confirmação para o NOVO e-mail.
// Senha errada conta como tentativa (5 em 15 min bloqueiam, como na troca de senha); pedidos aceitos: 5 por hora
// (cada um manda dois e-mails).
const MAX_FAILS = 5
const FAIL_WINDOW_MS = 15 * 60000
const MAX_REQUESTS = 5
const REQUEST_WINDOW_MS = 60 * 60000

const Body = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.').max(200),
  newEmail: z.string().trim().toLowerCase().email('E-mail inválido.').max(200, 'E-mail longo demais.'),
})

export async function POST(request: Request) {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const failKey = `email-change-fail:${g.auth.memberId}`
  if (exceeded(failKey, MAX_FAILS, FAIL_WINDOW_MS)) {
    return NextResponse.json({ error: 'Muitas tentativas com a senha atual errada. Tente novamente em 15 minutos.' }, { status: 429 })
  }
  const j = await readJson(request, { optional: true })
  if (!j.ok) return j.res
  const parsed = Body.safeParse(j.body ?? {})
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' }, { status: 400 })
  const { currentPassword, newEmail } = parsed.data

  const member = await db.organizationMember.findUnique({ where: { id: g.auth.memberId } })
  if (!member) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!member.passwordHash) {
    return NextResponse.json({ error: 'Esta conta não tem senha própria. Crie uma em "Esqueceu sua senha?" antes de trocar o e-mail.' }, { status: 400 })
  }
  if (!verifyPassword(currentPassword, member.passwordHash)) {
    allow(failKey, Number.MAX_SAFE_INTEGER, FAIL_WINDOW_MS) // conta a falha
    return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 })
  }
  if (newEmail === member.email.toLowerCase()) return NextResponse.json({ error: 'Este já é o seu e-mail de acesso.' }, { status: 400 })
  if (await emailInUse(newEmail, member.id)) {
    return NextResponse.json({ error: 'Este e-mail já é usado por outra conta. Escolha outro.' }, { status: 409 })
  }
  if (!allow(`email-change:${member.id}`, MAX_REQUESTS, REQUEST_WINDOW_MS)) {
    return NextResponse.json({ error: 'Muitos pedidos de troca de e-mail. Tente novamente mais tarde.' }, { status: 429 })
  }

  await requestEmailChange(member, newEmail)
  // o novo endereço não vai para o registro (só que houve o pedido)
  await audit(g.auth, { action: 'account.email_change_requested', targetType: 'member', targetId: member.id, targetLabel: member.email })
  return NextResponse.json({ success: true, pendingEmail: newEmail })
}

/** Cancela a troca pendente: o link enviado deixa de valer. */
export async function DELETE() {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const member = await db.organizationMember.findUnique({ where: { id: g.auth.memberId }, select: { id: true, email: true, pendingEmail: true } })
  if (member?.pendingEmail) {
    await db.$transaction([
      db.organizationMember.update({ where: { id: member.id }, data: { pendingEmail: null } }),
      db.authToken.updateMany({ where: { memberId: member.id, type: 'email_change', usedAt: null }, data: { usedAt: new Date() } }),
    ])
    await audit(g.auth, { action: 'account.email_change_canceled', targetType: 'member', targetId: member.id, targetLabel: member.email })
  }
  return NextResponse.json({ success: true, pendingEmail: null })
}
