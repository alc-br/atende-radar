import { test, expect } from '@playwright/test'
import { funnelCounts, type StageStatusGroup } from '../../src/lib/analysis/funnel'

// T15 · O funil do painel passou de cinco `count` para um `groupBy`: os números têm de ser os mesmos.
const STAGES = [null, 'first_contact', 'price', 'proposal', 'negotiation', 'closed']
const STATUSES = ['open', 'waiting_company', 'waiting_customer', 'won', 'lost', 'closed']

function rng(seed: number) {
  let s = seed
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

/** Agrupa como o banco faz em groupBy(['inferredStage', 'operationalStatus']). */
function group(convs: Array<{ inferredStage: string | null; operationalStatus: string }>): StageStatusGroup[] {
  const m = new Map<string, StageStatusGroup>()
  for (const c of convs) {
    const k = `${c.inferredStage}|${c.operationalStatus}`
    const g = m.get(k) ?? { inferredStage: c.inferredStage, operationalStatus: c.operationalStatus, _count: { _all: 0 } }
    g._count._all += 1
    m.set(k, g)
  }
  return [...m.values()]
}

test('funil agrupado dá os mesmos números das contagens separadas', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed)
    const convs = Array.from({ length: Math.floor(r() * 400) }, () => ({
      inferredStage: STAGES[Math.floor(r() * STAGES.length)],
      operationalStatus: STATUSES[Math.floor(r() * STATUSES.length)],
    }))
    // o que as cinco consultas `count` antigas devolviam
    const antes = {
      all: convs.length,
      price: convs.filter((c) => c.inferredStage === 'price').length,
      proposal: convs.filter((c) => c.inferredStage === 'proposal').length,
      won: convs.filter((c) => c.operationalStatus === 'won').length,
      lost: convs.filter((c) => c.operationalStatus === 'lost').length,
    }
    expect(funnelCounts(group(convs))).toEqual(antes)
  }
})

test('funil vazio fica zerado', () => {
  expect(funnelCounts([])).toEqual({ all: 0, price: 0, proposal: 0, won: 0, lost: 0 })
})
