import { issueToken } from './auth-tokens'
import { appUrl, sendMail } from './mailer'

/**
 * Gera um link de convite novo (invalida os anteriores do membro) e manda o e-mail.
 * Sem provedor de e-mail configurado o convite não chega à pessoa: devolve o link para o admin repassar.
 */
export async function sendInvite(inviter: { name: string }, member: { id: string; name: string; email: string; role: string }): Promise<string | undefined> {
  const token = await issueToken(member.id, 'invite')
  const link = `${appUrl()}/accept-invite?token=${token}`
  await sendMail({
    to: member.email,
    subject: `${inviter.name} convidou você para o AtendeRadar`,
    text: `Olá, ${member.name}!

${inviter.name} convidou você para o AtendeRadar como "${member.role}".
Crie a sua senha e entre por este link (vale por 7 dias):
${link}
`,
  })
  return process.env.MAIL_PROVIDER === 'resend' ? undefined : link
}
