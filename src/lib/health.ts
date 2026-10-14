import { db } from './db'

// Verificação de saúde para a página pública /status. Só diz SE está tudo bem, nunca o PORQUÊ técnico:
// nada de mensagem de erro, versão, horários exatos ou nomes de componentes internos.

/** Ciclo do motor de análise mais antigo que isto = análise atrasada (o agendador roda a cada 60 s). */
export const SCHEDULER_STALE_MS = 5 * 60_000

export type ComponentState = 'ok' | 'degraded' | 'down'

export interface HealthReport {
  status: ComponentState
  components: { painel: ComponentState; analise: ComponentState }
  checkedAt: string
}

// Marcas gravadas por src/lib/background.ts (mesmo processo do servidor). Lidas pelo globalThis para não importar o
// agendador (e o motor de análise inteiro) só para consultar dois horários.
const g = globalThis as { __arStartedAt?: number; __arLastCycleAt?: number }

export async function checkDatabase(timeoutMs = 3000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
    })
    await Promise.race([db.$queryRawUnsafe('SELECT 1'), timeout])
    return true
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Idade do último ciclo do agendador. Desligado (ANALYSIS_SCHEDULER=off, testes) ou recém-ligado (ainda sem ciclo,
 * dentro da tolerância) conta como ok: o que se mede é análise PARADA, não análise que ainda não teve tempo de rodar.
 */
export function schedulerHealth(now = Date.now(), state: { enabled?: boolean; startedAt?: number | null; lastCycleAt?: number | null } = {}): ComponentState {
  const enabled = state.enabled ?? process.env.ANALYSIS_SCHEDULER !== 'off'
  if (!enabled) return 'ok'
  const startedAt = state.startedAt !== undefined ? state.startedAt : (g.__arStartedAt ?? null)
  const lastCycleAt = state.lastCycleAt !== undefined ? state.lastCycleAt : (g.__arLastCycleAt ?? null)
  if (!startedAt) return 'ok' // agendador ainda não ligou neste processo (instante da partida)
  const reference = lastCycleAt ?? startedAt
  return now - reference > SCHEDULER_STALE_MS ? 'degraded' : 'ok'
}

export async function healthReport(now = new Date()): Promise<HealthReport> {
  const dbOk = await checkDatabase()
  const painel: ComponentState = dbOk ? 'ok' : 'down'
  // sem banco a análise também não anda
  const analise: ComponentState = dbOk ? schedulerHealth(now.getTime()) : 'down'
  const status: ComponentState = painel === 'down' ? 'down' : analise !== 'ok' ? 'degraded' : 'ok'
  return { status, components: { painel, analise }, checkedAt: now.toISOString() }
}
