import { db } from './db'

interface Mail {
  to: string
  subject: string
  text: string
}

/**
 * Todo e-mail passa pelo EmailOutbox (registro auditável). Se houver provedor configurado
 * (MAIL_PROVIDER=resend + RESEND_API_KEY + MAIL_FROM) ele é enviado; senão fica 'queued'.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const row = await db.emailOutbox.create({ data: { toEmail: mail.to, subject: mail.subject, body: mail.text } })

  if (process.env.MAIL_PROVIDER !== 'resend') return
  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!key || !from) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'failed', error: 'RESEND_API_KEY/MAIL_FROM ausentes' } })
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    })
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}`)
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date() } })
  } catch (e) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'failed', error: e instanceof Error ? e.message : 'erro' } })
  }
}

export function appUrl(): string {
  return (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
}
