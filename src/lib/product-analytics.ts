import { db } from './db'
import { dayKey, FUNNEL_MILESTONES, PLATFORM_AI_ORG, type MilestoneName } from './product-events'
import { demoOrgId, simulationOrgIds } from './sandbox'

// I7 · Números do produto para o operador da plataforma (Admin › Produto). Só agregados: nenhuma linha devolvida
// identifica pessoa; por empresa aparece só o nome dela (o operador já vê a lista de empresas no Admin).

const DAY = 86400000
const HOUR = 3600000
const RETENTION_WEEKS = 8

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
const parseProps = (s: string | null): Record<string, unknown> => {
  try {
    return s ? (JSON.parse(s) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const STAGE_LABELS: Record<'visit' | MilestoneName, string> = {
  visit: 'Visita à página de vendas',
  signup: 'Cadastro',
  first_connection: 'WhatsApp conectado',
  first_conversation: '1ª conversa recebida',
  first_alert: '1º alerta',
  first_payment: '1º pagamento aprovado',
}

export async function productAnalytics(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY)

  // ---- funil: visitas (contador do dia) + empresas que se cadastraram no período e até onde chegaram ----
  const views = await db.pageViewDaily.aggregate({ where: { page: 'landing', day: { gte: dayKey(since) } }, _sum: { count: true } })
  // empresas simuladas (S1) não entram em nenhum número (o simulador nem grava eventos delas; isto é a segunda trava)
  const simIds = await simulationOrgIds()
  const signups = await db.productMilestone.findMany({ where: { name: 'signup', reachedAt: { gte: since }, organizationId: { notIn: simIds } }, select: { organizationId: true, reachedAt: true } })
  const signupAt = new Map(signups.map((s) => [s.organizationId, s.reachedAt]))
  const cohort = [...signupAt.keys()]
  const later = cohort.length
    ? await db.productMilestone.findMany({ where: { organizationId: { in: cohort }, name: { not: 'signup' } }, select: { organizationId: true, name: true, reachedAt: true } })
    : []

  const counts: Record<string, number> = { visit: views._sum.count ?? 0, signup: cohort.length }
  const hoursTo: Record<string, number[]> = {}
  for (const m of later) {
    counts[m.name] = (counts[m.name] ?? 0) + 1
    const start = signupAt.get(m.organizationId)
    if (start) (hoursTo[m.name] ??= []).push(Math.max(0, (m.reachedAt.getTime() - start.getTime()) / HOUR))
  }
  const keys = ['visit', ...FUNNEL_MILESTONES] as const
  const funnel = keys.map((key, i) => {
    const count = counts[key] ?? 0
    const prev = i > 0 ? counts[keys[i - 1]] ?? 0 : null
    return {
      key,
      label: STAGE_LABELS[key],
      count,
      conversionFromPrevious: prev === null ? null : ratio(count, prev),
      conversionFromSignup: i <= 1 ? null : ratio(count, cohort.length),
      medianHoursFromSignup: i <= 1 ? null : median(hoursTo[key] ?? []),
    }
  })

  // ---- retenção semanal simples: das empresas cadastradas no período, quantas usaram o painel na semana N ----
  const activity = cohort.length
    ? await db.productEvent.findMany({ where: { organizationId: { in: cohort }, createdAt: { gte: since } }, select: { organizationId: true, createdAt: true }, take: 200_000 })
    : []
  const activeWeeks = new Map<string, Set<number>>()
  for (const e of activity) {
    const start = e.organizationId ? signupAt.get(e.organizationId) : undefined
    if (!start || !e.organizationId) continue
    const w = Math.floor((e.createdAt.getTime() - start.getTime()) / (7 * DAY))
    if (w < 0 || w >= RETENTION_WEEKS) continue
    if (!activeWeeks.has(e.organizationId)) activeWeeks.set(e.organizationId, new Set())
    activeWeeks.get(e.organizationId)!.add(w)
  }
  const retention = Array.from({ length: Math.min(RETENTION_WEEKS, Math.max(1, Math.ceil(days / 7))) }, (_, week) => {
    // só entra quem já teve a semana N começada
    const eligible = cohort.filter((id) => signupAt.get(id)!.getTime() + week * 7 * DAY <= now.getTime())
    const active = eligible.filter((id) => activeWeeks.get(id)?.has(week)).length
    return { week, eligible: eligible.length, active, rate: ratio(active, eligible.length) }
  })

  // ---- uso por tela ----
  // a organização de demonstração (senha pública) não entra no uso por tela nem no tour
  const notDemo = { organizationId: { notIn: [demoOrgId(), ...simIds] } }
  const screenRows = await db.productEvent.groupBy({ by: ['props'], where: { name: 'screen_view', createdAt: { gte: since }, ...notDemo }, _count: { _all: true } })
  const screenOrgs = await db.productEvent.groupBy({ by: ['props', 'organizationId'], where: { name: 'screen_view', createdAt: { gte: since }, ...notDemo } })
  const orgsPerScreen = new Map<string, number>()
  for (const r of screenOrgs) orgsPerScreen.set(r.props ?? '', (orgsPerScreen.get(r.props ?? '') ?? 0) + 1)
  const screens = screenRows
    .map((r) => ({ view: String(parseProps(r.props).view ?? '—'), views: r._count._all, organizations: orgsPerScreen.get(r.props ?? '') ?? 0 }))
    .sort((a, b) => b.views - a.views)

  // ---- tour: concluído x pulado ----
  const tourRows = await db.productEvent.groupBy({ by: ['name', 'props'], where: { name: { in: ['tour_completed', 'tour_skipped'] }, createdAt: { gte: since }, ...notDemo }, _count: { _all: true } })
  const tourMap = new Map<string, { completed: number; skipped: number }>()
  for (const r of tourRows) {
    const tour = String(parseProps(r.props).tour ?? '—')
    const t = tourMap.get(tour) ?? { completed: 0, skipped: 0 }
    if (r.name === 'tour_completed') t.completed += r._count._all
    else t.skipped += r._count._all
    tourMap.set(tour, t)
  }
  const tours = [...tourMap.entries()]
    .map(([tour, t]) => ({ tour, ...t, completionRate: ratio(t.completed, t.completed + t.skipped) }))
    .sort((a, b) => b.completed + b.skipped - (a.completed + a.skipped))

  // ---- custo de IA por organização ----
  const aiRows = await db.aiUsage.groupBy({
    by: ['organizationId'],
    where: { createdAt: { gte: since }, organizationId: { notIn: simIds } },
    _sum: { costBrl: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
  })
  const aiConvs = aiRows.length
    ? await db.aiUsage.groupBy({ by: ['organizationId', 'conversationId'], where: { createdAt: { gte: since }, conversationId: { not: null }, organizationId: { notIn: simIds } } })
    : []
  const convsPerOrg = new Map<string, number>()
  for (const r of aiConvs) convsPerOrg.set(r.organizationId, (convsPerOrg.get(r.organizationId) ?? 0) + 1)
  const orgNames = aiRows.length
    ? new Map((await db.organization.findMany({ where: { id: { in: aiRows.map((r) => r.organizationId) } }, select: { id: true, displayName: true } })).map((o) => [o.id, o.displayName]))
    : new Map<string, string>()
  const aiByOrg = aiRows
    .map((r) => {
      const cost = r._sum.costBrl ?? 0
      const conversations = convsPerOrg.get(r.organizationId) ?? 0
      return {
        organizationId: r.organizationId,
        organization: orgNames.get(r.organizationId) ?? (r.organizationId === PLATFORM_AI_ORG ? 'Plataforma (situações novas)' : '(empresa apagada)'),
        calls: r._count._all,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        conversations,
        costBrl: cost,
        costPerConversationBrl: conversations ? cost / conversations : null,
      }
    })
    .sort((a, b) => b.costBrl - a.costBrl)
  const totalCost = aiByOrg.reduce((s, r) => s + r.costBrl, 0)
  const totalConvs = aiByOrg.reduce((s, r) => s + r.conversations, 0)

  return {
    days,
    since: since.toISOString(),
    funnel,
    activation: {
      medianHoursToFirstAlert: funnel.find((s) => s.key === 'first_alert')?.medianHoursFromSignup ?? null,
      medianHoursToFirstConnection: funnel.find((s) => s.key === 'first_connection')?.medianHoursFromSignup ?? null,
    },
    retention,
    screens,
    tours,
    ai: {
      // sem nenhuma chamada registrada no período: a análise é por regras (custo zero), não "custo desconhecido"
      mode: aiRows.length ? ('provider' as const) : ('rules' as const),
      totalCostBrl: totalCost,
      costPerConversationBrl: totalConvs ? totalCost / totalConvs : null,
      byOrganization: aiByOrg.slice(0, 50),
    },
  }
}

export type ProductAnalytics = Awaited<ReturnType<typeof productAnalytics>>
