import { toast } from 'sonner'

/** Aviso depois de criar/reenviar um convite: e-mail enviado, ou o link para repassar quando o e-mail não saiu. */
export async function showInviteLink(email: string, link: string | undefined, title: string, emailStatus?: string) {
  if (emailStatus === 'failed') {
    if (link) await navigator.clipboard?.writeText(link).catch(() => {})
    toast.error(`${title.replace(/\.$/, '')}, mas o e-mail para ${email} não foi entregue.`, {
      description: link
        ? `O sistema tenta enviar de novo sozinho. Se preferir, repasse o link (já copiado): ${link}`
        : 'O sistema tenta enviar de novo sozinho.',
      duration: 20000,
    })
  } else if (link) {
    // Sem provedor de e-mail: o link precisa ser repassado à pessoa manualmente.
    await navigator.clipboard?.writeText(link).catch(() => {})
    toast.success(`${title} Link copiado!`, {
      description: `Envie este link para ${email}: ${link}`,
      duration: 20000,
    })
  } else {
    toast.success(`${title} E-mail enviado para ${email}.`)
  }
}
