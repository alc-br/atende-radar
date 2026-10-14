import { db } from './db'

export interface MailAttachment {
  filename: string
  content: Uint8Array
}

interface Mail {
  to: string
  subject: string
  text: string
  /** Anexos (ex.: PDF do relatório). No EmailOutbox fica só o nome e o tamanho de cada um. */
  attachments?: MailAttachment[]
}

export type MailStatus = 'queued' | 'sent' | 'failed'

/**
 * Todo e-mail passa pelo EmailOutbox (registro auditável). Se houver provedor configurado
 * (MAIL_PROVIDER=resend + RESEND_API_KEY + MAIL_FROM) ele é enviado; senão fica 'queued'.
 * Devolve a situação final do registro (quem chama decide o que fazer com uma falha).
 */
export async function sendMail(mail: Mail): Promise<MailStatus> {
  const attachments = mail.attachments?.length ? JSON.stringify(mail.attachments.map((a) => ({ filename: a.filename, size: a.content.byteLength }))) : null
  const row = await db.emailOutbox.create({ data: { toEmail: mail.to, subject: mail.subject, body: mail.text, attachments } })

  if (process.env.MAIL_PROVIDER !== 'resend') return 'queued'
  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!key || !from) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'failed', error: 'RESEND_API_KEY/MAIL_FROM ausentes' } })
    return 'failed'
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.attachments?.length
          ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) }
          : {}),
      }),
    })
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}`)
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date() } })
    return 'sent'
  } catch (e) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'failed', error: e instanceof Error ? e.message : 'erro' } })
    return 'failed'
  }
}

export function appUrl(): string {
  return (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
}
