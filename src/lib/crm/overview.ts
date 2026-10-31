import type { Prisma, PrismaClient } from '@prisma/client'
import { activityWhere, dealScopeWhere, type OwnerScope } from './scope'

// Indicadores do CRM (CRM-08, /api/crm/overview). Bloco separado dos KPIs atuais do painel: nada aqui muda as contas
// das conversas. Regras:
//  - valor declarado (amountCents), estimado (estimatedAmountCents, da análise) e confirmado (ganho com valor) sempre
//    em campos separados; estimativa nunca entra em receita (T10.01);
//  - um negócio conta uma vez, por mais conversas que tenha (o funil é por negócio, não por vínculo; T10.02);
//  - período pela data de fechamento (closedAt) em UTC; a tela mostra no fuso de quem vê;
//  - escopo do papel: atendente vê os próprios, supervisor a equipe, os demais a empresa (só agregados).

type Client = PrismaClient | Prisma.TransactionClient

const STALE_DAYS_DEFAULT = 14
const DAY = 86400_000

export async function crmOverview(client: Client, organizationId: string, scope: OwnerScope, period: { from: Date; to: Date }, now = new Date()) {
  const base = dealScopeWhere(organizationId, scope)
  const closedIn = { closedAt: { gte: period.from, lt: period.to } }

  const [open, won, lost, stages, overdueTasks, openWithTask] = await Promise.all([
    client.crmDeal.findMany({
      where: { AND: [base, { status: 'open' }] },
      select: { id: true, stageId: true, amountCents: true, estimatedAmountCents: true, ownerMemberId: true, nextAction: true, nextActionAt: true, stageChangedAt: true },
    }),
    client.crmDeal.findMany({ where: { AND: [base, { status: 'won' }, closedIn] }, select: { id: true, amountCents: true, ownerMemberId: true } }),
    client.crmDeal.groupBy({ by: ['lostReasonCode'], where: { AND: [base, { status: 'lost' }, closedIn] }, _count: { _all: true } }),
    client.crmStage.findMany({ where: { organizationId }, select: { id: true, name: true, position: true, pipelineId: true, slaDays: true, status: true } }),
    client.crmActivity.count({ where: { AND: [activityWhere(organizationId, scope), { status: { in: ['open', 'in_progress'] }, dueAt: { lt: now } }] } }),
    client.crmActivity.findMany({ where: { AND: [activityWhere(organizationId, scope), { status: { in: ['open', 'in_progress'] }, dealId: { not: null } }] }, select: { dealId: true }, distinct: ['dealId'] }),
  ])

  // ganho no período ligado a um item da Fila de Recuperação (tarefa aberta pelo item ou recuperação concluída na conversa)
  const recoveredIds = won.length
    ? new Set(
        (await client.crmBusinessLink.findMany({ where: { organizationId, relationshipType: 'recovery', dealId: { in: won.map((d) => d.id) } }, select: { dealId: true }, distinct: ['dealId'] })).map((l) => l.dealId),
      )
    : new Set<string>()

  const stageById = new Map(stages.map((s) => [s.id, s]))
  const withTask = new Set(openWithTask.map((a) => a.dealId))
  const sum = (xs: (number | null)[]) => xs.reduce<number>((t, v) => t + (v ?? 0), 0)

  const byStage = new Map<string, { stageId: string; name: string; position: number; pipelineId: string; count: number; declaredCents: number; estimatedCents: number; daysInStageTotal: number }>()
  let stale = 0
  let withoutNextAction = 0
  for (const d of open) {
    const st = stageById.get(d.stageId)
    const row = byStage.get(d.stageId) ?? { stageId: d.stageId, name: st?.name ?? 'Etapa', position: st?.position ?? 0, pipelineId: st?.pipelineId ?? '', count: 0, declaredCents: 0, estimatedCents: 0, daysInStageTotal: 0 }
    const days = (now.getTime() - d.stageChangedAt.getTime()) / DAY
    row.count++
    row.declaredCents += d.amountCents ?? 0
    row.estimatedCents += d.estimatedAmountCents ?? 0
    row.daysInStageTotal += days
    byStage.set(d.stageId, row)
    if (days > (st?.slaDays ?? STALE_DAYS_DEFAULT)) stale++
    if (!d.nextAction && !d.nextActionAt && !withTask.has(d.id)) withoutNextAction++
  }

  const lostCount = lost.reduce((t, r) => t + r._count._all, 0)
  const wonWithAmount = won.filter((d) => d.amountCents !== null)
  const owners = new Map<string, { ownerMemberId: string | null; open: number; won: number; confirmedCents: number }>()
  const ownerRow = (id: string | null) => {
    let r = owners.get(id ?? '')
    if (!r) owners.set(id ?? '', (r = { ownerMemberId: id, open: 0, won: 0, confirmedCents: 0 }))
    return r
  }
  for (const d of open) ownerRow(d.ownerMemberId).open++
  for (const d of won) {
    const r = ownerRow(d.ownerMemberId)
    r.won++
    r.confirmedCents += d.amountCents ?? 0
  }

  return {
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    open: {
      count: open.length,
      declaredCents: sum(open.map((d) => d.amountCents)),
      estimatedCents: sum(open.map((d) => d.estimatedAmountCents)),
      withoutDeclaredAmount: open.filter((d) => d.amountCents === null).length,
      stale,
      withoutNextAction,
    },
    won: {
      count: won.length,
      confirmedCents: sum(wonWithAmount.map((d) => d.amountCents)),
      withoutAmount: won.length - wonWithAmount.length,
      recoveredCount: won.filter((d) => recoveredIds.has(d.id)).length,
      recoveredCents: sum(won.filter((d) => recoveredIds.has(d.id)).map((d) => d.amountCents)),
    },
    lost: {
      count: lostCount,
      byReason: lost.map((r) => ({ reason: r.lostReasonCode ?? 'other', count: r._count._all })).sort((a, b) => b.count - a.count),
    },
    /** ganhos ÷ (ganhos + perdidos) fechados no período; null sem fechamento */
    conversion: won.length + lostCount ? won.length / (won.length + lostCount) : null,
    overdueTasks,
    byStage: [...byStage.values()]
      .sort((a, b) => a.pipelineId.localeCompare(b.pipelineId) || a.position - b.position)
      .map(({ daysInStageTotal, ...r }) => ({ ...r, avgDaysInStage: r.count ? Math.round((daysInStageTotal / r.count) * 10) / 10 : null })),
    byOwner: [...owners.values()].sort((a, b) => b.confirmedCents - a.confirmedCents || b.open - a.open),
    methodology: {
      window: 'Ganhos e perdidos pela data de fechamento dentro do período (UTC). Abertos, parados e tarefas: situação de agora.',
      declared: 'Valor informado por uma pessoa no negócio.',
      estimated: 'Estimativa da análise das conversas. Não é receita.',
      confirmed: 'Soma dos negócios ganhos com valor informado. Ganho sem valor conta no total, não na soma.',
      recovered: 'Ganhos ligados a um item da Fila de Recuperação: tarefa aberta a partir do item ou recuperação concluída na conversa do negócio. Mostra a ligação, não prova que a recuperação causou a venda.',
      stale: `Aberto há mais dias na etapa do que o prazo da etapa (padrão ${STALE_DAYS_DEFAULT} dias).`,
      dedupe: 'Cada negócio conta uma vez, mesmo ligado a várias conversas.',
    },
  }
}
