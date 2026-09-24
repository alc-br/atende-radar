// Oportunidade de venda estimada: ticket médio da empresa × chance de fechar (depende da intenção do cliente).
const FACTOR: Record<string, number> = {
  compra: 3.3,
  negociacao: 2.8,
  agendamento: 2.5,
  disponibilidade: 1.9,
  preco: 1.6,
  consulta: 0.8,
}

export interface OpportunityEstimate {
  baseTicket: number
  probability: number
  intentFactor: number
  expectedValue: number
  rangeLow: number
  rangeHigh: number
}

/** null = essa intenção não é oportunidade de venda (suporte, reclamação, cancelamento...). É sempre uma ESTIMATIVA, com faixa. */
export function estimateOpportunity(intent: string | null, avgTicket: number, conversionRate: number): OpportunityEstimate | null {
  if (!intent || !(intent in FACTOR)) return null
  const probability = Math.min(0.95, conversionRate * FACTOR[intent])
  const expectedValue = Math.round(avgTicket * probability)
  return {
    baseTicket: avgTicket,
    probability: +probability.toFixed(2),
    intentFactor: FACTOR[intent],
    expectedValue,
    rangeLow: Math.round(expectedValue * 0.7),
    rangeHigh: Math.round(expectedValue * 1.3),
  }
}
