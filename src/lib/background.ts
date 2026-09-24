import { analyzeAll, analyzeOrganization } from './analysis/engine'

// Tarefas em segundo plano dentro do próprio servidor: o motor de análise roda a cada minuto (alertas por TEMPO precisam
// disparar mesmo sem mensagem nova) e, com um pequeno atraso, logo depois que chegam mensagens de uma empresa.
// ANALYSIS_SCHEDULER=off desliga (usado nos testes, que chamam /api/gateway/tick quando querem).
const g = globalThis as { __arJobsStarted?: boolean; __arRunning?: boolean; __arTimers?: Map<string, ReturnType<typeof setTimeout>> }

const enabled = () => process.env.ANALYSIS_SCHEDULER !== 'off'

async function safely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    console.error(`[analysis] ${label} falhou:`, e instanceof Error ? e.message : e)
  }
}

export function startBackgroundJobs() {
  if (g.__arJobsStarted || !enabled()) return
  g.__arJobsStarted = true
  g.__arTimers = new Map()
  const timer = setInterval(async () => {
    if (g.__arRunning) return // não sobrepõe execuções
    g.__arRunning = true
    await safely('ciclo', () => analyzeAll())
    g.__arRunning = false
  }, 60_000)
  timer.unref?.()
  console.log('[analysis] agendador ligado (a cada 60 s)')
}

/** Pede uma análise da empresa em ~3 s (várias mensagens seguidas viram uma análise só). */
export function requestAnalysis(orgId: string) {
  if (!enabled() || !g.__arTimers || g.__arTimers.has(orgId)) return
  const t = setTimeout(async () => {
    g.__arTimers?.delete(orgId)
    await safely(`empresa ${orgId}`, () => analyzeOrganization(orgId))
  }, 3000)
  t.unref?.()
  g.__arTimers.set(orgId, t)
}
