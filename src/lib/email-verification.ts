import { issueToken } from './auth-tokens'
import { appUrl, sendMail } from './mailer'

/** E-mail com o link de confirmação do endereço (cadastro e "Reenviar" da faixa do painel). Um link novo invalida o anterior. */
export async function sendVerificationEmail(member: { id: string; name: string; email: string }) {
  const token = await issueToken(member.id, 'verify')
  return sendMail({
    to: member.email,
    subject: 'Confirme o seu e-mail — AtendeRadar',
    text: `Olá, ${member.name}!\n\nSua conta do AtendeRadar foi criada. Confirme o seu e-mail:\n${appUrl()}/verify-email?token=${token}\n\nO link vale por 3 dias.`,
  })
}
