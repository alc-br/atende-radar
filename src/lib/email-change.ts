import { db } from './db'
import { audit } from './audit'
import { consumeToken, issueToken } from './auth-tokens'
import { appUrl, sendMail } from './mailer'
import { queueMemberSync } from './mautic'

// Troca do e-mail de acesso (P7). O e-mail só muda quando a pessoa abre o link enviado ao NOVO endereço
// (token de uso único, 24 h). O endereço antigo é avisado no pedido e na confirmação.

/** n•••@dominio.com: o aviso ao e-mail antigo mostra para onde vai a conta sem expor o endereço inteiro. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return '•••'
  return `${user.slice(0, 1)}•••@${domain}`
}

export const emailInUse = async (email: string, exceptMemberId?: string) =>
  !!(await db.organizationMember.findFirst({ where: { email, ...(exceptMemberId ? { id: { not: exceptMemberId } } : {}) }, select: { id: true } }))

export async function requestEmailChange(member: { id: string; name: string; email: string }, newEmail: string) {
  await db.organizationMember.update({ where: { id: member.id }, data: { pendingEmail: newEmail } })
  const token = await issueToken(member.id, 'email_change') // invalida links de pedidos anteriores
  await sendMail({
    to: newEmail,
    subject: 'Confirme o seu novo e-mail — AtendeRadar',
    text:
      `Olá, ${member.name}!\n\nRecebemos um pedido para usar este endereço como e-mail de acesso ao AtendeRadar.\n` +
      `Para confirmar, abra o link (vale por 24 horas e só pode ser usado uma vez):\n${appUrl()}/confirm-email?token=${token}\n\n` +
      'Até você confirmar, o e-mail de acesso continua o anterior. Se não foi você, ignore este e-mail.',
  })
  await sendMail({
    to: member.email,
    subject: 'Pedido de troca do seu e-mail de acesso — AtendeRadar',
    text:
      `Olá, ${member.name}!\n\nAlguém conectado à sua conta pediu para trocar o e-mail de acesso para ${maskEmail(newEmail)}.\n` +
      'A troca só acontece quando o novo endereço confirmar pelo link que enviamos para ele.\n\n' +
      'Se não foi você, entre no AtendeRadar, cancele a troca em Meu perfil e troque a sua senha.',
  })
}

export type ConfirmResult = { ok: true } | { ok: false; status: 400 | 409; error: string }

/** Confirma pelo token do e-mail. O token é gasto mesmo se o endereço tiver sido tomado por outra conta nesse meio-tempo. */
export async function confirmEmailChange(token: string): Promise<ConfirmResult> {
  const invalid: ConfirmResult = { ok: false, status: 400, error: 'Link inválido ou expirado. Peça a troca de novo em Meu perfil.' }
  const memberId = token ? await consumeToken(token, 'email_change') : null
  if (!memberId) return invalid
  const m = await db.organizationMember.findUnique({ where: { id: memberId } })
  if (!m || !m.pendingEmail || m.status !== 'active') return invalid
  const newEmail = m.pendingEmail
  const oldEmail = m.email
  if (await emailInUse(newEmail, m.id)) {
    await db.organizationMember.update({ where: { id: m.id }, data: { pendingEmail: null } })
    return { ok: false, status: 409, error: 'Este e-mail passou a ser usado por outra conta. Escolha outro em Meu perfil.' }
  }

  await db.$transaction(async (tx) => {
    await tx.organizationMember.update({
      where: { id: m.id },
      data: {
        email: newEmail,
        pendingEmail: null,
        emailVerifiedAt: new Date(), // o link chegou ao novo endereço: ele está confirmado
        ...(m.userId === oldEmail ? { userId: newEmail } : {}),
      },
    })
    // o atendente é ligado ao membro pelo e-mail (escopo "só os meus"): acompanha a troca na mesma empresa
    await tx.agent.updateMany({ where: { organizationId: m.organizationId, email: oldEmail }, data: { email: newEmail } })
  })
  await audit(
    { orgId: m.organizationId, memberId: m.id, email: newEmail, role: m.role },
    { action: 'account.email_changed', targetType: 'member', targetId: m.id, targetLabel: newEmail },
  )
  queueMemberSync(m.id) // o novo endereço vira contato no Mautic (nunca lança)
  await sendMail({
    to: oldEmail,
    subject: 'O seu e-mail de acesso foi trocado — AtendeRadar',
    text:
      `Olá, ${m.name}!\n\nO e-mail de acesso da sua conta no AtendeRadar agora é ${maskEmail(newEmail)}. Este endereço não entra mais.\n\n` +
      'Se não foi você, fale com o administrador da sua empresa imediatamente.',
  })
  return { ok: true }
}
