// Agenda das tarefas (CRM-04): as janelas "Hoje" e "Próximos 7 dias". Sem import de servidor: serve à API e à tela.
//
// Fuso: a empresa tem fuso próprio (Organization.timezone, padrão America/Sao_Paulo, escolhido no cadastro e em
// Configurações). Por isso o dia é o da empresa, calculado no servidor (`due=today|next7`): o relógio e o fuso do
// navegador não mudam o que entra em "Hoje", e a mesma tarefa aparece igual para toda a equipe. O prazo segue gravado
// em UTC (um instante); a tela mostra e lê a data e a hora do prazo nesse mesmo fuso (zonedParts, isoFromZonedParts),
// para a tarefa listada em "Hoje" não aparecer com a data de outro dia.

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
export const DUE_WINDOWS = ['today', 'next7'] as const
export type DueWindow = (typeof DUE_WINDOWS)[number]

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    formatters.set(tz, f)
  }
  return f
}

/** Fuso válido para o Intl; texto inválido gravado na empresa cai no padrão (nunca derruba a lista). */
export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE
  try {
    formatter(tz)
    return tz
  } catch {
    return DEFAULT_TIMEZONE
  }
}

function wallClock(t: number, tz: string) {
  const p: Record<string, number> = {}
  for (const part of formatter(tz).formatToParts(new Date(t))) if (part.type !== 'literal') p[part.type] = Number(part.value)
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** Diferença (ms) entre a hora de parede no fuso e o UTC, no instante `t` (-3 h em São Paulo). */
function offsetAt(t: number, tz: string): number {
  const w = wallClock(t, tz)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(t / 1000) * 1000
}

/** Instante da hora de parede (y, m, d, hh:mm) no fuso. Hora que não existe (início do horário de verão) vira a primeira que existe depois. */
export function zonedTime(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const o1 = offsetAt(guess, tz)
  let t = guess - o1
  const o2 = offsetAt(t, tz)
  if (o2 !== o1 && offsetAt(guess - o2, tz) === o2) t = guess - o2
  return new Date(t)
}

/** Primeiro instante do dia (y, m, d) no fuso. Num dia de horário de verão sem 00:00, é o primeiro horário que existe. */
export function startOfZonedDay(y: number, m: number, d: number, tz: string): Date {
  return zonedTime(y, m, d, 0, 0, tz)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Data (AAAA-MM-DD) e hora (HH:MM) do instante no fuso: o que os campos de data e hora mostram. */
export function zonedParts(at: Date, timezone: string | null | undefined): { date: string; time: string } {
  const w = wallClock(at.getTime(), safeTimezone(timezone))
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` }
}

/** Dia (AAAA-MM-DD) no fuso, `plus` dias depois de hoje. */
export function zonedDate(plus: number, timezone: string | null | undefined, now = new Date()): string {
  const w = wallClock(now.getTime(), safeTimezone(timezone))
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + plus))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Campos de data e hora (hora de parede no fuso) → ISO em UTC. Sem hora vale 09:00; data ou hora inválida = null. */
export function isoFromZonedParts(date: string, time: string, timezone: string | null | undefined): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})/.exec(time || '09:00')
  if (!dm || !tm) return null
  const [y, m, d, hh, mm] = [dm[1], dm[2], dm[3], tm[1], tm[2]].map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null
  const t = zonedTime(y, m, d, hh, mm, safeTimezone(timezone))
  return Number.isNaN(t.getTime()) ? null : t.toISOString()
}

const displays = new Map<string, Intl.DateTimeFormat>()

/** Prazo para a tela (dd/mm/aaaa hh:mm) no fuso. */
export function formatZoned(at: Date, timezone: string | null | undefined): string {
  const tz = safeTimezone(timezone)
  let f = displays.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz })
    displays.set(tz, f)
  }
  return f.format(at)
}

/** Limites [gte, lt) da janela no fuso: "Hoje" é o dia de hoje; "Próximos 7 dias" vai de hoje até o fim do 7º dia. */
export function dueWindow(kind: DueWindow, timezone: string | null | undefined, now = new Date()): { gte: Date; lt: Date } {
  const tz = safeTimezone(timezone)
  const today = wallClock(now.getTime(), tz)
  const day = (offset: number) => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset))
    return startOfZonedDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), tz)
  }
  return { gte: day(0), lt: day(kind === 'today' ? 1 : 8) }
}

/** Nome do fuso para a tela, como em Relatórios. */
export function timezoneLabel(tz: string): string {
  return tz === DEFAULT_TIMEZONE ? 'horário de Brasília' : `fuso de ${tz.split('/').pop()?.replace(/_/g, ' ') ?? tz}`
}

/** Fuso do navegador (vazio se o Intl não disser). */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

/** O relógio do navegador marca agora outra hora que o da empresa? (aí a tela diz em que fuso estão os prazos) */
export function browserZoneDiffers(timezone: string | null | undefined, now = Date.now()): boolean {
  const b = browserTimezone()
  if (!b) return false
  try {
    return offsetAt(now, b) !== offsetAt(now, safeTimezone(timezone))
  } catch {
    return false
  }
}
