'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import {
  TriangleAlert,
  CircleAlert,
  OctagonAlert,
  Info,
  Clock,
  UserPlus,
  User,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
  Filter,
  Plus,
  Search,
  MessageSquare,
  MessageSquareMore,
  DollarSign,
  ChartNoAxesColumn,
  FileText,
  Shield,
  Zap,
  ChevronDown,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

import { formatCurrency, timeAgo, cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { mutate } from '@/lib/mutation'

// ── Severity helpers ──────────────────────────────────────────────

const severityLabels: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Atenção',
  low: 'Informativo',
  info: 'Informativo',
}

const severityFilterMap: Record<string, string> = {
  todas: 'all',
  informativo: 'low',
  atencao: 'medium',
  alto: 'high',
  critico: 'critical',
}

/** Classes de tag do pacote por severidade. */
function severityTagClass(severity: string): string {
  switch (severity) {
    case 'critical': return 'tag--vermelho'
    case 'high': return 'tag--vermelho tag--contorno'
    case 'medium': return 'tag--laranja tag--contorno'
    default: return 'tag--azul'
  }
}

/** Ícone + tom do quadrado à esquerda do alerta (por tipo; senão, por severidade). */
function alertVisual(type: string, severity: string): { icon: ReactNode; tone: string } {
  switch (type) {
    case 'ignored_question':
      return { icon: <MessageSquareMore className="ic" aria-hidden="true" />, tone: 'tom-laranja' }
    case 'overdue_promise':
    case 'promise_overdue':
      return { icon: <TriangleAlert className="ic" aria-hidden="true" />, tone: 'tom-vermelho' }
    case 'promise_approaching':
    case 'slow_response':
      return { icon: <Clock className="ic" aria-hidden="true" />, tone: 'tom-ambar' }
    case 'no_response':
    case 'no_response_followup':
    case 'high_intent_no_reply':
      return { icon: <MessageSquare className="ic" aria-hidden="true" />, tone: 'tom-laranja' }
    case 'pending_quote':
      return { icon: <DollarSign className="ic" aria-hidden="true" />, tone: 'tom-ambar' }
  }
  switch (severity) {
    case 'critical': return { icon: <OctagonAlert className="ic" aria-hidden="true" />, tone: 'tom-vermelho' }
    case 'high': return { icon: <TriangleAlert className="ic" aria-hidden="true" />, tone: 'tom-vermelho' }
    case 'medium': return { icon: <CircleAlert className="ic" aria-hidden="true" />, tone: 'tom-laranja' }
    default: return { icon: <Info className="ic" aria-hidden="true" />, tone: 'tom-azul' }
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Resolve / Ignore reasons ──────────────────────────────────────

const resolveReasons = [
  { value: 'cliente_respondido', label: 'Cliente respondido' },
  { value: 'orcamento_enviado', label: 'Orçamento enviado' },
  { value: 'promessa_cumprida', label: 'Promessa cumprida' },
  { value: 'venda_concluida', label: 'Venda concluída' },
  { value: 'oportunidade_perdida', label: 'Oportunidade perdida' },
  { value: 'nao_era_oportunidade', label: 'Não era oportunidade' },
  { value: 'duplicado', label: 'Duplicado' },
  { value: 'outro', label: 'Outro' },
]

const ignoreReasons = [
  { value: 'falso_positivo', label: 'Falso positivo' },
  { value: 'ja_tratado', label: 'Já tratado em outro canal' },
  { value: 'testes', label: 'Conversa de testes' },
  { value: 'spam', label: 'Spam' },
  { value: 'baixa_relevancia', label: 'Baixa relevância' },
  { value: 'outro', label: 'Outro' },
]

const alertTypeLabels: Record<string, string> = {
  no_response: 'Sem resposta',
  slow_response: 'Resposta lenta',
  ignored_question: 'Pergunta ignorada',
  pending_quote: 'Orçamento pendente',
  overdue_promise: 'Promessa vencida',
  abandoned_lead: 'Lead abandonado',
  customer_frustrated: 'Cliente frustrado',
  quota_warning: 'Quota próxima do limite',
  no_response_followup: 'Sem resposta (follow-up)',
  high_intent_no_reply: 'Alta intenção sem resposta',
  promise_approaching: 'Promessa próxima vencimento',
  promise_overdue: 'Promessa vencida',
  connection_down: 'Conexão desconectada',
}

const channelLabels: Record<string, string> = {
  in_app: 'In-app',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  webhook: 'Webhook',
}

const statusLabels: Record<string, string> = {
  acknowledged: 'Reconhecido',
  in_progress: 'Em acompanhamento',
  resolved: 'Resolvido',
  dismissed: 'Ignorado',
  false_positive: 'Falso positivo',
}

type TabKey = 'ativos' | 'acompanhamento' | 'resolvidos' | 'ignorados' | 'regras'

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: 'ativos', label: 'Ativos', icon: <Zap className="ic" aria-hidden="true" /> },
  { key: 'acompanhamento', label: 'Em acompanhamento', icon: <RefreshCw className="ic" aria-hidden="true" /> },
  { key: 'resolvidos', label: 'Resolvidos', icon: <CheckCircle2 className="ic" aria-hidden="true" /> },
  { key: 'ignorados', label: 'Ignorados', icon: <XCircle className="ic" aria-hidden="true" /> },
  { key: 'regras', label: 'Regras', icon: <Shield className="ic" aria-hidden="true" /> },
]

// ── Main Component ────────────────────────────────────────────────

interface AlertItem {
  id: string; conversationId: string; ruleName: string; severity: string
  title: string; description: string; customerName: string; agentName: string
  status: string; potentialValue?: number; confidence?: number; createdAt: string
  evidence: string | undefined
}

interface AlertRuleItem {
  id: string; name: string; type: string; active: boolean; severity: string
  channels: string[]; cooldownMinutes: number; limitMinutes: number | null
}

export default function AlertsView() {
  const selectConversation = useAppStore((s) => s.selectConversation)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('ativos')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Filter state
  const [filterSeverity, setFilterSeverity] = useState('todas')
  const [filterType, setFilterType] = useState('all')
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterHasValue, setFilterHasValue] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterConfidenceMin, setFilterConfidenceMin] = useState('')

  // Dialog state
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [resolveReason, setResolveReason] = useState('')
  const [ignoreReason, setIgnoreReason] = useState('')
  const [assignAgentId, setAssignAgentId] = useState('')

  // API state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alertsData, setAlertsData] = useState<AlertItem[]>([])
  const [rulesData, setRulesData] = useState<AlertRuleItem[]>([])
  const [apiCounts, setApiCounts] = useState<Record<string, number>>({})
  const [agents, setAgents] = useState<{id: string; name: string; team: string}[]>([])

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const statusParam = activeTab === 'ativos' ? 'new' : activeTab === 'acompanhamento' ? 'in_progress' : activeTab === 'resolvidos' ? 'resolved' : activeTab === 'ignorados' ? 'dismissed' : undefined
      const params = new URLSearchParams()
      if (statusParam) params.set('status', statusParam)
      if (filterSeverity !== 'todas') params.set('severity', severityFilterMap[filterSeverity] || '')
      if (filterType !== 'all') params.set('type', filterType)
      if (filterAgent !== 'all') params.set('agentId', filterAgent)
      if (filterTeam !== 'all') params.set('team', filterTeam)
      params.set('limit', '100')

      const [alertsRes, rulesRes, agentsRes] = await Promise.all([
        fetch(`/api/alerts?${params.toString()}`),
        fetch('/api/alert-rules'),
        fetch('/api/team'),
      ])

      if (!alertsRes.ok) throw new Error('Erro ao carregar alertas')
      const alertsJson = await alertsRes.json()
      const items: AlertItem[] = (alertsJson.alerts || []).map((a: Record<string, unknown>) => ({
        ...a,
        evidence: a.evidence || 'Detectado automaticamente pelas regras de atendimento.',
      }))
      setAlertsData(items)
      setApiCounts(alertsJson.counts || {})

      if (rulesRes.ok) {
        const rulesJson = await rulesRes.json()
        setRulesData(rulesJson.rules || [])
      }

      if (agentsRes.ok) {
        const agentsJson = await agentsRes.json()
        setAgents((agentsJson.agents || []).map((a: {id: string; name: string; team: string}) => a))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, filterSeverity, filterType, filterAgent, filterTeam])

  useEffect(() => { fetchAlerts() }, [fetchAlerts, refreshTrigger])

  // Unique alert types from data
  const alertTypes = useMemo(
    () => [...new Set(alertsData.map((a) => a.ruleName))],
    [alertsData]
  )

  // Rules toggle state
  const ruleToggles = useMemo(() =>
    Object.fromEntries(rulesData.map((r) => [r.id, r.active])),
    [rulesData]
  )

  const toggleRuleActive = (ruleId: string, checked: boolean) => {
    setRulesData((prev) => prev.map((r) => (r.id === ruleId ? { ...r, active: checked } : r)))
    fetch(`/api/alert-rules/${ruleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: checked }),
    }).catch(() => {
      setRulesData((prev) => prev.map((r) => (r.id === ruleId ? { ...r, active: !checked } : r)))
    })
  }

  // New rule dialog state
  const [newRuleOpen, setNewRuleOpen] = useState(false)
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleType, setNewRuleType] = useState('')
  const [newRuleSeverity, setNewRuleSeverity] = useState('medium')
  const [newRuleCooldown, setNewRuleCooldown] = useState('30')
  const [creatingRule, setCreatingRule] = useState(false)

  const handleCreateRule = async () => {
    if (!newRuleName.trim() || !newRuleType) return
    setCreatingRule(true)
    try {
      const res = await fetch('/api/alert-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRuleName,
          type: newRuleType,
          severity: newRuleSeverity,
          cooldownMinutes: parseInt(newRuleCooldown, 10) || 30,
          channels: ['in_app'],
        }),
      })
      if (!res.ok) throw new Error()
      setNewRuleName('')
      setNewRuleType('')
      setNewRuleSeverity('medium')
      setNewRuleCooldown('30')
      setNewRuleOpen(false)
      fetchAlerts()
    } catch {
      // keep dialog open with entered values so the user can retry
    } finally {
      setCreatingRule(false)
    }
  }

  // Equipes distintas, a partir dos atendentes carregados de /api/team
  const teams = useMemo(
    () => [...new Set(agents.map((a) => a.team).filter(Boolean))].sort(),
    [agents]
  )

  // Filtered alerts (client-side from already-tab-filtered API data)
  const filteredAlerts = useMemo(() => {
    let result = [...alertsData]

    // Has value filter
    if (filterHasValue === 'com') {
      result = result.filter((a) => a.potentialValue && a.potentialValue > 0)
    } else if (filterHasValue === 'sem') {
      result = result.filter((a) => !a.potentialValue || a.potentialValue === 0)
    }

    // Confidence filter
    if (filterConfidenceMin) {
      const min = parseFloat(filterConfidenceMin) / 100
      if (!isNaN(min)) {
        result = result.filter((a) => (a.confidence ?? 0) >= min)
      }
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.customerName.toLowerCase().includes(q) ||
          a.agentName.toLowerCase().includes(q) ||
          (a.evidence || '').toLowerCase().includes(q)
      )
    }

    // Sort: critical first, then by createdAt desc
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    result.sort((a, b) => {
      const so = (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
      if (so !== 0) return so
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return result
  }, [alertsData, filterHasValue, filterConfidenceMin, searchQuery])

  // Tab counts from API
  const tabCounts = useMemo<Record<string, number>>(() => ({
    ativos: (apiCounts.new || 0) + (apiCounts.acknowledged || 0),
    acompanhamento: apiCounts.in_progress || 0,
    resolvidos: apiCounts.resolved || 0,
    ignorados: (apiCounts.dismissed || 0) + (apiCounts.false_positive || 0),
  }), [apiCounts])

  const hasActiveFilters =
    filterSeverity !== 'todas' || filterType !== 'all' || filterAgent !== 'all' ||
    filterTeam !== 'all' || filterHasValue !== 'all' || searchQuery !== '' || filterConfidenceMin !== ''

  function clearFilters() {
    setFilterSeverity('todas')
    setFilterType('all')
    setFilterAgent('all')
    setFilterTeam('all')
    setFilterHasValue('all')
    setSearchQuery('')
    setFilterConfidenceMin('')
  }

  // Abas com setas (padrão WAI-ARIA tabs, ativação automática)
  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    const key = TABS[next].key
    setActiveTab(key)
    tabRefs.current[key]?.focus()
  }

  // Actions
  function handleOpenConversation(conversationId: string) {
    selectConversation(conversationId)
  }

  function confirmResolve() {
    if (selectedAlertId && resolveReason) {
      void mutate(`/api/alerts/${selectedAlertId}/resolve`, {
        method: 'POST',
        json: { reason: resolveReason },
      }, { onSettled: fetchAlerts })
      setResolveDialogOpen(false)
      setSelectedAlertId(null)
      setResolveReason('')
    }
  }

  function confirmIgnore() {
    if (selectedAlertId && ignoreReason) {
      void mutate(`/api/alerts/${selectedAlertId}/dismiss`, {
        method: 'POST',
        json: { reason: ignoreReason },
      }, { onSettled: fetchAlerts })
      setIgnoreDialogOpen(false)
      setSelectedAlertId(null)
      setIgnoreReason('')
    }
  }

  function handleAssign(alertId: string) {
    setSelectedAlertId(alertId)
    setAssignAgentId('')
    setAssignDialogOpen(true)
  }

  function confirmAssign() {
    if (selectedAlertId && assignAgentId) {
      void mutate(`/api/alerts/${selectedAlertId}`, {
        method: 'PUT',
        json: { assignedTo: assignAgentId },
      }, { onSettled: fetchAlerts })
    }
    setAssignDialogOpen(false)
    setSelectedAlertId(null)
    setAssignAgentId('')
  }

  function handleFollowUp(alertId: string) {
    void mutate(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' }, { onSettled: fetchAlerts })
  }

  function handleFalsePositive(alertId: string) {
    void mutate(`/api/alerts/${alertId}/false-positive`, { method: 'POST' }, { onSettled: fetchAlerts })
  }

  function handleCreateRecovery(alertId: string) {
    void mutate(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' }, { onSettled: fetchAlerts })
  }

  function handleResolveWithReason(alertId: string, reason: string) {
    void mutate(`/api/alerts/${alertId}/resolve`, {
      method: 'POST',
      json: { reason },
    }, { onSettled: fetchAlerts })
  }

  function handleDismissWithReason(alertId: string, reason: string) {
    void mutate(`/api/alerts/${alertId}/dismiss`, {
      method: 'POST',
      json: { reason },
    }, { onSettled: fetchAlerts })
  }

  function maskCustomerName(name: string): string {
    const parts = name.split(' ')
    if (parts.length === 1) return name.charAt(0) + '***'
    return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '***'
  }

  // ── Render: cartão de alerta ──
  function renderAlert(alert: AlertItem) {
    const status = alert.status
    const isInactive = status === 'resolved' || status === 'dismissed' || status === 'false_positive'
    const typeLabel = alertTypeLabels[alert.ruleName]
    const hasValue = !!alert.potentialValue && alert.potentialValue > 0

    if (isInactive) {
      const tone = status === 'resolved' ? 'tom-verde' : 'tom-cinza'
      return (
        <article key={alert.id} className="cartao alerta alerta--compacto">
          <span className={cn('alerta__icone', tone)}>
            {status === 'resolved'
              ? <CheckCircle2 className="ic" aria-hidden="true" />
              : <XCircle className="ic" aria-hidden="true" />}
          </span>
          <div className="alerta__corpo">
            <header className="alerta__cab">
              <span className={cn('tag', status === 'resolved' ? 'tag--verde' : 'tag--cinza')}>
                {statusLabels[status] || status}
              </span>
              <h2>{alert.title}</h2>
              <span className="alerta__quando">
                <Clock className="ic" aria-hidden="true" />
                {timeAgo(alert.createdAt)}
              </span>
            </header>
            <p className="alerta__desc">
              {maskCustomerName(alert.customerName)} · {alert.agentName}
              {hasValue && <> · {formatCurrency(alert.potentialValue!)}</>}
              {' · '}{severityLabels[alert.severity] || alert.severity}
              {' · '}{Math.round((alert.confidence ?? 0) * 100)}% confiança
            </p>
            {alert.evidence && <p className="alerta__desc">{alert.evidence}</p>}
          </div>
        </article>
      )
    }

    const visual = alertVisual(alert.ruleName, alert.severity)

    return (
      <article key={alert.id} className="cartao alerta">
        <span className={cn('alerta__icone', visual.tone)}>{visual.icon}</span>
        <div className="alerta__corpo min-w-0">
          <header className="alerta__cab">
            <span className={cn('tag', severityTagClass(alert.severity))}>
              {severityLabels[alert.severity] || alert.severity}
            </span>
            <h2>{alert.title}</h2>
            {status !== 'new' && statusLabels[status] && (
              <span className="tag tag--cinza">{statusLabels[status]}</span>
            )}
            <span className="alerta__quando">
              <Clock className="ic" aria-hidden="true" />
              {timeAgo(alert.createdAt)}
            </span>
          </header>
          {(alert.description || typeLabel) && (
            <p className="alerta__desc">{alert.description || typeLabel}</p>
          )}
          <div className="alerta__dados">
            <div>
              <span className="dado-ic tom-cinza"><User className="ic" aria-hidden="true" /></span>
              <div><span className="block text-[12.5px] text-[var(--suave)]">Cliente</span><span className="block text-[14.5px] font-medium">{maskCustomerName(alert.customerName)}</span></div>
            </div>
            <div>
              <span className="av av--verde" aria-hidden="true">{initials(alert.agentName)}</span>
              <div><span className="block text-[12.5px] text-[var(--suave)]">Atendente</span><span className="block text-[14.5px] font-medium">{alert.agentName}</span></div>
            </div>
            {hasValue && (
              <div>
                <span className="dado-ic tom-verde"><DollarSign className="ic" aria-hidden="true" /></span>
                <div><span className="block text-[12.5px] text-[var(--suave)]">Valor potencial</span><span className="block text-[14.5px] font-medium verde-txt">{formatCurrency(alert.potentialValue!)}</span></div>
              </div>
            )}
            <div>
              <span className="dado-ic verde-txt"><ChartNoAxesColumn className="ic" aria-hidden="true" /></span>
              <div><span className="block text-[12.5px] text-[var(--suave)]">Confiança</span><span className="block text-[14.5px] font-medium">{Math.round((alert.confidence ?? 0) * 100)}%</span></div>
            </div>
          </div>
          {alert.evidence && (
            <p className="alerta__nota">
              <FileText className="ic" aria-hidden="true" />
              {alert.evidence}
            </p>
          )}
          <div className="alerta__acoes">
            <button type="button" className="btn btn--escuro" onClick={() => handleOpenConversation(alert.conversationId)}>
              <MessageSquare className="ic" aria-hidden="true" />
              Abrir conversa
            </button>
            <button type="button" className="btn" onClick={() => handleAssign(alert.id)}>
              <UserPlus className="ic" aria-hidden="true" />
              Atribuir
            </button>
            <button type="button" className="btn" onClick={() => handleFollowUp(alert.id)}>
              <RefreshCw className="ic" aria-hidden="true" />
              Acompanhar
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="btn">
                  <CheckCircle2 className="ic" aria-hidden="true" />
                  Resolver
                  <ChevronDown className="ic" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Motivo da resolução</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {resolveReasons.map((r) => (
                  <DropdownMenuItem key={r.value} onClick={() => handleResolveWithReason(alert.id, r.value)}>
                    {r.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="btn">
                  <XCircle className="ic" aria-hidden="true" />
                  Ignorar
                  <ChevronDown className="ic" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Motivo do descarte</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ignoreReasons.map((r) => (
                  <DropdownMenuItem key={r.value} onClick={() => handleDismissWithReason(alert.id, r.value)}>
                    {r.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" className="btn" onClick={() => handleFalsePositive(alert.id)}>
              <Ban className="ic" aria-hidden="true" />
              Falso positivo
            </button>
            <button type="button" className="btn btn--link" onClick={() => handleCreateRecovery(alert.id)}>
              <RotateCcw className="ic" aria-hidden="true" />
              Recuperação
            </button>
          </div>
        </div>
      </article>
    )
  }

  // ── Render: lista de alertas (abas de status) ──
  function renderAlertList() {
    if (isLoading) {
      return (
        <div className="lista-alertas" role="status" aria-busy="true" aria-label="Carregando alertas">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-[var(--raio)]" />)}
        </div>
      )
    }
    if (error) {
      return (
        <div className="cartao vazio" role="alert">
          <TriangleAlert className="ic" aria-hidden="true" />
          <strong>{error}</strong>
          <button type="button" className="btn btn--sm mt-3" onClick={fetchAlerts}>
            <RefreshCw className="ic" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      )
    }
    if (filteredAlerts.length === 0) {
      return (
        <div className="cartao vazio">
          <CheckCircle2 className="ic" aria-hidden="true" />
          <strong>Nenhum alerta encontrado</strong>
          Ajuste os filtros ou aguarde novos alertas.
        </div>
      )
    }
    return (
      <>
        {filteredAlerts.map((alert) => renderAlert(alert))}
        <p className="lista-alertas__total suave" aria-live="polite">
          {filteredAlerts.length} alerta{filteredAlerts.length !== 1 ? 's' : ''} encontrado{filteredAlerts.length !== 1 ? 's' : ''}
        </p>
      </>
    )
  }

  // ── Render: aba Regras ──
  function renderRules() {
    return (
      <div className="cartao">
        <div className="cartao__cab flex-wrap">
          <div>
            <h2><Shield className="ic verde-txt" aria-hidden="true" />Regras de Alerta</h2>
            <p>Configure quando e como os alertas são gerados.</p>
          </div>
          <button
            type="button"
            data-tour="alerts-new-rule"
            className="btn btn--primario btn--sm"
            onClick={() => setNewRuleOpen(true)}
          >
            <Plus className="ic" aria-hidden="true" />
            Nova regra
          </button>
        </div>
        <div className="cartao__corpo">
          {isLoading && rulesData.length === 0 ? (
            <div className="grid gap-2" role="status" aria-busy="true" aria-label="Carregando regras">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : rulesData.length === 0 ? (
            <div className="vazio">
              <Shield className="ic" aria-hidden="true" />
              <strong>Nenhuma regra cadastrada</strong>
              Use “Nova regra” para definir quando um alerta deve ser gerado.
            </div>
          ) : (
            <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Regras de alerta">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">Regra</th>
                    <th scope="col" className="hidden sm:table-cell">Tipo</th>
                    <th scope="col">Severidade</th>
                    <th scope="col" className="hidden md:table-cell">Cooldown</th>
                    <th scope="col" className="hidden lg:table-cell">Canais</th>
                    <th scope="col" className="centro">Ativa</th>
                  </tr>
                </thead>
                <tbody>
                  {rulesData.map((rule) => (
                    <tr key={rule.id}>
                      <td><strong>{rule.name}</strong></td>
                      <td className="hidden sm:table-cell suave">{alertTypeLabels[rule.type] || rule.type}</td>
                      <td>
                        <span className={cn('tag', severityTagClass(rule.severity))}>
                          {severityLabels[rule.severity] || rule.severity}
                        </span>
                      </td>
                      <td className="hidden md:table-cell suave">{rule.cooldownMinutes} min</td>
                      <td className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {rule.channels.map((ch) => (
                            <span key={ch} className="tag tag--cinza">{channelLabels[ch] || ch}</span>
                          ))}
                        </div>
                      </td>
                      <td className="centro">
                        <label className="interruptor">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={ruleToggles[rule.id] ?? rule.active}
                            onChange={(e) => toggleRuleActive(rule.id, e.target.checked)}
                            aria-label={`Ativar regra ${rule.name}`}
                          />
                          <span />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      {/* Cabeçalho */}
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <Shield className="ic cab-pagina__icone" aria-hidden="true" />
          <div>
            <h1>Alertas</h1>
            <p>Monitore e gerencie alertas de qualidade em tempo real.</p>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="abas" role="tablist" aria-label="Situação dos alertas" data-tour="alerts-tabs">
        {TABS.map((t, i) => {
          const selected = activeTab === t.key
          const count = tabCounts[t.key]
          return (
            <button
              key={t.key}
              ref={(el) => { tabRefs.current[t.key] = el }}
              type="button"
              role="tab"
              id={`aba-alertas-${t.key}`}
              aria-controls={`painel-alertas-${t.key}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className="aba"
              onClick={() => setActiveTab(t.key)}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
            >
              {t.icon}
              {t.label}
              {count !== undefined && count > 0 && (
                <span className={cn('contador-pill', t.key !== 'ativos' && 'contador-pill--cinza')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'regras' ? (
        <section
          id="painel-alertas-regras"
          role="tabpanel"
          aria-labelledby="aba-alertas-regras"
        >
          {renderRules()}
        </section>
      ) : (
        <>
          {/* Filtros */}
          <section
            className="cartao filtros min-[1281px]:[grid-template-columns:minmax(200px,1.6fr)_repeat(5,minmax(110px,.65fr))_minmax(96px,.5fr)_1px_auto]"
            aria-label="Filtros"
            data-tour="alerts-filterbar"
          >
            <div className="campo filtros__busca">
              <span className="rotulo"><Filter className="ic" aria-hidden="true" /> Filtros</span>
              <label className="entrada-ic">
                <Search className="ic" aria-hidden="true" />
                <span className="sr-only">Buscar alertas</span>
                <input
                  className="entrada"
                  type="search"
                  placeholder="Buscar alertas, clientes ou atendentes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="campo">
              <label htmlFor="f-alertas-criticidade">Criticidade</label>
              <select
                id="f-alertas-criticidade"
                className="selecao"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
              >
                <option value="todas">Todas</option>
                <option value="informativo">Informativo</option>
                <option value="atencao">Atenção</option>
                <option value="alto">Alto</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="f-alertas-tipo">Tipo de alerta</label>
              <select
                id="f-alertas-tipo"
                className="selecao"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">Todos</option>
                {filterType !== 'all' && !alertTypes.includes(filterType) && (
                  <option value={filterType}>{alertTypeLabels[filterType] || filterType}</option>
                )}
                {alertTypes.map((t) => (
                  <option key={t} value={t}>{alertTypeLabels[t] || t}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="f-alertas-atendente">Atendente</label>
              <select
                id="f-alertas-atendente"
                className="selecao"
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
              >
                <option value="all">Todos</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="f-alertas-equipe">Equipe</label>
              <select
                id="f-alertas-equipe"
                className="selecao"
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
              >
                <option value="all">Todas</option>
                {teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="f-alertas-valor">Valor</label>
              <select
                id="f-alertas-valor"
                className="selecao"
                value={filterHasValue}
                onChange={(e) => setFilterHasValue(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="com">Com valor</option>
                <option value="sem">Sem valor</option>
              </select>
            </div>
            <div className="campo filtros__conf">
              <label htmlFor="f-alertas-conf">Confiança mín. %</label>
              <input
                id="f-alertas-conf"
                className="entrada"
                type="number"
                min={0}
                max={100}
                placeholder="%"
                value={filterConfidenceMin}
                onChange={(e) => setFilterConfidenceMin(e.target.value)}
              />
            </div>
            <div className="sep-v" />
            <button
              type="button"
              className="btn btn--link filtros__limpar"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
            >
              <RotateCcw className="ic" aria-hidden="true" />
              Limpar filtros
            </button>
          </section>

          {/* Lista */}
          <section
            id={`painel-alertas-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`aba-alertas-${activeTab}`}
            className="lista-alertas"
          >
            {renderAlertList()}
          </section>
        </>
      )}

      {/* Nova regra */}
      <Dialog open={newRuleOpen} onOpenChange={setNewRuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova regra de alerta</DialogTitle>
            <DialogDescription>Configure quando este alerta deve ser gerado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nova-regra-nome">Nome</Label>
              <Input
                id="nova-regra-nome"
                placeholder="Ex: Cliente sem resposta"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newRuleType} onValueChange={setNewRuleType}>
                <SelectTrigger aria-label="Selecione o tipo"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(alertTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severidade</Label>
              <Select value={newRuleSeverity} onValueChange={setNewRuleSeverity}>
                <SelectTrigger aria-label="Severidade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(severityLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nova-regra-cooldown">Cooldown (minutos)</Label>
              <Input
                id="nova-regra-cooldown"
                type="number"
                min="0"
                value={newRuleCooldown}
                onChange={(e) => setNewRuleCooldown(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRuleOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateRule} disabled={!newRuleName.trim() || !newRuleType || creatingRule}>
              Criar regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver alerta</DialogTitle>
            <DialogDescription>
              Selecione o motivo da resolução deste alerta.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={resolveReason} onValueChange={setResolveReason}>
              <SelectTrigger aria-label="Selecione o motivo...">
                <SelectValue placeholder="Selecione o motivo..." />
              </SelectTrigger>
              <SelectContent>
                {resolveReasons.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmResolve} disabled={!resolveReason} className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Resolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ignore dialog */}
      <Dialog open={ignoreDialogOpen} onOpenChange={setIgnoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ignorar alerta</DialogTitle>
            <DialogDescription>
              Selecione o motivo para ignorar este alerta.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={ignoreReason} onValueChange={setIgnoreReason}>
              <SelectTrigger aria-label="Selecione o motivo...">
                <SelectValue placeholder="Selecione o motivo..." />
              </SelectTrigger>
              <SelectContent>
                {ignoreReasons.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIgnoreDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmIgnore} disabled={!ignoreReason} className="gap-1.5">
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Ignorar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir responsável</DialogTitle>
            <DialogDescription>
              Selecione o atendente que ficará responsável por este alerta.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={assignAgentId} onValueChange={setAssignAgentId}>
              <SelectTrigger aria-label="Selecione o atendente...">
                <SelectValue placeholder="Selecione o atendente..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} — {a.team}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmAssign} disabled={!assignAgentId} className="gap-1.5">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
