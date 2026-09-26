export interface ScoreInput {
  firstResponseMinutes: number | null // null = a empresa ainda não respondeu
  waitingMinutes: number // há quanto tempo o cliente espera (0 se a bola está com o cliente)
  hasOpportunity: boolean
  sentiment: string
  messages: number
  unansweredPromises: number
  recovered: boolean
  /** SLA da empresa (Configurações › Atendimento). As faixas de nota são relativas a eles. Padrão: 10 e 30 min. */
  slaFirstMinutes?: number
  slaContinuityMinutes?: number
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
  // Tudo é medido em múltiplos do SLA: responder dentro de metade do SLA = nota máxima; 12× o SLA = zero.
  const slaFirst = i.slaFirstMinutes && i.slaFirstMinutes > 0 ? i.slaFirstMinutes : 10
  const slaCont = i.slaContinuityMinutes && i.slaContinuityMinutes > 0 ? i.slaContinuityMinutes : 30
  const rFirst = i.firstResponseMinutes != null ? i.firstResponseMinutes / slaFirst : null
  const rWaitFirst = i.waitingMinutes / slaFirst
  const rWaitCont = i.waitingMinutes / slaCont

  const velocidade =
    rFirst != null
      ? bands(rFirst, [[0.5, 100], [1, 85], [2, 65], [4, 40], [12, 20]], 0)
      : bands(rWaitFirst, [[1, 90], [3, 60], [6, 35], [18, 15]], 0)

  const pendencias = clamp(bands(rWaitCont, [[0, 100], [0.5, 85], [2, 60], [6, 30]], 0) - 40 * i.unansweredPromises)
  const oportunidades = i.hasOpportunity ? bands(rWaitCont, [[0.5, 100], [2, 60]], 20) : 100
  const qualidade = ({ positive: 100, neutral: 85, confused: 60, anxious: 65, frustrated: 30 } as Record<string, number>)[i.sentiment] ?? 85
  const recuperacao = i.recovered ? 100 : i.hasOpportunity && rWaitCont > 6 ? 40 : 80

  const components = { velocidade, oportunidades, pendencias, qualidade, recuperacao }
  const total = clamp(
    Math.round(velocidade * W.velocidade + oportunidades * W.oportunidades + pendencias * W.pendencias + qualidade * W.qualidade + recuperacao * W.recuperacao)
  )
  return { total, components, eligible: i.messages >= 2 }
}
