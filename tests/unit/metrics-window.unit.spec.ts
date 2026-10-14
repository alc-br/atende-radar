import { test, expect } from '@playwright/test'
import { dayKey, dayMetrics, inMetricsWindow, metricsWindowStart, type MetricConversation, type MetricPromise } from '../../src/lib/analysis/day-metrics'

// T15 · recomputeMetrics passou a ler só as conversas da janela (inMetricsWindow) em vez da empresa inteira.
// Os números de hoje e de ontem (os únicos que ele grava) têm de sair iguais aos calculados com todas as conversas.
const DAY = 86400000
const NOW = new Date('2026-09-15T13:20:00Z')

function rng(seed: number) {
  let s = seed
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

/** Conversas espalhadas por 60 dias para trás (e um pouco para a frente), abertas e fechadas, com e sem mensagens. */
function randomConversations(seed: number): MetricConversation[] {
  const r = rng(seed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  return Array.from({ length: 300 }, () => {
    const openedAt = new Date(NOW.getTime() - r() * 60 * DAY + 0.2 * DAY)
    const span = r() * 10 * DAY
    const closed = r() < 0.6
    const closedAt = closed ? new Date(openedAt.getTime() + span) : null
    const messages = Array.from({ length: Math.floor(r() * 8) }, () => ({
      direction: pick(['inbound', 'outbound']),
      occurredAt: new Date(openedAt.getTime() + r() * span),
    }))
    const opportunities = Array.from({ length: r() < 0.4 ? 1 + Math.floor(r() * 2) : 0 }, () => ({
      status: pick(['active', 'won', 'lost']),
      expectedValue: Math.round(r() * 2000),
      createdAt: new Date(openedAt.getTime() + r() * span),
    }))
    return {
      openedAt,
      closedAt,
      operationalStatus: closed ? pick(['won', 'lost', 'closed']) : pick(['open', 'waiting_company', 'waiting_customer']),
      score: Math.round(r() * 100),
      messages,
      opportunities,
    }
  })
}

const promises: MetricPromise[] = [
  { status: 'open', dueAt: new Date(NOW.getTime() - DAY) },
  { status: 'open', dueAt: new Date(NOW.getTime() + DAY) },
  { status: 'kept', dueAt: new Date(NOW.getTime() - 2 * DAY) },
  { status: 'open', dueAt: null },
]

for (const tz of ['America/Sao_Paulo', 'America/Manaus', 'America/Noronha', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
  test(`hoje e ontem saem iguais lendo só a janela · ${tz}`, () => {
    const today = dayKey(NOW, tz)
    const yesterday = dayKey(new Date(NOW.getTime() - DAY), tz)
    const since = metricsWindowStart(NOW)
    for (let seed = 1; seed <= 20; seed++) {
      const all = randomConversations(seed)
      const windowed = all.filter((c) => inMetricsWindow(c, since))
      expect(windowed.length).toBeLessThan(all.length) // a janela de fato corta conversas antigas
      for (const date of [today, yesterday]) {
        expect(dayMetrics(windowed, promises, date, tz, NOW)).toEqual(dayMetrics(all, promises, date, tz, NOW))
        // desempenho por atendente usa as conversas abertas no dia: todas estão na janela
        const opened = (cs: MetricConversation[]) => cs.filter((c) => dayKey(c.openedAt, tz) === date)
        expect(opened(windowed)).toEqual(opened(all))
      }
    }
  })
}

test('dayKey com formatador reaproveitado dá o mesmo dia de antes', () => {
  const antigo = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  for (const tz of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo']) {
    for (let h = -48; h <= 48; h += 5) {
      const d = new Date(NOW.getTime() + h * 3600000)
      expect(dayKey(d, tz)).toBe(antigo(d, tz))
    }
  }
})
