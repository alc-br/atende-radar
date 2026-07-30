'use client'

import { useMemo } from 'react'
import {
  ArrowLeft,
  Phone,
  Clock,
  User,
  Tag,
  ShieldAlert,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  MessageSquare,
  Crosshair,
  HelpCircle,
  Handshake,
  Bell,
  SmilePlus,
  Target,
  Eye,
  Flame,
  Lightbulb,
  Award,
  BarChart3,
  Zap,
  RefreshCw,
  XCircle,
  HeartCrack,
  UserCog,
  Ban,
  ArrowRightLeft,
  Calculator,
  CalendarClock,
  FileWarning,
  Lock,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  conversations,
  agents,
  getConversationMessages,
  formatCurrency,
  timeAgo,
  getSeverityColor,
  getStageLabel,
  getIntentLabel,
  getUrgencyLabel,
  getSentimentLabel,
  getStatusLabel,
} from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

// --- Audit event markers (synthetic for demo) ---
const auditEventTypes = [
  { type: 'intent_detected', label: 'Intenção detectada', icon: Crosshair, color: 'text-teal-600 bg-teal-100 dark:bg-teal-950', dotColor: 'bg-teal-500' },
  { type: 'price_request', label: 'Pedido de preço', icon: DollarSign, color: 'text-amber-600 bg-amber-100 dark:bg-amber-950', dotColor: 'bg-amber-500' },
  { type: 'question_asked', label: 'Pergunta feita', icon: HelpCircle, color: 'text-sky-600 bg-sky-100 dark:bg-sky-950', dotColor: 'bg-sky-500' },
  { type: 'promise_made', label: 'Promessa feita', icon: Handshake, color: 'text-orange-600 bg-orange-100 dark:bg-orange-950', dotColor: 'bg-orange-500' },
  { type: 'alert_triggered', label: 'Alerta disparado', icon: Bell, color: 'text-red-600 bg-red-100 dark:bg-red-950', dotColor: 'bg-red-500' },
  { type: 'sentiment_change', label: 'Mudança de sentimento', icon: SmilePlus, color: 'text-purple-600 bg-purple-100 dark:bg-purple-950', dotColor: 'bg-purple-500' },
] as const

function getAuditEventsBetweenMessages(convId: string, msgIndex: number, totalMessages: number) {
  // Generate synthetic audit events for demo between messages
  const seed = parseInt(convId.replace('conv_', '')) * 13 + msgIndex * 7
  const events = []
  if (msgIndex === 1 && totalMessages > 3) events.push(auditEventTypes[0]) // intent detected
  if (msgIndex === 2 && totalMessages > 4) events.push(auditEventTypes[1]) // price request
  if (msgIndex === 3 && totalMessages > 5) events.push(auditEventTypes[2]) // question asked
  if (msgIndex === 4 && totalMessages > 6) events.push(auditEventTypes[3]) // promise made
  if (seed % 5 === 0 && msgIndex > 0) events.push(auditEventTypes[4]) // alert triggered
  if (seed % 7 === 0 && msgIndex > 1) events.push(auditEventTypes[5]) // sentiment change
  return events
}

const statusBadgeColor: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  waiting_company: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  waiting_customer: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  in_progress: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  follow_up_due: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  won: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  lost: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
  closed: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700',
}

const sentimentDotColor: Record<string, string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-slate-400',
  confused: 'bg-amber-400',
  anxious: 'bg-orange-400',
  frustrated: 'bg-red-500',
  irritated: 'bg-red-600',
  desistindo: 'bg-gray-500',
}

const intentBadgeColor: Record<string, string> = {
  consulta: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  preco: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  disponibilidade: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  agendamento: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  compra: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  negociacao: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  suporte: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800',
  pos_venda: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  reclamacao: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  cancelamento: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800',
}

const stageBadgeColor: Record<string, string> = {
  discovery: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300',
  qualification: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300',
  evaluation: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
  price: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300',
  proposal: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300',
  negotiation: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300',
  decision: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
  won: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
  lost: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
  post_sale: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300',
}

const urgencyBadgeVariant: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  high: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  normal: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
}

const sentimentBadgeColor: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  confused: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  anxious: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  frustrated: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  irritated: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800',
  desistindo: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreBarColor(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function ConversationDetail() {
  const selectedConversationId = useAppStore((s) => s.selectedConversationId)
  const selectConversation = useAppStore((s) => s.selectConversation)
  const setView = useAppStore((s) => s.setView)

  const conv = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId),
    [selectedConversationId]
  )

  const messages = useMemo(
    () => (selectedConversationId ? getConversationMessages(selectedConversationId) : []),
    [selectedConversationId]
  )

  const agent = useMemo(
    () => agents.find((a) => a.id === conv?.agentId),
    [conv?.agentId]
  )

  if (!conv) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <MessageSquare className="h-12 w-12" />
        <p>Conversa não encontrada.</p>
        <Button variant="outline" onClick={() => { selectConversation(null); setView('conversations') }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar às conversas
        </Button>
      </div>
    )
  }

  const handleBack = () => {
    selectConversation(null)
    setView('conversations')
  }

  // Synthetic audit data for the right panel
  const secondaryIntent = conv.primaryIntent === 'preco' ? 'agendamento' : conv.primaryIntent === 'consulta' ? 'preco' : 'suporte'
  const sentimentEvolution = conv.sentiment === 'positive'
    ? [{ from: 'neutral', to: 'positive', at: 'há 2h' }]
    : conv.sentiment === 'frustrated'
      ? [{ from: 'neutral', to: 'confused', at: 'há 5h' }, { from: 'confused', to: 'frustrated', at: 'há 1h' }]
      : []

  const openQuestions = [
    { id: 'q1', text: 'Qual o valor do tratamento completo?', status: 'answered' as const },
    { id: 'q2', text: 'Aceitam plano Unimed?', status: 'answered' as const },
    { id: 'q3', text: 'Horário de funcionamento aos sábados?', status: 'pending' as const },
  ]

  const promises = [
    { id: 'p1', text: 'Confirmar agendamento até amanhã', status: 'fulfilled' as const, dueAt: '2025-01-15T12:00:00' },
    { id: 'p2', text: 'Enviar orçamento detalhado', status: 'pending' as const, dueAt: '2025-01-16T18:00:00' },
  ]

  const findings = [
    { id: 'f1', type: 'Resposta lenta', severity: 'medium', evidence: 'Tempo de resposta de 12min, acima do SLA de 10min.' },
    { id: 'f2', type: 'Pergunta parcialmente respondida', severity: 'low', evidence: 'Cliente perguntou sobre horário aos sábados e não obteve resposta.' },
  ]

  const scoreBreakdown = {
    velocidade: { weight: 30, score: Math.round(conv.score * 0.95), label: 'Velocidade' },
    oportunidades: { weight: 25, score: Math.round(conv.score * 0.9), label: 'Oportunidades' },
    pendencias: { weight: 20, score: Math.round(conv.score * 0.85), label: 'Pendências' },
    qualidade: { weight: 15, score: Math.round(conv.score * 0.88), label: 'Qualidade' },
    recuperacao: { weight: 10, score: Math.round(conv.score * 0.8), label: 'Recuperação' },
  }

  const valueMemory = {
    ticketUsed: conv.potentialValue > 0 ? Math.round(conv.potentialValue * 0.7) : 0,
    ticketSource: 'Média do segmento (odonto)',
    probability: +(0.4 + Math.random() * 0.4).toFixed(2),
    probabilitySource: 'Modelo de intenção v3',
    factors: ['Pedido de preço explícito', 'Alta engajamento', 'Perguntas sobre plano'],
    range: [conv.potentialValue > 0 ? Math.round(conv.potentialValue * 0.8) : 0, conv.potentialValue],
    confidence: conv.confidence,
    lastUpdated: new Date(Date.now() - 1800000).toISOString(),
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b px-4 py-3 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: back + name + phone + connection */}
            <div className="flex items-start gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="mt-0.5 h-8 w-8 p-0"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold">{conv.customerName}</span>
                  <span className="font-mono text-sm text-muted-foreground">***{conv.customerPhone.slice(-4)}</span>
                  {conv.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      {conv.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs">
                          <Tag className="mr-1 h-2.5 w-2.5" />
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {conv.connectionName}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {conv.agentName}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn('text-xs', statusBadgeColor[conv.operationalStatus] || '')}
                  >
                    {getStatusLabel(conv.operationalStatus)}
                  </Badge>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo(conv.lastActivity)}
                  </span>
                  {conv.potentialValue > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                      <DollarSign className="h-3 w-3" />
                      {formatCurrency(conv.potentialValue)}
                    </span>
                  )}
                  <span className={cn('font-bold tabular-nums', scoreColor(conv.score))}>
                    {conv.score}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Sensitive data indicator */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Lock className="h-3.5 w-3.5" />
                  Dados sensíveis
                </div>
              </TooltipTrigger>
              <TooltipContent>Esta conversa contém dados pessoais sensíveis</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Main content: Resizable panels */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* LEFT: Message Timeline */}
            <ResizablePanel defaultSize={60} minSize={35}>
              <ScrollArea className="custom-scrollbar h-full">
                <div className="flex flex-col gap-1 p-4 lg:p-6">
                  {messages.map((msg, idx) => {
                    const isOutbound = msg.direction === 'outbound'
                    const auditEvents = getAuditEventsBetweenMessages(conv.id, idx, messages.length)

                    return (
                      <div key={msg.id}>
                        {/* Audit event markers before this message */}
                        {auditEvents.length > 0 && (
                          <div className="flex items-center justify-center gap-2 py-2">
                            <Separator className="flex-1" />
                            <div className="flex items-center gap-1.5 flex-wrap justify-center">
                              {auditEvents.map((ev) => {
                                const Icon = ev.icon
                                return (
                                  <Tooltip key={ev.type}>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={cn(
                                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                                          ev.color
                                        )}
                                      >
                                        <span className={cn('h-1.5 w-1.5 rounded-full', ev.dotColor)} />
                                        <Icon className="h-3 w-3" />
                                        <span className="hidden sm:inline">{ev.label}</span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>{ev.label}</TooltipContent>
                                  </Tooltip>
                                )
                              })}
                            </div>
                            <Separator className="flex-1" />
                          </div>
                        )}

                        {/* Message bubble */}
                        <div
                          className={cn(
                            'flex gap-2',
                            isOutbound ? 'flex-row-reverse' : 'flex-row'
                          )}
                        >
                          <Avatar className="h-7 w-7 flex-shrink-0 mt-1">
                            <AvatarFallback
                              className={cn(
                                'text-xs',
                                isOutbound
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {isOutbound ? 'E' : 'C'}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={cn(
                              'max-w-[75%] rounded-2xl px-4 py-2.5',
                              isOutbound
                                ? 'bg-emerald-600 text-white rounded-tr-md dark:bg-emerald-700'
                                : 'bg-muted text-foreground rounded-tl-md'
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn('text-xs font-semibold', isOutbound ? 'text-emerald-100' : 'text-muted-foreground')}>
                                {isOutbound ? 'Empresa' : 'Cliente'}
                              </span>
                              <span className={cn('text-xs', isOutbound ? 'text-emerald-200' : 'text-muted-foreground')}>
                                {formatMsgTime(msg.occurredAt)}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed">{msg.text}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* RIGHT: Audit Panel */}
            <ResizablePanel defaultSize={40} minSize={25}>
              <ScrollArea className="custom-scrollbar h-full">
                <div className="flex flex-col gap-4 p-4 lg:p-6">

                  {/* Summary */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        Resumo da conversa
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Cliente entrou em contato solicitando informações sobre clareamento dental.
                        Demonstrou interesse no tratamento completo e perguntou sobre aceitação
                        de plano Unimed. Atendente respondeu prontamente sobre valores e confirmou
                        aceitação do plano. Agendamento proposto para sexta-feira, pendente confirmação.
                      </p>
                    </CardContent>
                  </Card>

                  {/* Classification */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Target className="h-4 w-4 text-teal-600" />
                        Classificação
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Intenção principal:</span>
                        <Badge variant="outline" className={cn('text-xs', intentBadgeColor[conv.primaryIntent] || '')}>
                          {getIntentLabel(conv.primaryIntent)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Intenção secundária:</span>
                        <Badge variant="outline" className={cn('text-xs', intentBadgeColor[secondaryIntent] || '')}>
                          {getIntentLabel(secondaryIntent)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Urgência:</span>
                        <Badge variant="outline" className={cn('text-xs', urgencyBadgeVariant[conv.urgency] || '')}>
                          {getUrgencyLabel(conv.urgency)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Sentimento:</span>
                        <Badge variant="outline" className={cn('text-xs', sentimentBadgeColor[conv.sentiment] || '')}>
                          <span className={cn('mr-1.5 h-2 w-2 rounded-full inline-block', sentimentDotColor[conv.sentiment] || 'bg-slate-400')} />
                          {getSentimentLabel(conv.sentiment)}
                        </Badge>
                        {sentimentEvolution.length > 0 && (
                          <div className="flex items-center gap-1 ml-1">
                            {sentimentEvolution.map((e, i) => (
                              <span key={i} className="text-xs text-muted-foreground">
                                {getSentimentLabel(e.from)} <ArrowRightLeft className="inline h-3 w-3" /> {getSentimentLabel(e.to)} ({e.at})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Etapa inferida:</span>
                        <Badge variant="outline" className={cn('text-xs', stageBadgeColor[conv.inferredStage] || '')}>
                          {getStageLabel(conv.inferredStage)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Open Questions */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-sky-600" />
                        Perguntas em aberto
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {openQuestions.map((q) => (
                        <div key={q.id} className="flex items-start gap-2 text-sm">
                          {q.status === 'answered' ? (
                            <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                          ) : (
                            <CircleDot className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
                          )}
                          <span className={cn(q.status === 'answered' ? 'text-muted-foreground line-through' : 'text-foreground')}>
                            {q.text}
                          </span>
                          <Badge variant={q.status === 'answered' ? 'secondary' : 'outline'} className="ml-auto text-xs flex-shrink-0">
                            {q.status === 'answered' ? 'Respondida' : 'Pendente'}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Promises */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Handshake className="h-4 w-4 text-orange-600" />
                        Promessas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {promises.map((p) => {
                        const isOverdue = p.status === 'pending' && new Date(p.dueAt) < new Date()
                        return (
                          <div key={p.id} className="flex items-start gap-2 text-sm">
                            {p.status === 'fulfilled' ? (
                              <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                            ) : isOverdue ? (
                              <AlertTriangle className="h-4 w-4 mt-0.5 text-red-600 flex-shrink-0" />
                            ) : (
                              <Clock className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className={cn(
                                p.status === 'fulfilled' ? 'text-muted-foreground' : 'text-foreground'
                              )}>
                                {p.text}
                              </span>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <CalendarClock className="h-3 w-3" />
                                Prazo: {new Date(p.dueAt).toLocaleDateString('pt-BR')} {new Date(p.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            <Badge
                              variant={p.status === 'fulfilled' ? 'secondary' : isOverdue ? 'destructive' : 'outline'}
                              className="text-xs flex-shrink-0"
                            >
                              {p.status === 'fulfilled' ? 'Cumprida' : isOverdue ? 'Vencida' : 'Pendente'}
                            </Badge>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>

                  {/* Findings / Falhas */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <FileWarning className="h-4 w-4 text-red-600" />
                        Falhas encontradas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {findings.map((f) => (
                        <div key={f.id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn('text-xs', getSeverityColor(f.severity))}>
                              {f.severity === 'critical' ? 'Crítica' : f.severity === 'high' ? 'Alta' : f.severity === 'medium' ? 'Média' : 'Baixa'}
                            </Badge>
                            <span className="text-sm font-medium">{f.type}</span>
                          </div>
                          <p className="text-xs text-muted-foreground pl-2 border-l-2 border-muted-foreground/30">
                            {f.evidence}
                          </p>
                        </div>
                      ))}
                      {findings.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhuma falha detectada.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Recommendation */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        Recomendação para o gestor
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Conversa com boa evolução. O atendente respondeu ao pedido de preço em tempo adequado
                        e demonstrou conhecimento. Entretanto, uma pergunta sobre horário de sábado ficou
                        sem resposta. Recomenda-se acompanhar a confirmação do agendamento e orientar
                        o atendente a sempre verificar se restam dúvidas antes de encerrar.
                      </p>
                    </CardContent>
                  </Card>

                  {/* Score Composition */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-teal-600" />
                        Composição da nota ({conv.score})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {Object.entries(scoreBreakdown).map(([key, item]) => (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {item.label} <span className="text-xs">({item.weight}%)</span>
                            </span>
                            <span className={cn('font-medium tabular-nums', scoreColor(item.score))}>
                              {item.score}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', scoreBarColor(item.score))}
                              style={{ width: `${item.score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Potential Value Memory */}
                  {conv.potentialValue > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Calculator className="h-4 w-4 text-emerald-600" />
                          Cálculo do valor potencial
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <span className="text-muted-foreground">Ticket usado</span>
                          <span className="text-right font-medium">{formatCurrency(valueMemory.ticketUsed)}</span>
                          <span className="text-muted-foreground">Fonte do ticket</span>
                          <span className="text-right text-xs text-muted-foreground">{valueMemory.ticketSource}</span>
                          <span className="text-muted-foreground">Probabilidade</span>
                          <span className="text-right font-medium">{(valueMemory.probability * 100).toFixed(0)}%</span>
                          <span className="text-muted-foreground">Fonte prob.</span>
                          <span className="text-right text-xs text-muted-foreground">{valueMemory.probabilitySource}</span>
                          <span className="text-muted-foreground">Faixa</span>
                          <span className="text-right font-medium">
                            {formatCurrency(valueMemory.range[0])} – {formatCurrency(valueMemory.range[1])}
                          </span>
                          <span className="text-muted-foreground">Confiança</span>
                          <span className="text-right font-medium">{(valueMemory.confidence * 100).toFixed(0)}%</span>
                          <span className="text-muted-foreground">Fatores</span>
                          <span className="text-right text-xs text-muted-foreground">{valueMemory.factors.join(', ')}</span>
                          <span className="text-muted-foreground">Atualizado</span>
                          <span className="text-right text-xs text-muted-foreground">{timeAgo(valueMemory.lastUpdated)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Correction Actions */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-teal-600" />
                        Ações de correção
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Ajuste as classificações ou registre ações do gestor.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <ArrowRightLeft className="h-3 w-3" />
                          Alterar intenção
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <Flame className="h-3 w-3" />
                          Alterar urgência
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          Marcar pergunta respondida
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <Handshake className="h-3 w-3" />
                          Confirmar promessa
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <XCircle className="h-3 w-3" />
                          Cancelar promessa
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">
                          <Award className="h-3 w-3" />
                          Confirmar venda
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <DollarSign className="h-3 w-3" />
                          Informar valor real
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-red-600 dark:text-red-400 border-red-300 dark:border-red-700">
                          <HeartCrack className="h-3 w-3" />
                          Confirmar perda
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <UserCog className="h-3 w-3" />
                          Mudar responsável
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <Ban className="h-3 w-3" />
                          Marcar falso positivo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                </div>
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </TooltipProvider>
  )
}
