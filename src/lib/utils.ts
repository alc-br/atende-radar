import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatPhone(last4: string): string {
  return `(**) *****-${last4}`
}

export function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min atrás`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h atrás`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d atrás`
}

export function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200'
    case 'high': return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200'
    case 'low': return 'text-emerald-600 bg-emerald-50 border-emerald-200'
    case 'info': return 'text-sky-600 bg-sky-50 border-sky-200'
    default: return 'text-muted-foreground bg-muted'
  }
}

export function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    discovery: 'Descoberta', qualification: 'Qualificação', evaluation: 'Avaliação',
    price: 'Preço', proposal: 'Proposta', negotiation: 'Negociação',
    decision: 'Decisão', won: 'Ganho', lost: 'Perdido', post_sale: 'Pós-venda',
  }
  return labels[stage] || stage
}

export function getIntentLabel(intent: string): string {
  const labels: Record<string, string> = {
    consulta: 'Consulta', preco: 'Preço', disponibilidade: 'Disponibilidade',
    agendamento: 'Agendamento', compra: 'Compra', negociacao: 'Negociação',
    cancelamento: 'Cancelamento', reclamacao: 'Reclamação', suporte: 'Suporte', pos_venda: 'Pós-venda',
  }
  return labels[intent] || intent
}

export function getUrgencyLabel(urgency: string): string {
  const labels: Record<string, string> = {
    low: 'Baixa', normal: 'Normal', high: 'Alta', critical: 'Crítica',
  }
  return labels[urgency] || urgency
}

export function getSentimentLabel(sentiment: string): string {
  const labels: Record<string, string> = {
    positive: 'Positivo', neutral: 'Neutro', confused: 'Confuso',
    anxious: 'Ansioso', frustrated: 'Frustrado', irritated: 'Irritado', desistindo: 'Desistindo',
  }
  return labels[sentiment] || sentiment
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: 'Nova', waiting_company: 'Aguardando empresa', waiting_customer: 'Aguardando cliente',
    in_progress: 'Em andamento', follow_up_due: 'Acompanhamento pendente',
    won: 'Ganha', lost: 'Perdida', closed: 'Encerrada', spam: 'Spam', excluded: 'Excluída',
  }
  return labels[status] || status
}
