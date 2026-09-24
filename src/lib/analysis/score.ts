export interface ScoreInput {
  firstResponseMinutes: number | null // null = a empresa ainda não respondeu
  waitingMinutes: number // há quanto tempo o cliente espera (0 se a bola está com o cliente)
  hasOpportunity: boolean
  sentiment: string
  messages: number
  unansweredPromises: number
  recovered: boolean
}

export interface Score {
  total: number
  components: { velocidade: number; oportunidades: number; pendencias: number; qualidade: number; recuperacao: number }
  eligible: boolean
}

// Pesos das 5 dimensões (somam 1).
const W = { velocidade: 0.3, oportunidades: 0.2, pendencias: 0.2, qualidade: 0.2, recuperacao: 0.1 }

const bands = (v: number, table: Array<[number, number]>, last: number) => {
  for (const [limit, score] of table) if (v <= limit) return score
  return last
}
const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** Nota 0–100 da conversa, em 5 dimensões, com regras simples e explicáveis (não é IA). */
export function scoreConversation(i: ScoreInput): Score {
  const velocidade =
    i.firstResponseMinutes != null
      ? bands(i.firstResponseMinutes, [[5, 100], [15, 85], [30, 65], [60, 40], [180, 20]], 0)
      : bands(i.waitingMinutes, [[10, 90], [30, 60], [60, 35], [180, 15]], 0)

  const pendencias = clamp(bands(i.waitingMinutes, [[0, 100], [15, 85], [60, 60], [180, 30]], 0) - 40 * i.unansweredPromises)
  const oportunidades = i.hasOpportunity ? bands(i.waitingMinutes, [[15, 100], [60, 60]], 20) : 100
  const qualidade = ({ positive: 100, neutral: 85, confused: 60, anxious: 65, frustrated: 30 } as Record<string, number>)[i.sentiment] ?? 85
  const recuperacao = i.recovered ? 100 : i.hasOpportunity && i.waitingMinutes > 180 ? 40 : 80

  const components = { velocidade, oportunidades, pendencias, qualidade, recuperacao }
  const total = clamp(
    Math.round(velocidade * W.velocidade + oportunidades * W.oportunidades + pendencias * W.pendencias + qualidade * W.qualidade + recuperacao * W.recuperacao)
  )
  return { total, components, eligible: i.messages >= 2 }
}
