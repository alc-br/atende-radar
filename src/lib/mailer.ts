import { db } from './db'
import { isSimulationEmail } from './sandbox'
import { queueRecipientSync } from './mautic'

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
  /** Cabeçalhos extras (ex.: List-Unsubscribe). Ficam guardados para as novas tentativas. */
  headers?: Record<string, string>
  /** Tipo do e-mail (alert | alert_digest); null nos demais. */
  kind?: string
  /** Empresa dona do e-mail (alertas): recebe o aviso se o envio falhar de vez. */
  organizationId?: string
}

export type MailStatus = 'queued' | 'sent' | 'failed'

// Novas tentativas: o 1º envio + até 3 novas tentativas (5 min, 30 min e 2 h depois de cada falha).
// Só e-mails SEM anexo (o conteúdo do anexo não fica guardado; relatório tem o "Tentar novamente" do histórico).
export const MAIL_MAX_ATTEMPTS = 4
const MAIL_BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 3600_000]

const nextAttempt = (attempts: number, retryable: boolean, now = Date.now()) =>
  retryable && attempts < MAIL_MAX_ATTEMPTS ? new Date(now + MAIL_BACKOFF_MS[Math.min(attempts, MAIL_BACKOFF_MS.length) - 1]) : null

const parseHeaders = (json: string | null | undefined): Record<string, string> | undefined => {
  try {
    const v = JSON.parse(json || 'null') as unknown
    return v && typeof v === 'object' ? (v as Record<string, string>) : undefined
  } catch {
    return undefined
  }
}

const mailEnabled = () => process.env.MAIL_PROVIDER === 'brevo'

/** "Nome <email@x>" ou só "email@x" → remetente do Brevo. */
export function parseSender(from: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from)
  if (!m) return { email: from.trim() }
  const name = m[1].replace(/^"|"$/g, '').trim()
  return name ? { name, email: m[2].trim() } : { email: m[2].trim() }
}

/**
 * Uma chamada ao provedor (Brevo, API de e-mail transacional). Lança erro se não deu certo.
 * A conta do Brevo só aceita chamadas de IPs autorizados: em produção, o do servidor.
 */
async function deliver(mail: { to: string; subject: string; text: string; attachments?: MailAttachment[]; headers?: Record<string, string> }) {
  if (!mailEnabled()) throw new Error('Provedor de e-mail não configurado (MAIL_PROVIDER)')
  const key = process.env.BREVO_API_KEY
  const from = process.env.MAIL_FROM
  if (!key || !from) throw new Error('BREVO_API_KEY/MAIL_FROM ausentes')
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: parseSender(from),
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      ...(mail.headers && Object.keys(mail.headers).length ? { headers: mail.headers } : {}),
      ...(mail.attachments?.length
        ? { attachment: mail.attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString('base64') })) }
        : {}),
    }),
  })
  if (!res.ok) throw new Error(`Brevo HTTP ${res.status}`)
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'erro').slice(0, 300)

/**
 * Todo e-mail passa pelo EmailOutbox (registro auditável). Se houver provedor configurado
 * (MAIL_PROVIDER=brevo + BREVO_API_KEY + MAIL_FROM) ele é enviado; senão fica 'queued'.
 * O destinatário também vai para o Mautic (contatos ficam lá; e-mail de marketing sai pelo Mautic).
 * Devolve a situação final do registro (quem chama decide o que fazer com uma falha).
 * Falha de envio de e-mail sem anexo é tentada de novo sozinha (retryFailedEmails).
 */
export async function sendMail(mail: Mail): Promise<MailStatus> {
  return (await sendMailRow(mail)).status
}

/** Igual a sendMail, devolvendo também o id do registro no EmailOutbox. */
export async function sendMailRow(mail: Mail): Promise<{ id: string; status: MailStatus }> {
  // membros sintéticos das empresas simuladas (@sim.invalid): nada vai para a fila nem para o provedor
  if (isSimulationEmail(mail.to)) return { id: '', status: 'failed' }
  // todo destinatário é contato no Mautic (menos as caixas internas de vendas e suporte)
  if (![process.env.SALES_EMAIL, process.env.SUPPORT_EMAIL].some((x) => x?.trim().toLowerCase() === mail.to.trim().toLowerCase())) queueRecipientSync(mail.to)
  const attachments = mail.attachments?.length ? JSON.stringify(mail.attachments.map((a) => ({ filename: a.filename, size: a.content.byteLength }))) : null
  const row = await db.emailOutbox.create({
    data: {
      toEmail: mail.to, subject: mail.subject, body: mail.text, attachments,
      headers: mail.headers ? JSON.stringify(mail.headers) : null, kind: mail.kind ?? null, organizationId: mail.organizationId ?? null,
    },
  })

  if (!mailEnabled()) return { id: row.id, status: 'queued' }
  try {
    await deliver(mail)
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date(), attempts: 1 } })
    return { id: row.id, status: 'sent' }
  } catch (e) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'failed', error: errorText(e), attempts: 1, nextAttemptAt: nextAttempt(1, !attachments) } })
    return { id: row.id, status: 'failed' }
  }
}

/**
 * Novas tentativas dos e-mails que falharam (agendador a cada minuto e POST /api/gateway/tick). Cada linha é reservada
 * antes do envio (seguro com dois processos). Na última falha a linha fica 'failed' de vez (nextAttemptAt null) e, se for
 * alerta, a empresa recebe um aviso no sino.
 */
export async function retryFailedEmails(now = new Date(), opts: { organizationId?: string; limit?: number } = {}): Promise<{ retried: number; sent: number; gaveUp: number }> {
  const org = opts.organizationId ? { organizationId: opts.organizationId } : {}
  // reservada há mais de 10 min sem terminar (servidor reiniciou no meio): volta para a fila
  await db.emailOutbox.updateMany({ where: { ...org, status: 'sending', nextAttemptAt: { lt: now } }, data: { status: 'failed' } })
  const due = await db.emailOutbox.findMany({
    where: { ...org, status: 'failed', nextAttemptAt: { lte: now }, attempts: { lt: MAIL_MAX_ATTEMPTS }, attachments: null },
    orderBy: { nextAttemptAt: 'asc' },
    take: opts.limit ?? 50,
  })
  let sent = 0
  let gaveUp = 0
  for (const row of due) {
    const claimed = await db.emailOutbox.updateMany({
      where: { id: row.id, status: 'failed', attempts: row.attempts },
      data: { status: 'sending', nextAttemptAt: new Date(now.getTime() + 10 * 60_000) },
    })
    if (!claimed.count) continue
    const attempts = row.attempts + 1
    try {
      await deliver({ to: row.toEmail, subject: row.subject, text: row.body, headers: parseHeaders(row.headers) })
      await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date(), attempts, nextAttemptAt: null, error: null } })
      sent++
    } catch (e) {
      const next = nextAttempt(attempts, true, now.getTime())
      await db.emailOutbox.update({
        where: { id: row.id },
        data: { status: 'failed', attempts, nextAttemptAt: next, error: next ? errorText(e) : `${errorText(e)} · desistiu após ${attempts} tentativas` },
      })
      if (!next) {
        gaveUp++
        if (row.organizationId && row.kind?.startsWith('alert')) {
          await db.notification
            .create({
              data: {
                organizationId: row.organizationId, type: 'email_failed', title: 'Alerta por e-mail não foi entregue',
                message: `O e-mail "${row.subject}" para ${row.toEmail} falhou ${attempts} vezes e não será tentado de novo. O alerta continua na tela Alertas.`,
                data: JSON.stringify({ emailId: row.id }),
              },
            })
            .catch(() => {})
        }
      }
    }
  }
  return { retried: due.length, sent, gaveUp }
}

export function appUrl(): string {
  return (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
}
