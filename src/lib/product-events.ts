import { Prisma } from '@prisma/client'
import { db } from './db'
import { isSimulationOrg } from './sandbox'

// Eventos analíticos do produto (I7), first-party: nada sai do servidor, nenhum script de terceiro.
// Nada aqui lança erro: medir nunca pode derrubar a ação principal (falha só vai para o log do servidor).
// Sem dado pessoal: só ids internos (organização/membro) e props pequenas com valores fechados (nome de tela, de tour).

// ---------- marcos do funil (um por organização) ----------

export const FUNNEL_MILESTONES = ['signup', 'first_connection', 'first_conversation', 'first_alert', 'first_payment'] as const
export type MilestoneName = (typeof FUNNEL_MILESTONES)[number]

// Marcos já gravados nesta instância: evita ir ao banco a cada mensagem/alerta depois do primeiro.
const reached = new Set<string>()

/** Grava o marco da organização se ainda não existe. Devolve true só na 1ª vez. */
export async function milestone(organizationId: string, name: MilestoneName, at = new Date()): Promise<boolean> {
  const key = `${organizationId}:${name}`
  if (reached.has(key)) return false
  try {
    if (await isSimulationOrg(organizationId)) return false // empresa simulada (S1) não entra no funil
    // depois de um reinício o cache está vazio: olha o banco antes, para o Prisma não sujar o log com o P2002 esperado
    if (await db.productMilestone.findUnique({ where: { organizationId_name: { organizationId, name } }, select: { name: true } })) {
      reached.add(key)
      return false
    }
    await db.productMilestone.create({ data: { organizationId, name, reachedAt: at } })
    reached.add(key)
    return true
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      reached.add(key) // já existia (outra instância ou reinício do servidor)
      return false
    }
    console.error('[product-events] falha ao gravar marco', name, e instanceof Error ? e.message : e)
    return false
  }
}

// ---------- eventos brutos ----------

export type ProductEventName = 'screen_view' | 'tour_completed' | 'tour_skipped'
type PropValue = string | number | boolean | null
const MAX_PROPS = 500

export async function track(
  name: ProductEventName,
  ctx: { organizationId?: string | null; memberId?: string | null },
  props?: Record<string, PropValue>,
): Promise<void> {
  try {
    if (await isSimulationOrg(ctx.organizationId)) return // empresa simulada (S1) não entra no uso por tela
    let json = props ? JSON.stringify(props) : null
    if (json && json.length > MAX_PROPS) json = JSON.stringify({ truncated: true })
    await db.productEvent.create({ data: { name, organizationId: ctx.organizationId ?? null, memberId: ctx.memberId ?? null, props: json } })
  } catch (e) {
    console.error('[product-events] falha ao registrar', name, e instanceof Error ? e.message : e)
  }
}

// ---------- visitas à página de vendas (contador do dia, sem cookie nem IP) ----------

export const PAGEVIEW_PAGES = ['landing'] as const
export type PageViewPage = (typeof PAGEVIEW_PAGES)[number]

/** AAAA-MM-DD no horário de Brasília. */
export const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export async function countPageView(page: PageViewPage, now = new Date()): Promise<void> {
  const day = dayKey(now)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await db.pageViewDaily.upsert({ where: { day_page: { day, page } }, create: { day, page, count: 1 }, update: { count: { increment: 1 } } })
      return
    } catch (e) {
      // duas visitas ao mesmo tempo no 1º acesso do dia: a segunda cai no "já existe" e tenta de novo (vira update)
      if (attempt === 1) console.error('[product-events] falha ao contar visita', e instanceof Error ? e.message : e)
    }
  }
}

// ---------- custo de IA ----------

const envNumber = (name: string) => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Custo estimado em R$ pelo preço configurado por milhão de tokens. Sem preço configurado = 0 (não inventa custo). */
export function estimateAiCostBrl(inputTokens: number, outputTokens: number): number {
  return (inputTokens * envNumber('AI_PRICE_BRL_PER_MTOK_IN') + outputTokens * envNumber('AI_PRICE_BRL_PER_MTOK_OUT')) / 1_000_000
}

export interface AiUsageInput {
  organizationId: string
  conversationId?: string | null
  provider: string
  model: string
  feature: string
  inputTokens: number
  outputTokens: number
  /** Custo informado pelo provedor, se houver; senão é estimado por estimateAiCostBrl. */
  costBrl?: number
}

/**
 * Registra uma chamada a provedor de IA (hoje: classificação pelo Claude, analysis/ai-classify.ts, só com AI_CLASSIFIER=claude).
 * Cada chamada passa por aqui e o custo aparece no Admin › Produto.
 */
export async function recordAiUsage(u: AiUsageInput): Promise<void> {
  try {
    const inputTokens = Math.max(0, Math.round(u.inputTokens || 0))
    const outputTokens = Math.max(0, Math.round(u.outputTokens || 0))
    await db.aiUsage.create({
      data: {
        organizationId: u.organizationId,
        conversationId: u.conversationId ?? null,
        provider: u.provider.slice(0, 40),
        model: u.model.slice(0, 80),
        feature: u.feature.slice(0, 40),
        inputTokens,
        outputTokens,
        costBrl: typeof u.costBrl === 'number' && Number.isFinite(u.costBrl) ? u.costBrl : estimateAiCostBrl(inputTokens, outputTokens),
      },
    })
  } catch (e) {
    console.error('[product-events] falha ao registrar uso de IA', e instanceof Error ? e.message : e)
  }
}
