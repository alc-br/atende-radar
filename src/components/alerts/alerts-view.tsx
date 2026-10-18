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
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'

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
import { mutate, fetchMutation, MUTATION_ERROR_MESSAGE } from '@/lib/mutation'
import { RULE_CHANNELS, RULE_CHANNEL_LABELS, type RuleChannel } from '@/lib/alert-channels'
import { ALERT_CHANNEL_LABELS, ALERT_RULE_HELP, ALERT_TYPE_LABELS, RULE_LIMIT_LABEL, SELECTABLE_RULE_TYPES, ruleDefaultLimit, ruleLimitKind } from '@/lib/alert-labels'
import { HelpTip } from '@/components/ui/help-tip'
import { tourSignal } from '@/lib/system-tour/signals'
import { can, canOpenView } from '@/lib/permissions'

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

const alertTypeLabels = ALERT_TYPE_LABELS
const channelLabels = ALERT_CHANNEL_LABELS

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
  /** B6: quantas vezes o problema aconteceu nesta conversa (alerta agrupado) e quando foi a última */
  occurrences?: number; lastOccurredAt?: string
  /** fechou pelo "encerrar sozinho" da regra */
  autoClosed?: boolean
}

/** Prazo da regra na tabela: "10 min", "80%" ou "—" (tipos sem número). */
function ruleLimitText(rule: { type: string; limitMinutes: number | null }): string {
  const kind = ruleLimitKind(rule.type)
  if (kind === 'none') return '—'
  const n = rule.limitMinutes ?? ruleDefaultLimit(rule.type)
  return kind === 'percent' ? `${n}%` : `${n.toLocaleString('pt-BR')} min`
}

const lastSeen = (a: AlertItem) => a.lastOccurredAt || a.createdAt

interface RuleWindowItem { days?: number[]; start?: string; end?: string }

interface AlertRuleItem {
  id: string; name: string; type: string; active: boolean; severity: string
  channels: string[]; cooldownMinutes: number; limitMinutes: number | null
  scopeConnections?: string[]; scopeTeams?: string[]; daysAndHours?: RuleWindowItem
  autoCloseMinutes?: number | null; exceptions?: string[]
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
// segunda primeiro, como a semana de trabalho
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Tipos sem conversa: a regra vigia o número (queda) ou a empresa (limite do plano). */
const RULE_FILTERS_BY_TYPE = (type: string) => ({
  scope: type !== 'quota_warning',
  exceptions: type !== 'quota_warning' && type !== 'connection_down',
})

/** Resumo dos filtros da regra na tabela: "Só Vendas · Seg, Ter 08:00–18:00 · encerra em 90 min · exceto VIP". */
function ruleFiltersText(rule: AlertRuleItem, names: Map<string, string>): string {
  const parts: string[] = []
  const scope = [...(rule.scopeConnections ?? []), ...(rule.scopeTeams ?? [])].map((id) => names.get(id) ?? id)
  if (scope.length) parts.push(`Só ${scope.join(', ')}`)
  const w = rule.daysAndHours
  if (w?.days?.length && w.start && w.end) parts.push(`${WEEKDAY_ORDER.filter((d) => w.days!.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(', ')} ${w.start}–${w.end}`)
  if (rule.autoCloseMinutes) parts.push(`encerra sozinho em ${rule.autoCloseMinutes.toLocaleString('pt-BR')} min`)
  if (rule.exceptions?.length) parts.push(`exceto ${rule.exceptions.join(', ')}`)
  return parts.join(' · ')
}

export default function AlertsView() {
  const selectConversation = useAppStore((s) => s.selectConversation)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  // T4 · quem só consulta (leitura, analista) não vê os botões de tratar o alerta; as regras são da gestão
  const role = useAppStore((s) => s.me?.role)
  const canAct = can(role, 'alerts.manage')
  const canOpenConversation = canOpenView(role, 'conversation-detail')
  const canSeeRules = can(role, 'alert_rules.view')
  const canEditRules = can(role, 'alert_rules.manage')
  const tabs = canSeeRules ? TABS : TABS.filter((t) => t.key !== 'regras')

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
    // resposta 4xx/5xx também desfaz a troca (antes só erro de rede desfazia)
    void mutate(`/api/alert-rules/${ruleId}`, { method: 'PUT', json: { active: checked } }).then((ok) => {
      if (!ok) setRulesData((prev) => prev.map((r) => (r.id === ruleId ? { ...r, active: !checked } : r)))
    })
  }

  // Diálogo de regra: criar (editingRuleId = null) ou editar uma existente
  const [newRuleOpen, setNewRuleOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleType, setNewRuleType] = useState('')
  const [newRuleSeverity, setNewRuleSeverity] = useState('medium')
  const [newRuleCooldown, setNewRuleCooldown] = useState('30')
  const [newRuleLimit, setNewRuleLimit] = useState('')
  const [newRuleChannels, setNewRuleChannels] = useState<RuleChannel[]>(['in_app', 'email'])
  // Mais opções (todas opcionais: vazio = vale sempre)
  const [newRuleConnections, setNewRuleConnections] = useState<string[]>([])
  const [newRuleTeams, setNewRuleTeams] = useState<string[]>([])
  const [newRuleWindowOn, setNewRuleWindowOn] = useState(false)
  const [newRuleDays, setNewRuleDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [newRuleStart, setNewRuleStart] = useState('08:00')
  const [newRuleEnd, setNewRuleEnd] = useState('18:00')
  const [newRuleAutoClose, setNewRuleAutoClose] = useState('')
  const [newRuleExceptions, setNewRuleExceptions] = useState('')
  const [ruleMoreOpen, setRuleMoreOpen] = useState(false)
  const [ruleScopeOptions, setRuleScopeOptions] = useState<{ connections: { id: string; name: string }[]; teams: { id: string; name: string }[] }>({ connections: [], teams: [] })
  const [creatingRule, setCreatingRule] = useState(false)

  // números e equipes da empresa, para escolher na regra e mostrar os nomes na tabela
  useEffect(() => {
    if (!canSeeRules) return
    let alive = true
    void Promise.all([fetch('/api/connections'), fetch('/api/teams')]).then(async ([c, t]) => {
      const connections = c.ok ? ((await c.json()).connections ?? []) as { id: string; name: string }[] : []
      const teams = t.ok ? ((await t.json()).teams ?? []) as { id: string; name: string }[] : []
      if (alive) setRuleScopeOptions({ connections: connections.map(({ id, name }) => ({ id, name })), teams: teams.map(({ id, name }) => ({ id, name })) })
    }).catch(() => {})
    return () => { alive = false }
  }, [canSeeRules, refreshTrigger])
  const scopeNames = useMemo(() => new Map([...ruleScopeOptions.connections, ...ruleScopeOptions.teams].map((x) => [x.id, x.name])), [ruleScopeOptions])

  const resetRuleFilters = (rule?: AlertRuleItem) => {
    setNewRuleConnections(rule?.scopeConnections ?? [])
    setNewRuleTeams(rule?.scopeTeams ?? [])
    const w = rule?.daysAndHours
    const on = !!(w?.days?.length && w.start && w.end)
    setNewRuleWindowOn(on)
    setNewRuleDays(on ? w!.days! : [1, 2, 3, 4, 5])
    setNewRuleStart(on ? w!.start! : '08:00')
    setNewRuleEnd(on ? w!.end! : '18:00')
    setNewRuleAutoClose(rule?.autoCloseMinutes ? String(rule.autoCloseMinutes) : '')
    setNewRuleExceptions((rule?.exceptions ?? []).join(', '))
    // regra com filtro: a seção já abre mostrando o que está valendo
    setRuleMoreOpen(!!(rule?.scopeConnections?.length || rule?.scopeTeams?.length || on || rule?.autoCloseMinutes || rule?.exceptions?.length))
  }

  const openNewRule = () => {
    setEditingRuleId(null)
    setNewRuleName('')
    setNewRuleType('')
    setNewRuleSeverity('medium')
    setNewRuleCooldown('30')
    setNewRuleLimit('')
    setNewRuleChannels(['in_app', 'email'])
    resetRuleFilters()
    setNewRuleOpen(true)
  }

  const openEditRule = (rule: AlertRuleItem) => {
    setEditingRuleId(rule.id)
    setNewRuleName(rule.name)
    setNewRuleType(rule.type)
    setNewRuleSeverity(rule.severity)
    setNewRuleCooldown(String(rule.cooldownMinutes))
    setNewRuleLimit(rule.limitMinutes == null ? String(ruleDefaultLimit(rule.type)) : String(rule.limitMinutes))
    setNewRuleChannels(RULE_CHANNELS.filter((c) => rule.channels.includes(c)))
    resetRuleFilters(rule)
    setNewRuleOpen(true)
  }

  const toggleNewRuleChannel = (ch: RuleChannel, on: boolean) =>
    setNewRuleChannels((prev) => (on ? RULE_CHANNELS.filter((c) => c === ch || prev.includes(c)) : prev.filter((c) => c !== ch)))

  const limitKind = newRuleType ? ruleLimitKind(newRuleType) : 'none'
  const limitValue = parseInt(newRuleLimit, 10)
  const limitInvalid =
    limitKind !== 'none' && newRuleLimit.trim() !== '' &&
    (!Number.isInteger(limitValue) || limitValue < (limitKind === 'percent' ? 1 : 0) || limitValue > (limitKind === 'percent' ? 100 : 43200))
  const filterKinds = RULE_FILTERS_BY_TYPE(newRuleType)
  const windowError = !newRuleWindowOn ? null
    : newRuleDays.length === 0 ? 'Escolha pelo menos um dia da semana.'
    : !HHMM.test(newRuleStart) || !HHMM.test(newRuleEnd) ? 'Use horários no formato HH:MM (ex.: 08:00).'
    : newRuleStart === newRuleEnd ? 'O horário de início e o de fim não podem ser iguais.'
    : null
  const autoCloseValue = Number(newRuleAutoClose)
  const autoCloseInvalid = newRuleAutoClose.trim() !== '' && (!Number.isInteger(autoCloseValue) || autoCloseValue < 0 || autoCloseValue > 43200)
  const exceptionList = [...new Set(newRuleExceptions.split(',').map((t) => t.trim()).filter(Boolean))]
  const exceptionsInvalid = exceptionList.length > 20 || exceptionList.some((t) => t.length > 40)
  const filtersInvalid = !!windowError || autoCloseInvalid || exceptionsInvalid
  const toggleIn = <T,>(list: T[], v: T, on: boolean) => (on ? (list.includes(v) ? list : [...list, v]) : list.filter((x) => x !== v))
  const chooseRuleType = (t: string) => {
    setNewRuleType(t)
    setNewRuleLimit(ruleLimitKind(t) === 'none' ? '' : String(ruleDefaultLimit(t)))
  }

  const handleCreateRule = async () => {
    if (!newRuleName.trim() || !newRuleType || newRuleChannels.length === 0 || limitInvalid || filtersInvalid) return
    setCreatingRule(true)
    const json = {
      name: newRuleName.trim(),
      severity: newRuleSeverity,
      cooldownMinutes: parseInt(newRuleCooldown, 10) || 30,
      channels: newRuleChannels,
      // prazo (ou % do limite) só nos tipos que usam número; vazio = padrão do tipo
      ...(limitKind !== 'none' && newRuleLimit.trim() !== '' ? { limitMinutes: parseInt(newRuleLimit, 10) } : {}),
      // Mais opções: o tipo que não usa o filtro grava vazio (vale sempre)
      scopeConnections: filterKinds.scope ? newRuleConnections : [],
      scopeTeams: filterKinds.scope ? newRuleTeams : [],
      daysAndHours: newRuleWindowOn ? { days: WEEKDAY_ORDER.filter((d) => newRuleDays.includes(d)), start: newRuleStart, end: newRuleEnd } : {},
      autoCloseMinutes: newRuleAutoClose.trim() === '' ? null : autoCloseValue,
      exceptions: filterKinds.exceptions ? exceptionList : [],
    }
    try {
      if (editingRuleId) {
        await fetchMutation(`/api/alert-rules/${editingRuleId}`, { method: 'PUT', json })
        toast.success('Regra atualizada.')
      } else {
        await fetchMutation('/api/alert-rules', { method: 'POST', json: { ...json, type: newRuleType } })
        toast.success('Regra criada.')
        tourSignal('alert-rule.created')
      }
      setNewRuleOpen(false)
      fetchAlerts()
    } catch (e) {
      // o diálogo continua aberto com o que foi digitado; a mensagem do servidor diz o que fazer (ex.: limite do plano)
      toast.error(e instanceof Error && !e.message.startsWith('HTTP ') ? e.message : MUTATION_ERROR_MESSAGE)
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

    // Sort: critical first, then by last occurrence desc
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    result.sort((a, b) => {
      const so = (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
      if (so !== 0) return so
      return new Date(lastSeen(b)).getTime() - new Date(lastSeen(a)).getTime()
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
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0) return
    e.preventDefault()
    const key = tabs[next].key
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

  // B6 · alerta agrupado: o mesmo problema voltou nesta conversa (um alerta só, com contador, em vez de vários)
  function repeatInfo(alert: AlertItem) {
    const n = alert.occurrences ?? 1
    if (n <= 1) return null
    return (
      <p className="alerta__desc" data-testid="alerta-repeticao">
        <span className="tag tag--cinza">Repetiu {n} vezes</span>
        {' '}Última: {timeAgo(lastSeen(alert))} · 1ª vez: {timeAgo(alert.createdAt)}
      </p>
    )
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
              {alert.autoClosed && <span className="tag tag--cinza" data-testid="alerta-encerrado-sozinho" title="A regra deste alerta fecha sozinha depois do prazo escolhido em Mais opções">Encerrado sozinho</span>}
              <h2>{alert.title}</h2>
              <span className="alerta__quando">
                <Clock className="ic" aria-hidden="true" />
                {timeAgo(lastSeen(alert))}
              </span>
            </header>
            {repeatInfo(alert)}
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
              {timeAgo(lastSeen(alert))}
            </span>
          </header>
          {repeatInfo(alert)}
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
          {(canOpenConversation || canAct) && (
          <div className="alerta__acoes">
            {canOpenConversation && alert.conversationId && (
            <button type="button" className="btn btn--escuro" onClick={() => handleOpenConversation(alert.conversationId)}>
              <MessageSquare className="ic" aria-hidden="true" />
              Abrir conversa
            </button>
            )}
            {canAct && (<>
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
            </>)}
          </div>
          )}
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
          {canEditRules && (
            <button
              type="button"
              data-tour="alerts-new-rule"
              className="btn btn--primario btn--sm"
              onClick={openNewRule}
            >
              <Plus className="ic" aria-hidden="true" />
              Nova regra
            </button>
          )}
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
                    <th scope="col" className="hidden sm:table-cell"><span className="th-ajuda">Tipo<HelpTip label="Tipo">{ALERT_RULE_HELP.tipo}</HelpTip></span></th>
                    <th scope="col" className="hidden md:table-cell"><span className="th-ajuda">Prazo<HelpTip label="Prazo">{ALERT_RULE_HELP.prazo}</HelpTip></span></th>
                    <th scope="col"><span className="th-ajuda">Severidade<HelpTip label="Severidade">{ALERT_RULE_HELP.severidade}</HelpTip></span></th>
                    <th scope="col" className="hidden md:table-cell"><span className="th-ajuda">Cooldown<HelpTip label="Cooldown">{ALERT_RULE_HELP.cooldown}</HelpTip></span></th>
                    <th scope="col" className="hidden lg:table-cell"><span className="th-ajuda">Canais<HelpTip label="Canais">{ALERT_RULE_HELP.canais}</HelpTip></span></th>
                    <th scope="col" className="centro">Ativa</th>
                    {canEditRules && <th scope="col"><span className="sr-only">Ações</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {rulesData.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <strong>{rule.name}</strong>
                        {ruleFiltersText(rule, scopeNames) && <span className="block text-xs suave" data-testid="rule-filters">{ruleFiltersText(rule, scopeNames)}</span>}
                      </td>
                      <td className="hidden sm:table-cell suave">{alertTypeLabels[rule.type] || rule.type}</td>
                      <td className="hidden md:table-cell suave" data-testid="rule-limit">{ruleLimitText(rule)}</td>
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
                            disabled={!canEditRules}
                            onChange={(e) => toggleRuleActive(rule.id, e.target.checked)}
                            aria-label={`Ativar regra ${rule.name}`}
                          />
                          <span />
                        </label>
                      </td>
                      {canEditRules && (
                        <td>
                          <button type="button" className="btn btn--sm" onClick={() => openEditRule(rule)} aria-label={`Editar regra ${rule.name}`}>
                            <Pencil className="ic" aria-hidden="true" />Editar
                          </button>
                        </td>
                      )}
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
        {tabs.map((t, i) => {
          const selected = activeTab === t.key
          const count = tabCounts[t.key]
          return (
            <button
              key={t.key}
              ref={(el) => { tabRefs.current[t.key] = el }}
              type="button"
              role="tab"
              id={`aba-alertas-${t.key}`}
              data-tour={t.key === 'regras' ? 'alerts-tab-rules' : undefined}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRuleId ? 'Editar regra de alerta' : 'Nova regra de alerta'}</DialogTitle>
            <DialogDescription>Configure quando este alerta deve ser gerado e por onde ele avisa.</DialogDescription>
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
              <div className="rotulo-ajuda"><Label>Tipo</Label><HelpTip label="Tipo">{ALERT_RULE_HELP.tipo}</HelpTip></div>
              <Select value={newRuleType} onValueChange={chooseRuleType} disabled={!!editingRuleId}>
                <SelectTrigger aria-label="Selecione o tipo"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {(editingRuleId && !SELECTABLE_RULE_TYPES.includes(newRuleType) ? [...SELECTABLE_RULE_TYPES, newRuleType] : SELECTABLE_RULE_TYPES).map((value) => (
                    <SelectItem key={value} value={value}>{alertTypeLabels[value] ?? value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="rotulo-ajuda"><Label>Severidade</Label><HelpTip label="Severidade">{ALERT_RULE_HELP.severidade}</HelpTip></div>
              <Select value={newRuleSeverity} onValueChange={setNewRuleSeverity}>
                <SelectTrigger aria-label="Severidade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(severityLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {limitKind !== 'none' && (
              <div className="space-y-2">
                <div className="rotulo-ajuda"><Label htmlFor="nova-regra-prazo">{RULE_LIMIT_LABEL[limitKind]}</Label><HelpTip label="Prazo">{ALERT_RULE_HELP.prazo}</HelpTip></div>
                <Input
                  id="nova-regra-prazo"
                  type="number"
                  min={limitKind === 'percent' ? 1 : 0}
                  max={limitKind === 'percent' ? 100 : 43200}
                  value={newRuleLimit}
                  onChange={(e) => setNewRuleLimit(e.target.value)}
                  aria-invalid={limitInvalid || undefined}
                />
                {limitInvalid && (
                  <p className="text-sm text-[var(--vermelho)]" role="alert">
                    {limitKind === 'percent' ? 'Use de 1 a 100.' : 'Use de 0 a 43.200 minutos (30 dias).'}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <div className="rotulo-ajuda"><Label htmlFor="nova-regra-cooldown">Cooldown (minutos)</Label><HelpTip label="Cooldown">{ALERT_RULE_HELP.cooldown}</HelpTip></div>
              <Input
                id="nova-regra-cooldown"
                type="number"
                min="0"
                value={newRuleCooldown}
                onChange={(e) => setNewRuleCooldown(e.target.value)}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="rotulo-ajuda text-sm font-medium">Avisar por<HelpTip label="Canais">{ALERT_RULE_HELP.canais}</HelpTip></legend>
              {RULE_CHANNELS.map((ch) => (
                <label key={ch} className="canal-opcao">
                  <input
                    type="checkbox"
                    checked={newRuleChannels.includes(ch)}
                    onChange={(e) => toggleNewRuleChannel(ch, e.target.checked)}
                  />
                  <span>
                    <span className="canal-opcao__nome">{RULE_CHANNEL_LABELS[ch]}</span>
                    <span className="canal-opcao__desc">
                      {ch === 'in_app' ? 'Sino e tela Alertas' : 'Para os membros que veem o alerta e deixaram ligado em Meu perfil'}
                    </span>
                  </span>
                </label>
              ))}
              {newRuleChannels.length === 0 && <p className="text-sm text-[var(--vermelho)]" role="alert">Escolha pelo menos um canal.</p>}
              <p className="text-xs suave">O webhook vale para todos os alertas da empresa: configure em Configurações › Webhook.</p>
            </fieldset>
            <details className="space-y-3" data-testid="regra-mais-opcoes" open={ruleMoreOpen} onToggle={(e) => setRuleMoreOpen(e.currentTarget.open)}>
              <summary className="cursor-pointer text-sm font-medium">Mais opções</summary>
              <p className="text-xs suave">Tudo opcional. Em branco, a regra vale para todos os números, equipes, dias e horários.</p>
              {filterKinds.scope && ruleScopeOptions.connections.length > 0 && (
                <fieldset className="space-y-1">
                  <legend className="rotulo-ajuda text-sm font-medium">Números<HelpTip label="Números">{ALERT_RULE_HELP.numeros}</HelpTip></legend>
                  {ruleScopeOptions.connections.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={newRuleConnections.includes(c.id)} onChange={(e) => setNewRuleConnections((p) => toggleIn(p, c.id, e.target.checked))} />
                      {c.name}
                    </label>
                  ))}
                </fieldset>
              )}
              {filterKinds.scope && ruleScopeOptions.teams.length > 0 && (
                <fieldset className="space-y-1">
                  <legend className="rotulo-ajuda text-sm font-medium">Equipes<HelpTip label="Equipes">{ALERT_RULE_HELP.equipes}</HelpTip></legend>
                  {ruleScopeOptions.teams.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={newRuleTeams.includes(t.id)} onChange={(e) => setNewRuleTeams((p) => toggleIn(p, t.id, e.target.checked))} />
                      {t.name}
                    </label>
                  ))}
                </fieldset>
              )}
              <fieldset className="space-y-2">
                <legend className="rotulo-ajuda text-sm font-medium">Dias e horários<HelpTip label="Dias e horários">{ALERT_RULE_HELP.diasHorarios}</HelpTip></legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newRuleWindowOn} onChange={(e) => setNewRuleWindowOn(e.target.checked)} />
                  Só abrir alerta em alguns dias e horários
                </label>
                {newRuleWindowOn && (
                  <>
                    <div className="flex flex-wrap gap-3" role="group" aria-label="Dias da semana">
                      {WEEKDAY_ORDER.map((d) => (
                        <label key={d} className="flex items-center gap-1 text-sm">
                          <input type="checkbox" checked={newRuleDays.includes(d)} onChange={(e) => setNewRuleDays((p) => toggleIn(p, d, e.target.checked))} />
                          {WEEKDAY_SHORT[d]}
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="nova-regra-inicio">Das</Label>
                        <Input id="nova-regra-inicio" type="time" value={newRuleStart} onChange={(e) => setNewRuleStart(e.target.value)} className="w-32" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="nova-regra-fim">Até</Label>
                        <Input id="nova-regra-fim" type="time" value={newRuleEnd} onChange={(e) => setNewRuleEnd(e.target.value)} className="w-32" />
                      </div>
                    </div>
                    <p className="text-xs suave">Horário da empresa. Se o fim for antes do início (ex.: 22:00 até 06:00), vale até a manhã seguinte.</p>
                    {windowError && <p className="text-sm text-[var(--vermelho)]" role="alert">{windowError}</p>}
                  </>
                )}
              </fieldset>
              <div className="space-y-1">
                <div className="rotulo-ajuda"><Label htmlFor="nova-regra-encerrar">Encerrar sozinho depois de (minutos)</Label><HelpTip label="Encerrar sozinho">{ALERT_RULE_HELP.encerrarSozinho}</HelpTip></div>
                <Input id="nova-regra-encerrar" type="number" min="0" max="43200" placeholder="Em branco: só fecha quando o problema acabar" value={newRuleAutoClose} onChange={(e) => setNewRuleAutoClose(e.target.value)} aria-invalid={autoCloseInvalid || undefined} />
                {autoCloseInvalid && <p className="text-sm text-[var(--vermelho)]" role="alert">Use de 0 a 43.200 minutos (30 dias).</p>}
              </div>
              {filterKinds.exceptions && (
                <div className="space-y-1">
                  <div className="rotulo-ajuda"><Label htmlFor="nova-regra-excecoes">Exceções (etiquetas da conversa)</Label><HelpTip label="Exceções">{ALERT_RULE_HELP.excecoes}</HelpTip></div>
                  <Input id="nova-regra-excecoes" placeholder="Ex.: Cliente VIP, Atacado" value={newRuleExceptions} onChange={(e) => setNewRuleExceptions(e.target.value)} aria-invalid={exceptionsInvalid || undefined} />
                  <p className="text-xs suave">Separe por vírgula. Conversa com uma dessas etiquetas fica fora da regra.</p>
                  {exceptionsInvalid && <p className="text-sm text-[var(--vermelho)]" role="alert">Até 20 etiquetas, cada uma com até 40 caracteres.</p>}
                </div>
              )}
            </details>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRuleOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateRule} disabled={!newRuleName.trim() || !newRuleType || newRuleChannels.length === 0 || limitInvalid || filtersInvalid || creatingRule}>
              {editingRuleId ? 'Salvar regra' : 'Criar regra'}
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
