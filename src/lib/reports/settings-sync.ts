import { db } from '../db'
import { SCHEDULE_RE } from './schedule'

// Preferências de relatório que chegam junto com as Configurações (o onboarding manda notifDaily*/notifWeekly*).
// Antes elas ficavam só no JSON e nada as lia; o envio de verdade é o do Relatório Diário/Semanal (ReportDefinition,
// tela Relatórios). Aqui elas viram o agendamento desses dois relatórios e saem do JSON, para não haver duas fontes.
//  · *Enabled false → sem envio automático (schedule vazio); true → horário informado, o que já existia ou o padrão.
//  · *Time sozinho só muda o horário de um relatório que já está ativo.
//  · notifDailyDays no formato antigo da tela ("2,3,4,5,6", 2 = segunda) → dias da semana (0 = domingo).

export const REPORT_PREF_KEYS = ['notifDailyEnabled', 'notifDailyTime', 'notifDailyDays', 'notifWeeklyEnabled', 'notifWeeklyTime'] as const

const DEFAULT_TIME = { daily: '18:00', weekly: '09:00' } as const

const validTime = (v: unknown) => (typeof v === 'string' && SCHEDULE_RE.test(v.trim()) ? v.trim() : null)

function legacyDays(v: unknown): number[] | null {
  if (typeof v !== 'string') return null
  const days = [...new Set(v.split(/[\s,;]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).map((n) => n - 1))].sort()
  return days.length ? days : null
}

/** Separa as preferências de relatório das demais configurações. */
export function splitReportPrefs(settings: Record<string, unknown>) {
  const rest: Record<string, unknown> = {}
  const prefs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settings)) {
    if ((REPORT_PREF_KEYS as readonly string[]).includes(k)) prefs[k] = v
    else rest[k] = v
  }
  return { rest, prefs }
}

/** Aplica as preferências ao Relatório Diário e ao Semanal da empresa. Devolve os tipos alterados. */
export async function applyReportPrefs(orgId: string, prefs: Record<string, unknown>): Promise<string[]> {
  const changed: string[] = []
  for (const type of ['daily', 'weekly'] as const) {
    const prefix = type === 'daily' ? 'notifDaily' : 'notifWeekly'
    const enabled = prefs[`${prefix}Enabled`]
    const time = validTime(prefs[`${prefix}Time`])
    const days = type === 'daily' ? legacyDays(prefs.notifDailyDays) : null
    if (enabled === undefined && !time && !days) continue

    const def = await db.reportDefinition.findFirst({ where: { organizationId: orgId, reportType: type } })
    if (!def) continue
    const data: { schedule?: string | null; daysOfWeek?: string } = {}
    if (enabled === false) data.schedule = null
    else if (enabled === true) data.schedule = time ?? def.schedule ?? DEFAULT_TIME[type]
    else if (time && def.schedule) data.schedule = time
    if (days) data.daysOfWeek = JSON.stringify(days)
    if (Object.keys(data).length === 0) continue
    await db.reportDefinition.update({ where: { id: def.id }, data })
    changed.push(type)
  }
  return changed
}
