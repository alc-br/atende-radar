import { analyzeAll, analyzeOrganization } from './analysis/engine'
import { startWhatsApp } from './whatsapp/manager'
import { billingSweep } from './billing/service'
import { disconnectLockedOrgs, pastDueNotices } from './billing/delinquency'
import { trialEndingNotices } from './billing/trial'
import { runScheduledReports } from './reports/schedule'
import { runWebhookOutbox } from './webhooks'
import { runConversionOutbox } from './conversions'
import { purgeDueDeletions } from './org-deletion'
import { db, optimizeDb } from './db'
import { purgeProductEvents } from './privacy'
import { flushAlertEmails } from './alert-email'
import { retryFailedEmails } from './mailer'
import { purgeExpiredSimulations } from './simulation/cleanup'
import { mauticEnabled, syncAllMembersToMautic } from './mautic'
import { processNfse } from './nfse/service'
import { clusterNovelSignals } from './analysis/novelty'
import { captureCrmChanges, reconcileDue } from './crm/capture'
import { purgeCrmOutbox, runCrmOutbox } from './crm/worker'
import { expireSuggestions } from './crm/suggestions'
import { errTag } from './crm/log'
import './crm/consumer' // registra o consumidor nativo da fila do CRM

// Tarefas em segundo plano dentro do próprio servidor: o motor de análise roda a cada minuto (alertas por TEMPO precisam
// disparar mesmo sem mensagem nova) e, com um pequeno atraso, logo depois que chegam mensagens de uma empresa.
// ANALYSIS_SCHEDULER=off desliga (usado nos testes, que chamam /api/gateway/tick quando querem).
const g = globalThis as {
  __arJobsStarted?: boolean
  __arRunning?: boolean
  __arTimers?: Map<string, ReturnType<typeof setTimeout>>
  /** Quando o agendador ligou e quando terminou o último ciclo do motor (lidos pela página /status). */
  __arStartedAt?: number
  __arLastCycleAt?: number
}

const enabled = () => process.env.ANALYSIS_SCHEDULER !== 'off'

async function safely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    console.error(`[analysis] ${label} falhou:`, e instanceof Error ? e.message : e)
  }
}

/** Rotinas do CRM: o log leva só o tipo do erro (a mensagem do Prisma pode trazer valores das colunas; T08.04). */
async function safelyCrm(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    console.error(`[crm] ${label} falhou:`, errTag(e))
  }
}

export function startBackgroundJobs() {
  startWhatsApp() // só liga com WHATSAPP_GATEWAY=on
  if (g.__arJobsStarted || !enabled()) return
  g.__arJobsStarted = true
  g.__arTimers = new Map()
  g.__arStartedAt = Date.now() // lidos por health.ts (/status): ciclo parado há 5 min = análise atrasada (R1)
  const timer = setInterval(async () => {
    if (g.__arRunning) return // não sobrepõe execuções
    g.__arRunning = true
    await safely('ciclo', () => analyzeAll())
    g.__arLastCycleAt = Date.now()
    g.__arRunning = false
  }, 60_000)
  timer.unref?.()
  // cobrança: renovações/recusas/cancelamentos lidos do Pagar.me a cada 15 min (cada assinatura no máx. 1x por hora)
  const billing = setInterval(() => safely('cobrança', () => billingSweep()), 15 * 60_000)
  billing.unref?.()
  // NFS-e: emite as notas das faturas pagas e cancela as das reembolsadas (novas tentativas com espera crescente)
  const nfse = setInterval(() => safely('notas fiscais', () => processNfse()), 60_000)
  nfse.unref?.()
  // relatórios agendados: confere a cada minuto quais chegaram no horário (fuso e dias de cada relatório)
  const reports = setInterval(() => safely('relatórios agendados', () => runScheduledReports()), 60_000)
  reports.unref?.()
  // webhooks dos clientes: novas tentativas das entregas que falharam (a 1ª vai logo após o alerta)
  const webhooks = setInterval(() => safely('webhooks', () => runWebhookOutbox()), 60_000)
  webhooks.unref?.()
  // conversões para o GA4/Meta (docs/operacao/medicao.md): novas tentativas das que falharam (a 1ª vai logo ao enfileirar)
  const conversions = setInterval(() => safely('conversões', () => runConversionOutbox()), 60_000)
  conversions.unref?.()
  // alertas por e-mail: envia os pendentes (intervalo/silêncio) e tenta de novo os e-mails que falharam; no mesmo passo,
  // os avisos de fim do teste grátis (3 dias, 1 dia, último aviso a 6 h e "terminou"; cada um uma vez)
  const emails = setInterval(async () => {
    await safely('avisos de fim do teste', () => trialEndingNotices())
    // inadimplência: lembretes (3º e 6º dia) e bloqueio no 7º; empresas bloqueadas há 2 dias têm os números desconectados
    await safely('avisos da inadimplência', () => pastDueNotices())
    await safely('desconexão das empresas bloqueadas', () => disconnectLockedOrgs())
    await safely('alertas por e-mail', () => flushAlertEmails())
    await safely('novas tentativas de e-mail', () => retryFailedEmails())
  }, 60_000)
  emails.unref?.()
  // encerramento de conta: apaga as empresas cujo prazo de desistência (7 dias) acabou
  // e, no mesmo passo, a retenção dos eventos analíticos (PRODUCT_EVENTS_RETENTION_DAYS)
  const deletions = setInterval(async () => {
    await safely('exclusão de empresas', () => purgeDueDeletions())
    await safely('retenção dos eventos de produto', () => purgeProductEvents())
    // simulação (S1): empresas simuladas mantidas somem depois de 24 h (só isSimulation)
    await safely('limpeza das simulações', () => purgeExpiredSimulations())
    // situações novas: agrupa as frases da semana (só com a IA ligada; analysis/novelty.ts)
    await safely('situações novas', () => clusterNovelSignals())
    // CRM: eventos processados saem depois de 30 dias e as chaves de idempotência depois de 24 h; sugestão vencida expira
    await safelyCrm('limpeza da fila do CRM', () => purgeCrmOutbox())
    await safelyCrm('sugestões vencidas do CRM', () => expireSuggestions(db))
    // reconciliação do CRM: a cada 6 h por empresa com o CRM ligado (relê 7 dias e repõe evento perdido)
    await safelyCrm('reconciliação do CRM', () => reconcileDue())
  }, 15 * 60_000)
  deletions.unref?.()
  // CRM comercial (docs/crm/05-sincronizacao.md): só as empresas com o CRM ligado; CRM_DISABLED=1 para tudo.
  // A captura lê o que mudou no AtendeRadar a cada 15 s e grava na fila; a fila roda logo depois (e a cada minuto,
  // para as novas tentativas). O CRM só sugere: nada aqui manda mensagem nem muda conversa.
  const crmCapture = setInterval(() => safelyCrm('captura do CRM', () => captureCrmChanges()), 15_000)
  crmCapture.unref?.()
  const crmOutbox = setInterval(() => safelyCrm('fila do CRM', () => runCrmOutbox()), 60_000)
  crmOutbox.unref?.()
  // estatísticas do banco para o planejador de consultas (T15): logo depois de subir e a cada 6 h
  const optimize = () => safely('estatísticas do banco', () => optimizeDb())
  setTimeout(optimize, 30_000).unref?.()
  setInterval(optimize, 6 * 3600_000).unref?.()
  // contatos no Mautic: papel, plano e assinatura em dia nos segmentos "[AtendeRadar] …" (só com o Mautic configurado)
  if (mauticEnabled()) setInterval(() => safely('contatos no Mautic', () => syncAllMembersToMautic()), 6 * 3600_000).unref?.()
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
