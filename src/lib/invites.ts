import { issueToken } from './auth-tokens'
import { appUrl, sendMail, type MailStatus } from './mailer'
import { isRole, roleName, ROLE_DESCRIPTIONS } from './permissions'

/**
 * Gera um link de convite novo (invalida os anteriores do membro) e manda o e-mail.
 * Devolve a situação do e-mail e, quando ele NÃO saiu (sem provedor configurado, ou o envio falhou), o link para o
 * admin repassar à pessoa. Uma falha é tentada de novo sozinha (retryFailedEmails), mas a tela avisa.
 */
export async function sendInvite(
  inviter: { name: string },
  member: { id: string; name: string; email: string; role: string },
): Promise<{ inviteLink?: string; emailStatus: MailStatus }> {
  const token = await issueToken(member.id, 'invite')
  const link = `${appUrl()}/accept-invite?token=${token}`
  const emailStatus = await sendMail({
    to: member.email,
    subject: `${inviter.name} convidou você para o AtendeRadar`,
    text: `Olá, ${member.name}!

${inviter.name} convidou você para o AtendeRadar como "${roleName(member.role)}".
${isRole(member.role) ? `${ROLE_DESCRIPTIONS[member.role]}\n` : ''}
Crie a sua senha e entre por este link (vale por 7 dias):
${link}
`,
  })
  return { emailStatus, inviteLink: emailStatus === 'sent' ? undefined : link }
}
