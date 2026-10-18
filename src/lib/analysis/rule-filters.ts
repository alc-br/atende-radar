import { localParts } from './business-hours'

// Filtros por regra de alerta (Alertas › Regras › Nova regra › "Mais opções"). Todos são opcionais: vazio = vale sempre.
//  · Equipes (scopeTeams): só conversas da equipe. A equipe da conversa é a do atendente confirmado; sem atendente, a(s)
//    equipe(s) dona(s) do número (Equipes › números da equipe).
//  · Dias e horários (daysAndHours): a regra só ABRE alerta dentro da janela (fuso da empresa). Alerta já aberto continua
//    sendo acompanhado fora dela (fecha sozinho quando o problema acaba).
//  · Exceções (exceptions): etiquetas da conversa. Conversa com uma delas fica fora da regra (e o alerta aberto fecha).
//  · Encerrar sozinho (autoCloseMinutes): o alerta aberto fecha depois de N minutos mesmo com o problema de pé, e não
//    volta enquanto o MESMO problema continuar; se o problema acabar e voltar, o alerta reabre com o contador +1.

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

export interface RuleWindow {
  /** 0 = domingo … 6 = sábado (dia em que a janela COMEÇA) */
  days: number[]
  start: string
  end: string
}

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/
const hm = (s: string) => {
  const m = HM.exec(s)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Valida o "dias e horários" vindo da tela/API. {} = sempre. Devolve a mensagem de erro ou null. */
export function ruleWindowError(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || Array.isArray(v)) return 'Dias e horários inválidos.'
  const o = v as Record<string, unknown>
  if (Object.keys(o).length === 0) return null
  const { days, start, end } = o
  if (!Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) || new Set(days).size !== days.length) {
    return 'Escolha pelo menos um dia da semana.'
  }
  if (typeof start !== 'string' || typeof end !== 'string' || hm(start) == null || hm(end) == null) return 'Use horários no formato HH:MM (ex.: 08:00).'
  if (start === end) return 'O horário de início e o de fim não podem ser iguais.'
  return null
}

/** Janela gravada na regra; null = sem janela (vale sempre, inclusive com JSON antigo/inválido). */
export function parseRuleWindow(json: string | null | undefined): RuleWindow | null {
  let v: unknown
  try {
    v = json ? JSON.parse(json) : null
  } catch {
    return null
  }
  if (!v || typeof v !== 'object' || Object.keys(v).length === 0 || ruleWindowError(v)) return null
  const o = v as RuleWindow
  return { days: o.days, start: o.start, end: o.end }
}

/**
 * O instante está dentro da janela? Janela que passa da meia-noite (ex.: 22:00–06:00) pertence ao dia em que começa:
 * "sexta 22:00–06:00" vale de sexta 22:00 até sábado 06:00.
 */
export function inRuleWindow(w: RuleWindow | null, at: Date, timezone: string): boolean {
  if (!w) return true
  const { weekday, minutes } = localParts(at, timezone)
  const s = hm(w.start)!, e = hm(w.end)!
  if (s < e) return w.days.includes(weekday) && minutes >= s && minutes < e
  const yesterday = (weekday + 6) % 7
  return (w.days.includes(weekday) && minutes >= s) || (w.days.includes(yesterday) && minutes < e)
}

const normTag = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Conversa com alguma etiqueta listada nas exceções da regra (sem diferença de maiúsculas e acentos). */
export function exemptByTags(conversationTags: string[], exceptions: string[]): boolean {
  if (!exceptions.length || !conversationTags.length) return false
  const tags = new Set(conversationTags.map(normTag))
  return exceptions.some((x) => tags.has(normTag(x)))
}

export interface TeamLite {
  id: string
  name: string
  connectionIds: string[]
}

/**
 * Equipes da conversa: a do atendente confirmado (pelo nome gravado no atendente, Atendentes › equipe); sem atendente
 * com equipe, as equipes que têm o número da conversa.
 */
export function conversationTeamIds(agentTeam: string | null | undefined, connectionId: string | null | undefined, teams: TeamLite[]): string[] {
  const name = agentTeam?.trim() ? normTag(agentTeam) : null
  if (name) {
    const byName = teams.filter((t) => normTag(t.name) === name).map((t) => t.id)
    if (byName.length) return byName
  }
  return connectionId ? teams.filter((t) => t.connectionIds.includes(connectionId)).map((t) => t.id) : []
}

/** A regra vale para a conversa pelas equipes escolhidas? (aceita id ou nome da equipe na lista) */
export function inTeamScope(scopeTeams: string[], convTeamIds: string[], teams: TeamLite[]): boolean {
  if (!scopeTeams.length) return true
  const wanted = new Set(scopeTeams.flatMap((s) => {
    const t = teams.find((x) => x.id === s) ?? teams.find((x) => normTag(x.name) === normTag(s))
    return t ? [t.id] : []
  }))
  return convTeamIds.some((id) => wanted.has(id))
}

/**
 * Prazo para o alerta do grupo encerrar sozinho: só quando TODAS as regras que valem para ele pedem isso (uma regra
 * sem "encerrar sozinho" mantém o alerta aberto); vale o maior prazo. null = não encerra sozinho.
 */
export function groupAutoClose(rules: Array<{ autoCloseMinutes: number | null }>): number | null {
  if (!rules.length || rules.some((r) => !r.autoCloseMinutes || r.autoCloseMinutes <= 0)) return null
  return Math.max(...rules.map((r) => r.autoCloseMinutes!))
}
