// Cores das etiquetas (classes `tag--*` do pacote de design) usadas na lista e no detalhe da conversa.

export const INTENT_TAG: Record<string, string> = {
  consulta: 'tag--verde',
  preco: 'tag--ambar',
  disponibilidade: 'tag--azul',
  agendamento: 'tag--ambar',
  compra: 'tag--verde',
  negociacao: 'tag--laranja',
  suporte: 'tag--cinza',
  pos_venda: 'tag--roxo',
  reclamacao: 'tag--vermelho',
  cancelamento: 'tag--cinza',
}

export const STAGE_TAG: Record<string, string> = {
  discovery: 'tag--cinza',
  qualification: 'tag--azul',
  evaluation: 'tag--ambar',
  price: 'tag--laranja',
  proposal: 'tag--azul',
  negotiation: 'tag--laranja',
  decision: 'tag--ambar',
  won: 'tag--verde',
  lost: 'tag--vermelho',
  post_sale: 'tag--roxo',
}

export const URGENCY_TAG: Record<string, string> = {
  critical: 'tag--vermelho',
  high: 'tag--vermelho',
  normal: 'tag--cinza',
  low: 'tag--verde',
}

export const SENTIMENT_TAG: Record<string, string> = {
  positive: 'tag--verde',
  neutral: 'tag--cinza',
  confused: 'tag--ambar',
  anxious: 'tag--laranja',
  frustrated: 'tag--vermelho',
  irritated: 'tag--vermelho',
  desistindo: 'tag--cinza',
}

export const STATUS_TAG: Record<string, string> = {
  new: 'tag--verde',
  waiting_company: 'tag--vermelho',
  waiting_customer: 'tag--ambar',
  in_progress: 'tag--verde',
  follow_up_due: 'tag--laranja',
  won: 'tag--verde',
  lost: 'tag--cinza',
  closed: 'tag--cinza',
}

export const SEVERITY_TAG: Record<string, string> = {
  critical: 'tag--vermelho',
  high: 'tag--laranja',
  medium: 'tag--ambar',
  low: 'tag--cinza',
}

/** Classe de cor de texto do pacote para uma nota (0–100). */
export function scoreTextClass(score: number) {
  if (score >= 80) return 'verde-txt'
  if (score >= 70) return 'laranja-txt'
  return 'vermelho'
}

/** Selo de nota do pacote (`nota nota--*`). */
export function scoreBadgeClass(score: number) {
  if (score >= 80) return 'nota nota--alta'
  if (score >= 70) return 'nota nota--media'
  return 'nota nota--baixa'
}

// Avatares: só tons com contraste suficiente para as iniciais
const AV_TONES = ['av--verde', 'av--azul', 'av--roxo', 'av--vermelho'] as const

export function avatarTone(seed: string | null | undefined) {
  const s = seed || ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AV_TONES[h % AV_TONES.length]
}

export function initials(name: string | null | undefined) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : ''
  return (first + last).toUpperCase()
}
