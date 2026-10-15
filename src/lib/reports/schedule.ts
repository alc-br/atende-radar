import { db } from '../db'
import { appUrl, sendMail, type MailAttachment, type MailStatus } from '../mailer'
import { buildReport, REPORT_TITLES, REPORT_TYPES, type ReportContent, type ReportType } from './build'
import { toPdf } from './pdf'
import { reportFileName } from './render'
import { safeTimeZone } from './types'
import { REAL_ORGS, isIsolatedOrg } from '../sandbox'
import { reportUnsubscribe } from '../report-unsubscribe'

// Relatórios agendados: no horário configurado (fuso da empresa, dias da semana escolhidos) o relatório é gerado com os
// dados reais e cada destinatário recebe UM e-mail com o resumo de todos os relatórios daquele horário e o PDF
// executivo de cada um em anexo. Falha na geração ou no envio vira execução "falhou" no histórico + notificação.
// O agendador interno chama runScheduledReports a cada minuto; os testes chamam POST /api/gateway/tick com reportsAt.

export const SCHEDULE_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isValidRecipient = (e: string) => EMAIL_RE.test(e) && e.length <= 254

/** Data/hora local no fuso informado: { day: 'AAAA-MM-DD', time: 'HH:MM', weekday: 0 (dom) a 6 (sáb) } */
function local(d: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday }
}

export function parseList<T>(json: string | null | undefined, fallback: T[]): T[] {
  try {
    const v = JSON.parse(json ?? '')
    return Array.isArray(v) ? v : fallback
  } catch {
    return fallback
  }
}

interface DueDefinition {
  schedule: string | null
  timezone: string
  daysOfWeek: string
  lastRunAt: Date | null
}

/** O horário de hoje já chegou e ainda não houve geração depois dele. Dias sem envio e horários perdidos não acumulam. */
export function isDue(def: DueDefinition, now: Date): boolean {
  if (!def.schedule || !SCHEDULE_RE.test(def.schedule)) return false
  const tz = safeTimeZone(def.timezone)
  const today = local(now, tz)
  const days = parseList<number>(def.daysOfWeek, [])
  if (days.length && !days.includes(today.weekday)) return false
  if (today.time < def.schedule) return false
  if (!def.lastRunAt) return true
  const last = local(def.lastRunAt, tz)
  return `${last.day} ${last.time}` < `${today.day} ${def.schedule}`
}

const hasData = (c: { sections: { rows: unknown[] }[] }) => c.sections.some((s) => s.rows.length > 0)

/** Situação de entrega de uma execução a partir dos e-mails enviados: qualquer falha = falhou. */
function combine(statuses: MailStatus[]): MailStatus {
  if (statuses.includes('failed')) return 'failed'
  return statuses.includes('sent') ? 'sent' : 'queued'
}

export async function notifyReportFailure(orgId: string, title: string, message: string, runId?: string) {
  await db.notification.create({ data: { organizationId: orgId, type: 'report_failed', title, message, data: JSON.stringify(runId ? { runId } : {}) } })
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)

async function pdfAttachment(content: ReportContent, createdAt: Date): Promise<MailAttachment | null> {
  try {
    return { filename: `${reportFileName(content.type, createdAt)}.pdf`, content: await toPdf(content) }
  } catch (e) {
    console.error('Report PDF error:', e)
    return null // sem anexo o e-mail ainda leva o resumo e o link
  }
}

function mailText(orgName: string, blocks: string[], hasAttachment: boolean, unsubscribeUrl?: string): string {
  return [
    `Relatórios de ${orgName}:`,
    '',
    blocks.join('\n\n'),
    '',
    ...(hasAttachment ? ['O PDF executivo de cada relatório está em anexo.', ''] : []),
    `Relatório completo (com as tabelas, para baixar em PDF, XLSX, CSV ou JSON): ${appUrl()}/#reports`,
    '',
    'Você recebe este e-mail porque está na lista de destinatários dos relatórios desta empresa no AtendeRadar.',
    unsubscribeUrl ? `Não quer mais receber estes relatórios? ${unsubscribeUrl}` : 'Para sair, peça ao administrador da empresa (Relatórios › Configurar).',
  ].join('\n')
}

/** E-mail de relatório para UM destinatário, com o link e os cabeçalhos de descadastro (clique único) dele. */
function reportMail(orgId: string, to: string, subject: string, orgName: string, blocks: string[], attachments: MailAttachment[]) {
  const unsub = reportUnsubscribe(orgId, to)
  return {
    to,
    subject,
    text: mailText(orgName, blocks, attachments.length > 0, unsub?.url),
    attachments: attachments.length ? attachments : undefined,
    headers: unsub?.headers,
  }
}

const blockOf = (content: ReportContent) => [content.title || REPORT_TITLES[content.type], ...content.summary.map((s) => `• ${s}`)].join('\n')

/**
 * Envia (ou reenvia) UMA execução concluída aos destinatários, com o PDF em anexo. Atualiza a situação de entrega
 * da execução e cria notificação se algum envio falhar.
 */
export async function sendReportRun(runId: string, recipients: string[]): Promise<{ emails: number; emailStatus: MailStatus }> {
  const run = await db.reportRun.findUniqueOrThrow({ where: { id: runId }, include: { organization: { select: { name: true } } } })
  const content = JSON.parse(run.contentJson ?? 'null') as ReportContent | null
  if (!content) throw new Error('Execução sem conteúdo')
  const attachment = await pdfAttachment(content, run.createdAt)
  const statuses: MailStatus[] = []
  for (const to of recipients) {
    statuses.push(
      await sendMail(
        reportMail(run.organizationId, to, `${content.title || REPORT_TITLES[content.type]} · ${run.organization.name}`, run.organization.name, [blockOf(content)], attachment ? [attachment] : []),
      ),
    )
  }
  const emailStatus = combine(statuses)
  const failed = statuses.filter((s) => s === 'failed').length
  await db.reportRun.update({
    where: { id: runId },
    data: { emailStatus, emailedAt: new Date(), recipientEmails: JSON.stringify(recipients), error: failed ? `Falha no envio para ${failed} de ${recipients.length} destinatário(s)` : null },
  })
  if (failed) {
    await notifyReportFailure(run.organizationId, `Falha ao enviar o ${content.title || 'relatório'} por e-mail`, `${failed} de ${recipients.length} destinatário(s) não receberam. Use "Tentar novamente" no histórico de relatórios.`, runId)
  }
  return { emails: recipients.length, emailStatus }
}

/**
 * Gera de novo uma execução que falhou (mesmo tipo e período) e, se ela era agendada ou o envio tinha falhado,
 * envia o e-mail de novo. Usado pelo botão "Tentar novamente".
 */
export async function retryReportRun(runId: string): Promise<{ status: string; emailStatus: MailStatus | null }> {
  const run = await db.reportRun.findUniqueOrThrow({ where: { id: runId } })
  if (!(REPORT_TYPES as readonly string[]).includes(run.reportType)) throw new Error('Tipo de relatório inválido')
  let contentJson = run.contentJson
  if (run.status !== 'completed' || !contentJson) {
    const end = run.periodEnd ?? new Date()
    const start = run.periodStart ?? new Date(end.getTime() - (run.reportType === 'daily' ? 1 : 7) * 86400_000)
    try {
      contentJson = JSON.stringify(await buildReport(run.organizationId, run.reportType as ReportType, start, end))
    } catch (e) {
      await db.reportRun.update({ where: { id: runId }, data: { status: 'failed', error: `Falha na geração: ${errorText(e)}` } })
      await notifyReportFailure(run.organizationId, `Falha ao gerar o ${REPORT_TITLES[run.reportType as ReportType]}`, 'A nova tentativa também falhou. Tente mais tarde ou fale com o suporte.', runId)
      return { status: 'failed', emailStatus: null }
    }
    await db.reportRun.update({ where: { id: runId }, data: { status: 'completed', contentJson, error: null } })
  }
  const recipients = parseList<string>(run.recipientEmails, []).filter((r) => typeof r === 'string' && isValidRecipient(r))
  if (recipients.length && (run.source === 'schedule' || run.emailStatus === 'failed')) {
    const { emailStatus } = await sendReportRun(runId, recipients)
    return { status: 'completed', emailStatus }
  }
  return { status: 'completed', emailStatus: null }
}

export interface ScheduledSummary {
  generated: number
  emails: number
  failed: number
}

export async function runScheduledReports(now = new Date(), orgId?: string): Promise<ScheduledSummary> {
  // demonstração e simulação (dados fictícios): nunca enviam e-mail a ninguém
  if (orgId && (await isIsolatedOrg(orgId))) return { generated: 0, emails: 0, failed: 0 }
  const defs = await db.reportDefinition.findMany({
    where: { schedule: { not: null }, organization: { status: 'active', deletionRequestedAt: null, ...REAL_ORGS(), ...(orgId ? { id: orgId } : {}) } },
    include: { organization: { select: { name: true, timezone: true } } },
  })

  // destinatário → e-mail único por empresa, com um bloco e um PDF por relatório
  const outbox = new Map<string, { orgId: string; orgName: string; to: string; blocks: string[]; attachments: MailAttachment[]; runIds: string[] }>()
  let generated = 0
  let failed = 0

  for (const def of defs) {
    // o horário vale no fuso da empresa (Configurações); o fuso da definição só se a empresa não tiver um
    if (!(REPORT_TYPES as readonly string[]).includes(def.reportType) || !isDue({ ...def, timezone: def.organization.timezone || def.timezone }, now)) continue
    // marca antes de gerar: se dois processos rodarem juntos, só um gera (o outro vê a linha já atualizada)
    const claimed = await db.reportDefinition.updateMany({ where: { id: def.id, lastRunAt: def.lastRunAt }, data: { lastRunAt: now } })
    if (claimed.count === 0) continue

    const type = def.reportType as ReportType
    const end = now
    const start = new Date(now.getTime() - (type === 'daily' ? 1 : 7) * 24 * 3600_000)
    const recipients = parseList<string>(def.recipients, []).filter((r) => typeof r === 'string' && isValidRecipient(r))
    const base = { organizationId: def.organizationId, reportType: type, source: 'schedule', periodStart: start, periodEnd: end, recipientEmails: JSON.stringify(recipients) }

    let content: ReportContent
    try {
      content = await buildReport(def.organizationId, type, start, end)
    } catch (e) {
      console.error('Scheduled report error:', e)
      const run = await db.reportRun.create({ data: { ...base, status: 'failed', error: `Falha na geração: ${errorText(e)}` } })
      await notifyReportFailure(def.organizationId, `Falha ao gerar o ${REPORT_TITLES[type]} agendado`, 'O relatório não foi gerado nem enviado. Use "Tentar novamente" no histórico de relatórios.', run.id)
      failed++
      continue
    }
    const run = await db.reportRun.create({ data: { ...base, status: 'completed', contentJson: JSON.stringify(content) } })
    generated++
    if ((!hasData(content) && !def.sendEmpty) || recipients.length === 0) continue

    const attachment = await pdfAttachment(content, run.createdAt)
    for (const to of recipients) {
      const key = `${def.organizationId}|${to.toLowerCase()}`
      const entry = outbox.get(key) ?? { orgId: def.organizationId, orgName: def.organization.name, to, blocks: [], attachments: [], runIds: [] }
      entry.blocks.push(blockOf(content))
      if (attachment) entry.attachments.push(attachment)
      entry.runIds.push(run.id)
      outbox.set(key, entry)
    }
  }

  // situação de entrega por execução (um e-mail pode levar várias execuções)
  const delivery = new Map<string, { orgId: string; statuses: MailStatus[] }>()
  for (const { orgId: oid, orgName, to, blocks, attachments, runIds } of outbox.values()) {
    const subject = blocks.length === 1 ? `${blocks[0].split('\n')[0]} · ${orgName}` : `${blocks.length} relatórios do AtendeRadar · ${orgName}`
    const status = await sendMail(reportMail(oid, to, subject, orgName, blocks, attachments))
    for (const id of runIds) {
      const d = delivery.get(id) ?? { orgId: oid, statuses: [] }
      d.statuses.push(status)
      delivery.set(id, d)
    }
  }
  for (const [id, { orgId: oid, statuses }] of delivery) {
    const emailStatus = combine(statuses)
    const bad = statuses.filter((s) => s === 'failed').length
    await db.reportRun.update({ where: { id }, data: { emailStatus, emailedAt: now, error: bad ? `Falha no envio para ${bad} de ${statuses.length} destinatário(s)` : null } })
    if (bad) {
      failed++
      await notifyReportFailure(oid, 'Falha ao enviar relatório agendado por e-mail', `${bad} de ${statuses.length} destinatário(s) não receberam. Use "Tentar novamente" no histórico de relatórios.`, id)
    }
  }
  return { generated, emails: outbox.size, failed }
}
