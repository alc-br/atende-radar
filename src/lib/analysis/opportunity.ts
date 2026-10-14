// Oportunidade de venda estimada: ticket médio da empresa × chance de fechar (depende da intenção do cliente).
const FACTOR: Record<string, number> = {
  compra: 3.3,
  negociacao: 2.8,
  agendamento: 2.5,
  disponibilidade: 1.9,
  preco: 1.6,
  consulta: 0.8,
}

/** Teto da chance de fechar (nenhuma conversa é venda garantida). */
export const MAX_PROBABILITY = 0.95
/** A faixa mostrada é o valor estimado ± 30 %. */
export const RANGE_SPREAD = 0.3
/** Padrões usados quando a empresa ainda não preencheu Configurações › Receita. */
export const DEFAULT_AVG_TICKET = 1500
export const DEFAULT_CONVERSION_RATE = 0.18

export interface OpportunityEstimate {
  baseTicket: number
  probability: number
  intentFactor: number
  expectedValue: number
  rangeLow: number
  rangeHigh: number
}

/** Cada passo do cálculo, para a tela "Como calculamos" mostrar exatamente o que o motor fez. */
export interface OpportunityBreakdown extends OpportunityEstimate {
  intent: string
  conversionRate: number // taxa de conversão da empresa (0–1)
  rawProbability: number // conversão × fator, antes do teto
  capped: boolean // a chance bateu no teto de 95 %
  rangeSpread: number
}

/** Ticket médio e taxa de conversão das Configurações (mesma leitura do motor; conversão aceita "20" ou "0.2"). */
export function revenueSettings(settings: { avgTicket?: unknown; convRate?: unknown } | null | undefined): { avgTicket: number; conversionRate: number } {
  const avgTicket = Number(settings?.avgTicket) > 0 ? Number(settings?.avgTicket) : DEFAULT_AVG_TICKET
  const convRateRaw = Number(settings?.convRate)
  const conversionRate = convRateRaw > 0 ? (convRateRaw > 1 ? convRateRaw / 100 : convRateRaw) : DEFAULT_CONVERSION_RATE
  return { avgTicket, conversionRate }
}

/** O cálculo completo, passo a passo. null = essa intenção não é oportunidade de venda. */
export function opportunityBreakdown(intent: string | null, avgTicket: number, conversionRate: number): OpportunityBreakdown | null {
  if (!intent || !(intent in FACTOR)) return null
  const rawProbability = conversionRate * FACTOR[intent]
  const probability = Math.min(MAX_PROBABILITY, rawProbability)
  const expectedValue = Math.round(avgTicket * probability)
  return {
    intent,
    conversionRate,
    rawProbability,
    capped: rawProbability > MAX_PROBABILITY,
    rangeSpread: RANGE_SPREAD,
    baseTicket: avgTicket,
    probability: +probability.toFixed(2),
    intentFactor: FACTOR[intent],
    expectedValue,
    rangeLow: Math.round(expectedValue * (1 - RANGE_SPREAD)),
    rangeHigh: Math.round(expectedValue * (1 + RANGE_SPREAD)),
  }
}

/** null = essa intenção não é oportunidade de venda (suporte, reclamação, cancelamento...). É sempre uma ESTIMATIVA, com faixa. */
export function estimateOpportunity(intent: string | null, avgTicket: number, conversionRate: number): OpportunityEstimate | null {
  const b = opportunityBreakdown(intent, avgTicket, conversionRate)
  if (!b) return null
  const { baseTicket, probability, intentFactor, expectedValue, rangeLow, rangeHigh } = b
  return { baseTicket, probability, intentFactor, expectedValue, rangeLow, rangeHigh }
}
