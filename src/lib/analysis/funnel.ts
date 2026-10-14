/** Uma linha de `conversation.groupBy({ by: ['inferredStage', 'operationalStatus'] })`. */
export interface StageStatusGroup {
  inferredStage: string | null
  operationalStatus: string
  _count: { _all: number }
}

/**
 * T15 · Números do funil do painel a partir de UMA consulta agrupada, em vez de cinco `count` (um por estágio/desfecho).
 * Dá os mesmos números das contagens separadas (teste: dashboard-funnel.unit.spec.ts).
 */
export function funnelCounts(groups: StageStatusGroup[]) {
  const sum = (ok: (g: StageStatusGroup) => boolean) => groups.filter(ok).reduce((s, g) => s + g._count._all, 0)
  return {
    all: sum(() => true),
    price: sum((g) => g.inferredStage === 'price'),
    proposal: sum((g) => g.inferredStage === 'proposal'),
    won: sum((g) => g.operationalStatus === 'won'),
    lost: sum((g) => g.operationalStatus === 'lost'),
  }
}
