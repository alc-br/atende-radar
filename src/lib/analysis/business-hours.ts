// P2 · Horário comercial da empresa (aba "Horários" das Configurações) aplicado aos cálculos de tempo do motor.
// Regra: o cliente só "espera" enquanto a empresa deveria estar atendendo. Fora do expediente, fim de semana e feriado
// não contam (quando a regra escolhida é "ignora" ou "alerta"). Tudo em funções puras, testadas em tests/unit.

export interface DayWindow {
  open: string // 'HH:MM'
  close: string // 'HH:MM'
  enabled: boolean
}

export interface Schedule {
  timezone: string
  days: Record<string, DayWindow> // '0' = domingo … '6' = sábado (mesma ordem da tela)
  holidays: Set<string> // 'YYYY-MM-DD'
  toleranceBefore: number // minutos antes de abrir em que já se espera resposta
  toleranceAfter: number // minutos depois de fechar em que ainda se espera resposta
}

/** Como o tempo fora do expediente entra nos cálculos (campo "Regra para fora do expediente"). */
export type OutsideRule = 'ignora' | 'atraso' | 'alerta'

export interface HoursSettings {
  businessHours?: Record<string, Partial<DayWindow>>
  holidays?: string
  toleranceBefore?: string | number
  toleranceAfter?: string | number
  outsideRule?: string
}

/** Padrão exibido na tela antes de a empresa salvar qualquer coisa: seg–sex 08:00–18:00. O motor usa o MESMO padrão. */
export const DEFAULT_BUSINESS_HOURS: Record<string, DayWindow> = {
  '0': { open: '', close: '', enabled: false },
  '1': { open: '08:00', close: '18:00', enabled: true },
  '2': { open: '08:00', close: '18:00', enabled: true },
  '3': { open: '08:00', close: '18:00', enabled: true },
  '4': { open: '08:00', close: '18:00', enabled: true },
  '5': { open: '08:00', close: '18:00', enabled: true },
  '6': { open: '', close: '', enabled: false },
}
export const DEFAULT_TOLERANCE_BEFORE = 10
export const DEFAULT_TOLERANCE_AFTER = 30
export const DEFAULT_OUTSIDE_RULE: OutsideRule = 'ignora'

const num = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Linhas "DD/MM/AAAA - Descrição" (a descrição é opcional; linhas inválidas são ignoradas). */
export function parseHolidays(text: string | undefined | null): Set<string> {
  const out = new Set<string>()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (!m) continue
    const [, dd, mm, yyyy] = m
    const d = Number(dd), mo = Number(mm)
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue
    out.add(`${yyyy}-${mm}-${dd}`)
  }
  return out
}

export function outsideRuleFrom(settings: HoursSettings | null | undefined): OutsideRule {
  const r = settings?.outsideRule
  return r === 'atraso' || r === 'alerta' || r === 'ignora' ? r : DEFAULT_OUTSIDE_RULE
}

/** Monta a agenda a partir do que a tela de Configurações grava em `settings` (raiz do settingsJson). */
export function scheduleFrom(settings: HoursSettings | null | undefined, timezone: string | null | undefined): Schedule {
  const days: Record<string, DayWindow> = {}
  for (const k of ['0', '1', '2', '3', '4', '5', '6']) {
    const saved = settings?.businessHours?.[k]
    const base = DEFAULT_BUSINESS_HOURS[k]
    days[k] = {
      open: typeof saved?.open === 'string' ? saved.open : base.open,
      close: typeof saved?.close === 'string' ? saved.close : base.close,
      enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : base.enabled,
    }
  }
  return {
    timezone: timezone || 'America/Sao_Paulo',
    days,
    holidays: parseHolidays(settings?.holidays),
    toleranceBefore: num(settings?.toleranceBefore, DEFAULT_TOLERANCE_BEFORE),
    toleranceAfter: num(settings?.toleranceAfter, DEFAULT_TOLERANCE_AFTER),
  }
}

const hm = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '')
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

interface LocalParts {
  date: string // YYYY-MM-DD
  weekday: number // 0 = domingo
  minutes: number // minutos desde a meia-noite local
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
const fmt = (tz: string) => {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    fmtCache.set(tz, f)
  }
  return f
}
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function localParts(d: Date, tz: string): LocalParts {
  const p: Record<string, string> = {}
  for (const part of fmt(tz).formatToParts(d)) p[part.type] = part.value
  const hour = Number(p.hour) % 24 // alguns motores devolvem "24" à meia-noite
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: WD[p.weekday] ?? 0, minutes: hour * 60 + Number(p.minute) }
}

/** Janela efetiva do dia (em minutos locais, já com tolerâncias) ou null se a empresa não atende nesse dia. */
function windowFor(parts: LocalParts, s: Schedule): [number, number] | null {
  if (s.holidays.has(parts.date)) return null
  const day = s.days[String(parts.weekday)]
  if (!day?.enabled) return null
  const open = hm(day.open), close = hm(day.close)
  if (open == null || close == null || close <= open) return null
  return [Math.max(0, open - s.toleranceBefore), Math.min(1440, close + s.toleranceAfter)]
}

export function isOpenAt(d: Date, s: Schedule): boolean {
  const parts = localParts(d, s.timezone)
  const w = windowFor(parts, s)
  return !!w && parts.minutes >= w[0] && parts.minutes < w[1]
}

const MINUTE = 60000
const MAX_DAYS = 400

/** Minutos de expediente entre dois instantes (0 se `to` ≤ `from`). Percorre dia a dia no fuso da empresa. */
export function businessMinutesBetween(from: Date, to: Date, s: Schedule): number {
  if (!(to > from)) return 0
  let total = 0
  let cursor = from
  for (let i = 0; i < MAX_DAYS && cursor < to; i++) {
    const parts = localParts(cursor, s.timezone)
    // fim do dia local ≈ cursor + (1440 − minutos já passados); a fração de minuto do cursor fica no segmento
    const dayEnd = new Date(cursor.getTime() + (1440 - parts.minutes) * MINUTE - (cursor.getTime() % MINUTE))
    const segEnd = to < dayEnd ? to : dayEnd
    const w = windowFor(parts, s)
    if (w) {
      const segStart = parts.minutes + (cursor.getTime() % MINUTE) / MINUTE
      const segStop = segStart + (segEnd.getTime() - cursor.getTime()) / MINUTE
      const overlap = Math.min(segStop, w[1]) - Math.max(segStart, w[0])
      if (overlap > 0) total += overlap
    }
    cursor = segEnd
  }
  return Math.round(total * 100) / 100
}
