/*
 * B6 · Agrupamento de alertas. Regras que apontam a MESMA causa na mesma conversa viram um alerta só:
 *  · "resposta": cliente esperando a empresa (sem 1ª resposta, sem resposta após interação, resposta lenta, preço sem retorno, intenção alta)
 *  · "promessa": promessa perto de vencer → vencida (o mesmo alerta sobe de gravidade)
 *  · "irritacao": cliente irritado
 * Outras regras (inclusive as criadas pela empresa com outro tipo) agrupam só com elas mesmas.
 *
 * O alerta do grupo mostra a regra mais específica que disparou (ex.: "Pedido de preço sem retorno" em vez de
 * "Cliente sem primeira resposta") com a MAIOR gravidade entre as que dispararam.
 * Se o problema volta na mesma conversa depois de o motor ter resolvido sozinho, o mesmo alerta reabre com o
 * contador +1 (sem novo e-mail nem "alert.created" no webhook).
 */

export const ALERT_GROUP: Record<string, string> = {
  no_response: 'resposta',
  no_response_followup: 'resposta',
  slow_response: 'resposta',
  pending_quote: 'resposta',
  high_intent_no_reply: 'resposta',
  promise_overdue: 'promessa',
  promise_approaching: 'promessa',
  overdue_promise: 'promessa',
  customer_frustrated: 'irritacao',
}

// Quanto menor, mais específica (vira o título do alerta do grupo)
const SPECIFICITY: Record<string, number> = {
  high_intent_no_reply: 0,
  pending_quote: 1,
  no_response: 2,
  no_response_followup: 3,
  slow_response: 4,
  promise_overdue: 0,
  overdue_promise: 0,
  promise_approaching: 1,
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
export const severityRank = (s: string | null | undefined) => SEVERITY_RANK[s ?? ''] ?? 0

export interface GroupRule { id: string; name: string; type: string; severity: string; notificationChannels: string }

export const alertGroup = (rule: { id: string; type: string }) => ALERT_GROUP[rule.type] ?? `regra-${rule.id}`
export const alertGroupKey = (rule: { id: string; type: string }, conversationId: string) => `${alertGroup(rule)}|${conversationId}`

const channelsOf = (json: string): string[] => {
  try {
    const v = JSON.parse(json || '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Das regras do mesmo grupo que dispararam: a que dá o título (mais específica), a maior gravidade e a união dos canais
 * (se alguma das regras pede e-mail, o alerta do grupo manda e-mail). null = nenhuma disparou.
 */
export function groupHeadline<R extends GroupRule>(hits: R[]): { headline: R; severity: string; channels: string[] } | null {
  if (!hits.length) return null
  const headline = [...hits].sort((a, b) => (SPECIFICITY[a.type] ?? 9) - (SPECIFICITY[b.type] ?? 9) || severityRank(b.severity) - severityRank(a.severity))[0]
  const severity = hits.reduce((s, r) => (severityRank(r.severity) > severityRank(s) ? r.severity : s), hits[0].severity)
  const channels = [...new Set(hits.flatMap((r) => channelsOf(r.notificationChannels)))]
  return { headline, severity, channels }
}
