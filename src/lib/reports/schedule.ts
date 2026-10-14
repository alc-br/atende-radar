import { db } from '../db'
import { appUrl, sendMail } from '../mailer'
import { buildReport, REPORT_TITLES, REPORT_TYPES, type ReportType } from './build'

// Relatórios agendados: no horário configurado (fuso da empresa, dias da semana escolhidos) o relatório é gerado com os
// dados reais e cada destinatário recebe UM e-mail com o resumo de todos os relatórios daquele horário.
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

function parseList<T>(json: string, fallback: T[]): T[] {
  try {
    const v = JSON.parse(json)
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
  let tz = def.timezone || 'America/Sao_Paulo'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    tz = 'America/Sao_Paulo'
  }
  const today = local(now, tz)
  const days = parseList<number>(def.daysOfWeek, [])
  if (days.length && !days.includes(today.weekday)) return false
  if (today.time < def.schedule) return false
  if (!def.lastRunAt) return true
  const last = local(def.lastRunAt, tz)
  return `${last.day} ${last.time}` < `${today.day} ${def.schedule}`
}

const hasData = (c: { sections: { rows: unknown[] }[] }) => c.sections.some((s) => s.rows.length > 0)

export interface ScheduledSummary {
  generated: number
  emails: number
}

export async function runScheduledReports(now = new Date(), orgId?: string): Promise<ScheduledSummary> {
  const demoOrg = process.env.DEMO_ORG_ID || 'org_seed_1' // dados fictícios: nunca envia e-mail a ninguém
  if (orgId === demoOrg) return { generated: 0, emails: 0 }
  const defs = await db.reportDefinition.findMany({
    where: { schedule: { not: null }, organization: { status: 'active', deletionRequestedAt: null, id: orgId ?? { not: demoOrg } } },
    include: { organization: { select: { name: true } } },
  })

  // destinatário → linhas do e-mail, por empresa
  const outbox = new Map<string, { orgName: string; to: string; blocks: string[] }>()
  let generated = 0

  for (const def of defs) {
    if (!(REPORT_TYPES as readonly string[]).includes(def.reportType) || !isDue(def, now)) continue
    // marca antes de gerar: se dois processos rodarem juntos, só um gera (o outro vê a linha já atualizada)
    const claimed = await db.reportDefinition.updateMany({ where: { id: def.id, lastRunAt: def.lastRunAt }, data: { lastRunAt: now } })
    if (claimed.count === 0) continue

    const type = def.reportType as ReportType
    const end = now
    const start = new Date(now.getTime() - (type === 'daily' ? 1 : 7) * 24 * 3600_000)
    const recipients = parseList<string>(def.recipients, []).filter((r) => typeof r === 'string' && isValidRecipient(r))
    const content = await buildReport(def.organizationId, type, start, end)
    await db.reportRun.create({
      data: {
        organizationId: def.organizationId,
        reportType: type,
        status: 'completed',
        periodStart: start,
        periodEnd: end,
        recipientEmails: JSON.stringify(recipients),
        contentJson: JSON.stringify(content),
      },
    })
    generated++
    if (!hasData(content) && !def.sendEmpty) continue

    const block = [REPORT_TITLES[type], ...content.summary.map((s) => `• ${s}`)].join('\n')
    for (const to of recipients) {
      const key = `${def.organizationId}|${to.toLowerCase()}`
      const entry = outbox.get(key) ?? { orgName: def.organization.name, to, blocks: [] }
      entry.blocks.push(block)
      outbox.set(key, entry)
    }
  }

  const link = `${appUrl()}/#reports`
  for (const { orgName, to, blocks } of outbox.values()) {
    await sendMail({
      to,
      subject: blocks.length === 1 ? `${blocks[0].split('\n')[0]} · ${orgName}` : `${blocks.length} relatórios do AtendeRadar · ${orgName}`,
      text: [
        `Relatórios agendados de ${orgName}:`,
        '',
        blocks.join('\n\n'),
        '',
        `Relatório completo (com as tabelas, para baixar em CSV ou PDF): ${link}`,
        '',
        'Você recebe este e-mail porque está na lista de destinatários destes relatórios. Para sair, peça ao administrador da empresa no AtendeRadar (Relatórios › Configurar).',
      ].join('\n'),
    })
  }
  return { generated, emails: outbox.size }
}
