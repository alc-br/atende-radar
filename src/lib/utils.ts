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
    case 'critical': return 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800'
    case 'high': return 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800'
    case 'medium': return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
    case 'low': return 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800'
    case 'info': return 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800'
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
