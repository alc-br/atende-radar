'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { mutate } from '@/lib/mutation'
import { PrivacyMenu } from './privacy-menu'
import {
  ArrowLeft,
  Phone,
  Clock,
  Tag,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Handshake,
  Bell,
  Target,
  Flame,
  Award,
  BarChart3,
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
  Info,
  MoreVertical,
  RotateCcw,
} from 'lucide-react'

import {
  formatCurrency,
  timeAgo,
  getStageLabel,
  getIntentLabel,
  getUrgencyLabel,
  getSentimentLabel,
  getStatusLabel,
  cn,
} from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/permissions'
import { Skeleton } from '@/components/ui/skeleton'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  INTENT_TAG,
  STAGE_TAG,
  URGENCY_TAG,
  SENTIMENT_TAG,
  STATUS_TAG,
  SEVERITY_TAG,
  scoreTextClass,
  avatarTone,
  initials,
} from './tags'

// --- Marcadores da linha do tempo: só o que aconteceu de verdade nesta conversa ---
// (promessa detectada numa mensagem da empresa, promessa cumprida, alerta aberto entre duas mensagens)
interface TimelineMarker {
  key: string
  label: string
  title: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  /** classes de cor sobre o `chat__evento` do pacote (o padrão do pacote é o vermelho do alerta) */
  tone: string
  pill: string
}
const MARKER_STYLE = {
  promise_made: { label: 'Promessa feita', icon: Handshake, tone: 'text-[color:var(--laranja)]', pill: 'bg-[var(--laranja-fundo)]' },
  promise_kept: { label: 'Promessa cumprida', icon: CheckCircle2, tone: 'text-[color:var(--verde-700)]', pill: 'bg-[var(--verde-50)]' },
  alert_triggered: { label: 'Alerta disparado', icon: Bell, tone: '', pill: '' },
} as const

/** Marcadores a exibir ANTES da mensagem `idx` (idx = messages.length → depois da última). */
function timelineMarkersBefore(
  idx: number,
  messages: Array<{ id: string; occurredAt: string }>,
  promises: Array<{ id: string; sourceMessage?: string | null; completionMessage?: string | null; action: string }>,
  alerts: Array<{ id: string; title: string; createdAt: string }>
): TimelineMarker[] {
  const prev = idx > 0 ? messages[idx - 1] : null
  const cur = idx < messages.length ? messages[idx] : null
  const out: TimelineMarker[] = []
  if (prev) {
    for (const pr of promises) {
      if (pr.sourceMessage === prev.id) out.push({ key: `pm-${pr.id}`, title: pr.action, ...MARKER_STYLE.promise_made })
      if (pr.completionMessage === prev.id) out.push({ key: `pk-${pr.id}`, title: pr.action, ...MARKER_STYLE.promise_kept })
    }
  }
  const lo = prev ? new Date(prev.occurredAt).getTime() : -Infinity
  const hi = cur ? new Date(cur.occurredAt).getTime() : Infinity
  for (const a of alerts) {
    const t = new Date(a.createdAt).getTime()
    if (t > lo && t <= hi) out.push({ key: `al-${a.id}`, title: a.title, ...MARKER_STYLE.alert_triggered })
  }
  return out
}

const INTENT_OPTIONS = Object.keys(INTENT_TAG)
const URGENCY_OPTIONS = Object.keys(URGENCY_TAG)

const SEVERITY_LABEL: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' }

const SCORE_COMPONENTS: Array<{ key: string; label: string; weight: number }> = [
  { key: 'velocidade', label: 'Velocidade', weight: 30 },
  { key: 'oportunidades', label: 'Oportunidades', weight: 25 },
  { key: 'pendencias', label: 'Pendências', weight: 20 },
  { key: 'qualidade', label: 'Qualidade', weight: 15 },
  { key: 'recuperacao', label: 'Recuperação', weight: 10 },
]

function scoreBarClass(score: number) {
  if (score >= 80) return 'barra'
  if (score >= 70) return 'barra barra--laranja'
  return 'barra [&>i]:bg-[var(--vermelho)]'
}

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatMsgDay(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function MarkerLine({ markers }: { markers: TimelineMarker[] }) {
  return (
    <>
      {markers.map((ev) => {
        const Icon = ev.icon
        return (
          <div key={ev.key} className={cn('chat__evento', ev.tone)}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span role="note" aria-label={`${ev.label}: ${ev.title}`} className={ev.pill}>
                  <Icon className="ic" aria-hidden="true" />
                  {ev.label}
                </span>
              </TooltipTrigger>
              <TooltipContent>{ev.label}: {ev.title}</TooltipContent>
            </Tooltip>
          </div>
        )
      })}
    </>
  )
}

// P6 · "Como calculamos": os passos que o motor usou para chegar ao valor em risco (vêm prontos da API, mesma função do motor).
interface ValueExplanationData {
  intent: string
  classificationConfidence: number
  avgTicket: number
  conversionRate: number
  intentFactor: number
  rawProbability: number
  probability: number
  capped: boolean
  expectedValue: number
  rangeSpread: number
  rangeLow: number
  rangeHigh: number
  ticketSource?: string
  salesSample?: number
  minSample?: number
  ceiling?: number | null
  ceilingApplied?: boolean
  uncappedValue?: number
}

/** De onde veio o ticket médio usado no cálculo (Configurações › Financeiro › Amostra mínima). */
const TICKET_SOURCE_LABEL: Record<string, string> = {
  org_setting: 'Ticket médio informado nas Configurações',
  confirmed_sales: 'Média das vendas confirmadas',
}
const ticketSourceLabel = (s: string | null | undefined) => (s && TICKET_SOURCE_LABEL[s]) || s || '—'

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const factor = (x: number) => `×${x.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`

function ValueExplanation({ explanation: e, shownValue }: { explanation: ValueExplanationData | null | undefined; shownValue: number }) {
  return (
    <details className="mt-3 border-t border-[var(--borda)] pt-2" data-testid="value-explanation">
      <summary className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium">
        <HelpCircle className="ic verde-txt" aria-hidden="true" />
        Como calculamos
      </summary>
      {e ? (
        <>
          <dl className="calculo mt-2">
            <div>
              <dt>Ticket médio da empresa</dt>
              <dd>
                {formatCurrency(e.avgTicket)}
                {e.ticketSource === 'confirmed_sales' && ` (média de ${e.salesSample} vendas confirmadas)`}
              </dd>
            </div>
            <div><dt>Taxa de conversão da empresa</dt><dd>{pct(e.conversionRate)}</dd></div>
            <div>
              <dt>Sinal detectado</dt>
              <dd>Intenção “{getIntentLabel(e.intent)}” ({pct(e.classificationConfidence)} de confiança)</dd>
            </div>
            <div><dt>Multiplicador da intenção</dt><dd>{factor(e.intentFactor)}</dd></div>
            <div>
              <dt>Chance de fechar</dt>
              <dd>
                {pct(e.conversionRate)} {factor(e.intentFactor)} = {pct(e.rawProbability)}
                {e.capped && ' (limitada a 95%)'}
              </dd>
            </div>
            <div>
              <dt>Valor em risco</dt>
              <dd className="forte" data-testid="value-explanation-result">
                {formatCurrency(e.avgTicket)} × {pct(Math.min(e.rawProbability, 0.95))} = {formatCurrency(e.ceilingApplied && e.uncappedValue ? e.uncappedValue : e.expectedValue)}
                {e.ceilingApplied && e.ceiling ? `, limitado ao teto por oportunidade de ${formatCurrency(e.ceiling)}` : ''}
              </dd>
            </div>
            <div><dt>Faixa (±{pct(e.rangeSpread)})</dt><dd>{formatCurrency(e.rangeLow)} – {formatCurrency(e.rangeHigh)}</dd></div>
          </dl>
          <p className="suave mt-2 text-xs">
            Ticket médio, taxa de conversão, amostra mínima e teto vêm de Configurações › Financeiro. É uma estimativa, não uma venda confirmada.
          </p>
        </>
      ) : (
        <p className="suave mt-2 text-xs">
          {formatCurrency(shownValue)} foi calculado com um ticket médio ou uma taxa de conversão diferente dos atuais (Configurações › Financeiro), por isso o passo a passo não está disponível.
        </p>
      )}
    </details>
  )
}

export default function ConversationDetail() {
  const selectedConversationId = useAppStore((s) => s.selectedConversationId)
  const setView = useAppStore((s) => s.setView)
  const selectConversation = useAppStore((s) => s.selectConversation)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  // T4 · o atendente consulta a conversa e manda para a recuperação; corrigir a análise e confirmar venda é da gestão
  const role = useAppStore((s) => s.me?.role)
  const canManage = can(role, 'conversations.manage')
  const canRecover = can(role, 'recovery.manage')

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [agentOptions, setAgentOptions] = useState<{ id: string; name: string }[]>([])

  // Correction dialog (intent / urgency / agent)
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState<'intent' | 'urgency' | 'agent' | null>(null)
  const [correctionValue, setCorrectionValue] = useState('')
  const [correctionJustification, setCorrectionJustification] = useState('')

  // Outcome dialog (venda / perda / valor)
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState<'won' | 'lost' | null>(null)
  const [outcomeValue, setOutcomeValue] = useState('')

  useEffect(() => {
    fetch('/api/team').then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => setAgentOptions((d.agents || []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))))
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    if (!selectedConversationId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/conversations/${selectedConversationId}`)
      if (!res.ok) throw new Error('Erro ao carregar conversa')
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [selectedConversationId])

  useEffect(() => { fetchData() }, [fetchData, refreshTrigger])

  // 1ª carga (ou troca de conversa): esqueleto; recargas depois de uma ação mantêm a tela
  if (isLoading && (!data || data.id !== selectedConversationId)) {
    return (
      <div className="conversa" aria-busy="true">
        <div className="conversa__principal">
          <Skeleton className="h-6 w-24" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <Skeleton className="h-[420px] w-full rounded-[var(--raio)]" />
        </div>
        <div className="conversa__analise">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-[var(--raio)]" />)}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="cartao vazio flex flex-col items-center gap-4">
        <p className="vermelho font-medium">{error || 'Conversa não encontrada'}</p>
        <button type="button" onClick={() => setView('conversations')} className="btn btn--sm">Voltar</button>
      </div>
    )
  }

  // Derive data from API response
  const conversation = {
    id: data.id,
    customerName: data.contact?.displayName || 'Desconhecido',
    customerPhone: data.contact?.phoneLast4 ? `*****${data.contact.phoneLast4}` : '******',
    agentName: data.agent?.name || 'Sem agente',
    agentTeam: data.agent?.team || '',
    connectionName: data.connection?.name || '',
    operationalStatus: data.operationalStatus,
    inferredStage: data.inferredStage,
    primaryIntent: data.primaryIntent,
    urgency: data.urgency,
    sentiment: data.sentiment,
    score: data.score,
    potentialValue: data.potentialValue,
    confidence: data.confidence,
    waitingMinutes: data.waitingMinutes,
    tags: (data.tags || []) as string[],
    hasOpportunity: data.potentialValue > 0,
    lastActivity: data.lastActivity,
    openedAt: data.openedAt,
    closedAt: data.closedAt,
  }
  const messages: any[] = data.messages || []
  const findings: any[] = data.findings || []
  const opportunities: any[] = data.opportunities || []
  const openQuestions: any[] = data.openQuestions || []
  const promises: any[] = data.promises || []
  const conversationAlerts: any[] = data.alerts || []
  const scoreDetail = data.scoreDetail

  const handleOutcome = (outcome: 'won' | 'lost', value?: number) => {
    void mutate(`/api/conversations/${selectedConversationId}/outcome`, {
      method: 'POST',
      json: { outcome, value },
    }, { onSettled: fetchData })
  }

  const handleFeedback = (type: string, previousValue: string, correctedValue: string, justification: string) => {
    void mutate(`/api/conversations/${selectedConversationId}/feedback`, {
      method: 'POST',
      json: { type, previousValue, correctedValue, justification },
    }, { onSettled: fetchData })
  }

  const handleBack = () => {
    selectConversation(null)
    setView('conversations')
  }

  const markReviewed = () => {
    fetch(`/api/conversations/${selectedConversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markReviewed: true }),
    }).then((r) => {
      if (!r.ok) throw new Error()
      toast.success('Conversa marcada como revisada.')
      fetchData()
    }).catch(() => toast.error('Não foi possível marcar como revisada.'))
  }

  const sendToRecovery = () => {
    fetch('/api/recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, reason: 'Enviado manualmente para recuperação', customerName: conversation.customerName, originalAgentName: data.agent?.name, priorityScore: 0.5 }),
    }).then((r) => {
      if (!r.ok) throw new Error()
      toast.success('Conversa enviada para a fila de Recuperação.')
    }).catch(() => toast.error('Não foi possível enviar para a Recuperação.'))
  }

  const openCorrectionDialog = (kind: 'intent' | 'urgency' | 'agent') => {
    setCorrectionValue(kind === 'agent' ? (data.agent?.id || '') : kind === 'intent' ? conversation.primaryIntent : conversation.urgency)
    setCorrectionJustification('')
    setCorrectionDialogOpen(kind)
  }

  const confirmCorrection = () => {
    if (!correctionDialogOpen || !correctionValue) return
    const previousValue = correctionDialogOpen === 'agent' ? (data.agent?.id || '') : correctionDialogOpen === 'intent' ? conversation.primaryIntent : conversation.urgency
    handleFeedback(correctionDialogOpen, previousValue, correctionValue, correctionJustification)
    setCorrectionDialogOpen(null)
  }

  const confirmOutcome = () => {
    if (!outcomeDialogOpen) return
    const value = outcomeValue ? parseFloat(outcomeValue.replace(',', '.')) : undefined
    handleOutcome(outcomeDialogOpen, value)
    setOutcomeDialogOpen(null)
    setOutcomeValue('')
  }

  const markQuestionAnswered = (questionId: string) => {
    void mutate(`/api/open-questions/${questionId}`, {
      method: 'PATCH',
      json: { status: 'answered' },
    }, { onSettled: fetchData })
  }

  const setPromiseStatus = (promiseId: string, status: 'kept' | 'cancelled') => {
    void mutate(`/api/promises/${promiseId}`, {
      method: 'PATCH',
      json: { status },
    }, { onSettled: fetchData })
  }

  const markFindingFalsePositive = (findingId: string) => {
    void mutate(`/api/findings/${findingId}`, {
      method: 'PATCH',
      json: { falsePositive: true },
    }, { onSettled: fetchData })
  }

  // Composição da nota: só os componentes que o motor calculou de verdade
  const components = (scoreDetail?.components || {}) as Record<string, unknown>
  const scoreBreakdown = SCORE_COMPONENTS
    .filter((c) => typeof components[c.key] === 'number')
    .map((c) => ({ ...c, score: Math.round(components[c.key] as number) }))

  const primaryOpportunity = opportunities[0]
  const valueMemory = primaryOpportunity ? {
    ticketUsed: Math.round(primaryOpportunity.baseTicket),
    ticketSource: primaryOpportunity.ticketSource,
    probability: primaryOpportunity.probability,
    probabilitySource: primaryOpportunity.probabilitySource,
    range: [Math.round(primaryOpportunity.rangeLow), Math.round(primaryOpportunity.rangeHigh)],
    confidence: primaryOpportunity.confidence,
    lastUpdated: primaryOpportunity.updatedAt,
  } : null

  const pendingQuestions = openQuestions.filter((q) => q.status !== 'answered').length
  const tailMarkers = timelineMarkersBefore(messages.length, messages, promises, conversationAlerts)

  const scoreBlock = (
    <section className="cartao bloco">
      <header className="bloco__cab">
        <h3><BarChart3 className="ic verde-txt" aria-hidden="true" />Composição da nota ({conversation.score})</h3>
      </header>
      {scoreBreakdown.length > 0 ? (
        <ul className="composicao">
          {scoreBreakdown.map((item) => (
            <li key={item.key}>
              <span>{item.label} ({item.weight}%)</span>
              <b className={cn(item.score >= 80 && 'text-[color:var(--verde-700)]', item.score < 70 && 'text-[color:var(--vermelho)]')}>{item.score}</b>
              <div className={scoreBarClass(item.score)} aria-hidden="true">
                <i style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bloco__texto suave">A composição aparece depois que a análise calcular a nota desta conversa.</p>
      )}
    </section>
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="conversa">
        {/* Coluna da conversa */}
        <div className="conversa__principal">
          <button type="button" className="voltar" aria-label="Voltar para a lista de conversas" onClick={handleBack}>
            <ArrowLeft className="ic" aria-hidden="true" />
            Voltar
          </button>

          <header className="contato">
            <span className={cn('av av--lg', avatarTone(conversation.customerName))} aria-hidden="true">
              {initials(conversation.customerName)}
            </span>
            <div className="contato__info">
              <div className="linha-flex envolve">
                <h1>{conversation.customerName}</h1>
                <span className="mono suave contato__id">***{conversation.customerPhone.slice(-4)}</span>
              </div>
              <ul className="contato__meta">
                {conversation.connectionName && (
                  <li><Phone className="ic" aria-hidden="true" />{conversation.connectionName}</li>
                )}
                <li>
                  {data.agent?.name && (
                    <span className={cn('av av--sm', avatarTone(data.agent.name))} aria-hidden="true">{initials(data.agent.name)}</span>
                  )}
                  {!data.agent && data.suggestedAgent?.name ? (
                    <span className="suave" data-testid="agent-suggested" title="Sugestão pela identidade do WhatsApp; confirme em Equipe › Identidades do WhatsApp">
                      {data.suggestedAgent.name} · sugerido
                    </span>
                  ) : conversation.agentName}
                </li>
                {conversation.operationalStatus && (
                  <li>
                    <span className={cn('tag tag--lg', STATUS_TAG[conversation.operationalStatus] || 'tag--cinza')}>
                      {getStatusLabel(conversation.operationalStatus)}
                    </span>
                  </li>
                )}
                <li><Clock className="ic" aria-hidden="true" />{timeAgo(conversation.lastActivity)}</li>
                {conversation.potentialValue > 0 && (
                  <li className="verde-txt forte">
                    <DollarSign className="ic" aria-hidden="true" />
                    <span className="sr-only">Valor potencial: </span>
                    {formatCurrency(conversation.potentialValue)}
                  </li>
                )}
                <li>
                  <span className="sr-only">Nota: </span>
                  <b className={scoreTextClass(conversation.score)}>{conversation.score}</b>/100
                </li>
                <li>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="tag tag--laranja tag--contorno" tabIndex={0}>
                        <Lock className="ic" aria-hidden="true" />
                        Dados sensíveis
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Esta conversa contém dados pessoais sensíveis</TooltipContent>
                  </Tooltip>
                </li>
                {conversation.tags.map((t) => (
                  <li key={t}>
                    <span className="tag tag--cinza">
                      <Tag className="ic" aria-hidden="true" />
                      {t}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="contato__acoes">
              <PrivacyMenu conversationId={selectedConversationId as string} onDone={handleBack} />
              {(canRecover || canManage) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="reticencias" aria-label="Mais opções">
                    <MoreVertical className="ic" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canRecover && (
                  <DropdownMenuItem onClick={sendToRecovery}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Enviar para recuperação
                  </DropdownMenuItem>
                  )}
                  {canManage && (
                  <DropdownMenuItem onClick={markReviewed}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Marcar como revisada
                  </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </div>
          </header>

          <section className="cartao chat" aria-label="Mensagens">
            <div className="chat__mensagens" tabIndex={0} role="region" aria-label="Histórico de mensagens">
              {messages.length === 0 && (
                <div className="vazio">
                  <strong>Nenhuma mensagem nesta conversa.</strong>
                </div>
              )}
              {messages.map((msg, idx) => {
                const isOutbound = msg.direction === 'outbound'
                const markers = timelineMarkersBefore(idx, messages, promises, conversationAlerts)
                const day = formatMsgDay(msg.occurredAt)
                const newDay = idx === 0 || formatMsgDay(messages[idx - 1].occurredAt) !== day
                const who = isOutbound ? 'Empresa' : 'Cliente'

                return (
                  <div key={msg.id} className="contents">
                    {newDay && <span className="chat__data">{day}</span>}
                    {markers.length > 0 && <MarkerLine markers={markers} />}
                    <div className={cn('msg', isOutbound ? 'msg--empresa' : 'msg--cliente')}>
                      {!isOutbound && <span className="msg__av" aria-hidden="true">C</span>}
                      <div className="msg__balao">
                        <p className="msg__cab">
                          <b>{who}</b>
                          <time dateTime={msg.occurredAt}>{formatMsgTime(msg.occurredAt)}</time>
                        </p>
                        <p>{msg.text}</p>
                      </div>
                      {isOutbound && <span className="msg__av" aria-hidden="true">E</span>}
                    </div>
                  </div>
                )
              })}
              {tailMarkers.length > 0 && <MarkerLine markers={tailMarkers} />}
            </div>
            <p className="chat__aviso">
              <Info className="ic" aria-hidden="true" />
              As mensagens são exibidas apenas para consulta e análise.
            </p>
          </section>
        </div>

        {/* Coluna da análise */}
        <aside className="conversa__analise" aria-label="Análise da conversa">
          {/* Classificação */}
          <section className="cartao bloco">
            <header className="bloco__cab">
              <h2><Target className="ic verde-txt" aria-hidden="true" />Classificação</h2>
            </header>
            <div className="classificacao">
              <div>
                <span>Intenção principal</span>
                <span className={cn('tag tag--lg', INTENT_TAG[conversation.primaryIntent] || 'tag--cinza')}>
                  {conversation.primaryIntent ? getIntentLabel(conversation.primaryIntent) : '-'}
                </span>
              </div>
              <div>
                <span>Urgência</span>
                <span className={cn('tag tag--lg', URGENCY_TAG[conversation.urgency] || 'tag--cinza')}>
                  {conversation.urgency ? getUrgencyLabel(conversation.urgency) : '-'}
                </span>
              </div>
              <div>
                <span>Sentimento</span>
                <span className={cn('tag tag--lg', SENTIMENT_TAG[conversation.sentiment] || 'tag--cinza')}>
                  {conversation.sentiment ? getSentimentLabel(conversation.sentiment) : '-'}
                </span>
              </div>
              <div>
                <span>Etapa inferida</span>
                <span className={cn('tag tag--lg', STAGE_TAG[conversation.inferredStage] || 'tag--cinza')}>
                  {conversation.inferredStage ? getStageLabel(conversation.inferredStage) : '-'}
                </span>
              </div>
            </div>
          </section>

          {/* Perguntas em aberto */}
          <section className="cartao bloco">
            <header className="bloco__cab">
              <h2><HelpCircle className="ic text-[color:var(--azul)]" aria-hidden="true" />Perguntas em aberto</h2>
              {pendingQuestions > 0 && (
                <span className="tag tag--cinza tag--contorno">
                  {pendingQuestions} pendente{pendingQuestions !== 1 ? 's' : ''}
                </span>
              )}
            </header>
            {openQuestions.length > 0 ? (
              <ul className="perguntas">
                {openQuestions.map((q) => {
                  const answered = q.status === 'answered'
                  return (
                    <li key={q.id}>
                      {answered ? (
                        <CheckCircle2 className="ic verde-txt shrink-0 text-[16px]" aria-hidden="true" />
                      ) : (
                        <span className="circulo-vazio shrink-0" aria-hidden="true" />
                      )}
                      <span className={cn('min-w-0 flex-1', answered && 'suave line-through')}>
                        {q.normalizedQuestion || q.text}
                      </span>
                      {!answered && canManage && (
                        <button
                          type="button"
                          className="reticencias"
                          aria-label="Marcar como respondida"
                          title="Marcar como respondida"
                          onClick={() => markQuestionAnswered(q.id)}
                        >
                          <CheckCircle2 className="ic" aria-hidden="true" />
                        </button>
                      )}
                      <span className={cn('tag shrink-0', answered ? 'tag--verde' : 'tag--cinza')}>
                        {answered ? 'Respondida' : 'Pendente'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="bloco__texto suave">Nenhuma pergunta em aberto.</p>
            )}
          </section>

          {/* Promessas */}
          <section className="cartao bloco">
            <header className="bloco__cab">
              <h2><Handshake className="ic laranja-txt" aria-hidden="true" />Promessas</h2>
            </header>
            {promises.length > 0 ? (
              <ul className="perguntas">
                {promises.map((p) => {
                  const isKept = p.status === 'kept'
                  const isCancelled = p.status === 'cancelled'
                  const isOverdue = !isKept && !isCancelled && p.dueAt && new Date(p.dueAt) < new Date()
                  return (
                    <li key={p.id} className="!items-start">
                      {isKept ? (
                        <CheckCircle2 className="ic verde-txt mt-0.5 shrink-0 text-[16px]" aria-hidden="true" />
                      ) : isCancelled ? (
                        <XCircle className="ic suave mt-0.5 shrink-0 text-[16px]" aria-hidden="true" />
                      ) : isOverdue ? (
                        <AlertTriangle className="ic vermelho mt-0.5 shrink-0 text-[16px]" aria-hidden="true" />
                      ) : (
                        <Clock className="ic laranja-txt mt-0.5 shrink-0 text-[16px]" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className={cn((isKept || isCancelled) && 'suave')}>{p.action || p.text}</span>
                        {p.dueAt && (
                          <span className="suave mt-0.5 flex items-center gap-1 text-xs">
                            <CalendarClock className="ic" aria-hidden="true" />
                            Prazo: {new Date(p.dueAt).toLocaleDateString('pt-BR')} {new Date(p.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      {!isKept && !isCancelled && canManage && (
                        <div className="flex shrink-0 items-center">
                          <button type="button" className="reticencias" aria-label="Confirmar cumprida" title="Confirmar cumprida" onClick={() => setPromiseStatus(p.id, 'kept')}>
                            <CheckCircle2 className="ic verde-txt" aria-hidden="true" />
                          </button>
                          <button type="button" className="reticencias" aria-label="Cancelar promessa" title="Cancelar promessa" onClick={() => setPromiseStatus(p.id, 'cancelled')}>
                            <XCircle className="ic" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                      <span className={cn('tag shrink-0', isKept ? 'tag--verde' : isOverdue ? 'tag--vermelho' : 'tag--cinza')}>
                        {isKept ? 'Cumprida' : isCancelled ? 'Cancelada' : isOverdue ? 'Vencida' : 'Pendente'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="bloco__texto suave">Nenhuma promessa registrada.</p>
            )}
          </section>

          {/* Falhas encontradas */}
          <section className="cartao bloco">
            <header className="bloco__cab">
              <h2><FileWarning className="ic vermelho" aria-hidden="true" />Falhas encontradas</h2>
            </header>
            {findings.length > 0 ? (
              <div className="grid gap-3">
                {findings.map((f) => (
                  <div key={f.id} className="falha flex-wrap">
                    <span className={cn('tag tag--lg', SEVERITY_TAG[f.severity] || 'tag--cinza')}>
                      {SEVERITY_LABEL[f.severity] || 'Baixa'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong>{f.type}</strong>
                      {f.evidence && <small>{f.evidence}</small>}
                    </div>
                    {f.falsePositive ? (
                      <span className="tag tag--cinza">Falso positivo</span>
                    ) : canManage && (
                      <button type="button" className="btn btn--sm" onClick={() => markFindingFalsePositive(f.id)}>
                        <Ban className="ic" aria-hidden="true" />
                        Falso positivo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="bloco__texto suave">Nenhuma falha detectada.</p>
            )}
          </section>

          {/* Composição da nota + cálculo do valor potencial */}
          {valueMemory ? (
            <div className="grade grade-2 conversa__duas">
              {scoreBlock}
              <section className="cartao bloco">
                <header className="bloco__cab">
                  <h3><Calculator className="ic verde-txt" aria-hidden="true" />Cálculo do valor potencial</h3>
                </header>
                <dl className="calculo">
                  <div><dt>Ticket usado</dt><dd className="forte">{formatCurrency(valueMemory.ticketUsed)}</dd></div>
                  <div><dt>Fonte do ticket</dt><dd className="suave">{ticketSourceLabel(valueMemory.ticketSource)}</dd></div>
                  <div><dt>Probabilidade</dt><dd className="forte">{(valueMemory.probability * 100).toFixed(0)}%</dd></div>
                  <div><dt>Fonte prob.</dt><dd className="suave">{valueMemory.probabilitySource}</dd></div>
                  <div><dt>Faixa</dt><dd className="forte">{formatCurrency(valueMemory.range[0])} – {formatCurrency(valueMemory.range[1])}</dd></div>
                  <div><dt>Confiança</dt><dd className="forte">{(valueMemory.confidence * 100).toFixed(0)}%</dd></div>
                  <div><dt>Atualizado</dt><dd className="suave">{timeAgo(valueMemory.lastUpdated)}</dd></div>
                </dl>
                {conversation.potentialValue > 0 && <ValueExplanation explanation={data.valueExplanation} shownValue={conversation.potentialValue} />}
              </section>
            </div>
          ) : (
            scoreBlock
          )}

          {/* Ações de correção */}
          {canManage && (
          <section className="cartao bloco">
            <header className="bloco__cab">
              <div>
                <h3><RefreshCw className="ic verde-txt" aria-hidden="true" />Ações de correção</h3>
                <p className="suave bloco__sub">Ajuste as classificações ou registre ações do gestor.</p>
              </div>
            </header>
            <div className="acoes-correcao">
              <button type="button" className="btn btn--sm" onClick={() => openCorrectionDialog('intent')}>
                <ArrowRightLeft className="ic" aria-hidden="true" />
                Alterar intenção
              </button>
              <button type="button" className="btn btn--sm" onClick={() => openCorrectionDialog('urgency')}>
                <Flame className="ic" aria-hidden="true" />
                Alterar urgência
              </button>
              <button type="button" className="btn btn--sm" onClick={() => openCorrectionDialog('agent')}>
                <UserCog className="ic" aria-hidden="true" />
                Mudar responsável
              </button>
              <button
                type="button"
                className="btn btn--sm btn--verde-claro"
                onClick={() => { setOutcomeValue(primaryOpportunity ? String(Math.round(primaryOpportunity.expectedValue)) : ''); setOutcomeDialogOpen('won') }}
              >
                <Award className="ic" aria-hidden="true" />
                Confirmar venda
              </button>
              <button
                type="button"
                className="btn btn--sm btn--perigo"
                onClick={() => { setOutcomeValue(''); setOutcomeDialogOpen('lost') }}
              >
                <HeartCrack className="ic" aria-hidden="true" />
                Confirmar perda
              </button>
            </div>
          </section>
          )}
        </aside>
      </div>

      {/* Correction dialog: intent / urgency / agent */}
      <Dialog open={!!correctionDialogOpen} onOpenChange={(open) => !open && setCorrectionDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {correctionDialogOpen === 'intent' ? 'Alterar intenção' : correctionDialogOpen === 'urgency' ? 'Alterar urgência' : 'Mudar responsável'}
            </DialogTitle>
            <DialogDescription>Registre a correção e, se quiser, uma justificativa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={correctionValue} onValueChange={setCorrectionValue}>
              <SelectTrigger aria-label="Selecione..."><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {correctionDialogOpen === 'intent' && INTENT_OPTIONS.map((v) => (
                  <SelectItem key={v} value={v}>{getIntentLabel(v)}</SelectItem>
                ))}
                {correctionDialogOpen === 'urgency' && URGENCY_OPTIONS.map((v) => (
                  <SelectItem key={v} value={v}>{getUrgencyLabel(v)}</SelectItem>
                ))}
                {correctionDialogOpen === 'agent' && agentOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              aria-label="Justificativa (opcional)"
              placeholder="Justificativa (opcional)"
              value={correctionJustification}
              onChange={(e) => setCorrectionJustification(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionDialogOpen(null)}>Cancelar</Button>
            <Button onClick={confirmCorrection} disabled={!correctionValue}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outcome dialog: venda / perda */}
      <Dialog open={!!outcomeDialogOpen} onOpenChange={(open) => !open && setOutcomeDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{outcomeDialogOpen === 'won' ? 'Confirmar venda' : 'Confirmar perda'}</DialogTitle>
            <DialogDescription>
              {outcomeDialogOpen === 'won' ? 'Informe o valor real da venda confirmada.' : 'Esta conversa será marcada como perdida.'}
            </DialogDescription>
          </DialogHeader>
          {outcomeDialogOpen === 'won' && (
            <div className="py-4">
              <Label htmlFor="cd-valor-venda">Valor da venda (R$)</Label>
              <Input
                id="cd-valor-venda"
                type="text"
                placeholder="0,00"
                value={outcomeValue}
                onChange={(e) => setOutcomeValue(e.target.value)}
                className="mt-1.5"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutcomeDialogOpen(null)}>Cancelar</Button>
            <Button onClick={confirmOutcome} disabled={outcomeDialogOpen === 'won' && !outcomeValue}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
