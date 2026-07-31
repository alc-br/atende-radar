'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  Clock,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
  Filter,
  Plus,
  ExternalLink,
  Search,
  MessageSquare,
  DollarSign,
  Percent,
  Shield,
  Zap,
  ChevronDown,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  formatCurrency,
  timeAgo,
  getSeverityColor,
} from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'

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

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical': return <AlertOctagon className="h-4 w-4" />
    case 'high': return <AlertTriangle className="h-4 w-4" />
    case 'medium': return <AlertCircle className="h-4 w-4" />
    default: return <Info className="h-4 w-4" />
  }
}

function getSeverityBadgeVariant(severity: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (severity) {
    case 'critical': return 'destructive'
    case 'high': return 'default'
    default: return 'secondary'
  }
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
  const [activeTab, setActiveTab] = useState('ativos')

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

      const [alertsRes, rulesRes] = await Promise.all([
        fetch(`/api/alerts?${params.toString()}`),
        fetch('/api/alert-rules'),
      ])

      if (!alertsRes.ok) throw new Error('Erro ao carregar alertas')
      const alertsJson = await alertsRes.json()
      const items: AlertItem[] = (alertsJson.alerts || []).map((a: Record<string, unknown>) => ({
        ...a,
        evidence: a.evidence || 'Detecção automatizada pela IA de auditoria.',
      }))
      setAlertsData(items)
      setApiCounts(alertsJson.counts || {})

      if (rulesRes.ok) {
        const rulesJson = await rulesRes.json()
        setRulesData(rulesJson.rules || [])
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

  const setRuleToggles = (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => {
    // Optimistic update - in production would call PUT /api/alert-rules/[id]
  }

  // Unique teams - derived from alerts (no separate agents import)
  const teams = useMemo(() => [], [])

  // Get effective status
  const getAlertStatus = (alert: AlertItem) => alert.status

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
  const tabCounts = useMemo(() => ({
    ativos: (apiCounts.new || 0) + (apiCounts.acknowledged || 0),
    acompanhamento: apiCounts.in_progress || 0,
    resolvidos: apiCounts.resolved || 0,
    ignorados: (apiCounts.dismissed || 0) + (apiCounts.false_positive || 0),
  }), [apiCounts])

  // Actions
  function handleOpenConversation(conversationId: string) {
    selectConversation(conversationId)
  }

  function handleResolve(alertId: string) {
    setSelectedAlertId(alertId)
    setResolveReason('')
    setResolveDialogOpen(true)
  }

  function confirmResolve() {
    if (selectedAlertId && resolveReason) {
      fetch(`/api/alerts/${selectedAlertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: resolveReason }),
      }).then(() => fetchAlerts()).catch(() => {})
      setResolveDialogOpen(false)
      setSelectedAlertId(null)
      setResolveReason('')
    }
  }

  function handleIgnore(alertId: string) {
    setSelectedAlertId(alertId)
    setIgnoreReason('')
    setIgnoreDialogOpen(true)
  }

  function confirmIgnore() {
    if (selectedAlertId && ignoreReason) {
      fetch(`/api/alerts/${selectedAlertId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: ignoreReason }),
      }).then(() => fetchAlerts()).catch(() => {})
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
    setAssignDialogOpen(false)
    setSelectedAlertId(null)
    setAssignAgentId('')
  }

  function handleFollowUp(alertId: string) {
    fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' })
      .then(() => fetchAlerts()).catch(() => {})
  }

  function handleFalsePositive(alertId: string) {
    fetch(`/api/alerts/${alertId}/false-positive`, { method: 'POST' })
      .then(() => fetchAlerts()).catch(() => {})
  }

  function handleCreateRecovery(alertId: string) {
    fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' })
      .then(() => fetchAlerts()).catch(() => {})
  }

  function maskCustomerName(name: string): string {
    const parts = name.split(' ')
    if (parts.length === 1) return name.charAt(0) + '***'
    return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '***'
  }

  // ── Render alert card ──
  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 h-full">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-28 rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={fetchAlerts} className="text-sm text-primary underline">Tentar novamente</button>
      </div>
    )
  }

  function AlertCard({ alert }: { alert: AlertItem }) {
    const status = getAlertStatus(alert)
    const isResolved = status === 'resolved'
    const isDismissed = status === 'dismissed'
    const isInactive = isResolved || isDismissed

    return (
      <Card className={cn(
        'transition-all hover:shadow-md',
        isInactive && 'opacity-60'
      )}>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            {/* Top row: severity badge + title + time */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge
                  variant={getSeverityBadgeVariant(alert.severity)}
                  className={cn('gap-1 shrink-0 font-medium', getSeverityColor(alert.severity))}
                >
                  {getSeverityIcon(alert.severity)}
                  {severityLabels[alert.severity] || alert.severity}
                </Badge>
                <span className="font-medium text-sm truncate">
                  {alert.title}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo(alert.createdAt)}
              </span>
            </div>

            {/* Info row: customer + agent */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <UserPlus className="h-3 w-3" />
                {maskCustomerName(alert.customerName)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {alert.agentName}
              </span>
              {alert.potentialValue && alert.potentialValue > 0 && (
                <span className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                  <DollarSign className="h-3 w-3" />
                  {formatCurrency(alert.potentialValue)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Percent className="h-3 w-3" />
                {Math.round(alert.confidence * 100)}% confiança
              </span>
            </div>

            {/* Evidence */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {alert.evidence}
            </p>

            {/* Status badge */}
            {status !== 'new' && (
              <div>
                <Badge variant="outline" className="text-xs">
                  {status === 'acknowledged' && 'Reconhecido'}
                  {status === 'in_progress' && 'Em acompanhamento'}
                  {status === 'resolved' && 'Resolvido'}
                  {status === 'dismissed' && 'Ignorado'}
                </Badge>
              </div>
            )}

            {/* Actions */}
            {!isInactive && (
              <>
                <Separator className="my-1" />
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleOpenConversation(alert.conversationId)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir conversa
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleAssign(alert.id)}
                  >
                    <UserPlus className="h-3 w-3" />
                    Atribuir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleFollowUp(alert.id)}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Acompanhar
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Resolver
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Motivo da resolução</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {resolveReasons.map((r) => (
                        <DropdownMenuItem
                          key={r.value}
                          onClick={() => {
                            fetch(`/api/alerts/${alert.id}/resolve`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ reason: r.value }),
                            }).then(() => fetchAlerts()).catch(() => {})
                          }}
                        >
                          {r.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <XCircle className="h-3 w-3" />
                        Ignorar
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Motivo do descarte</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {ignoreReasons.map((r) => (
                        <DropdownMenuItem
                          key={r.value}
                          onClick={() => {
                            fetch(`/api/alerts/${alert.id}/dismiss`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ reason: r.value }),
                            }).then(() => fetchAlerts()).catch(() => {})
                          }}
                        >
                          {r.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => handleFalsePositive(alert.id)}
                  >
                    <Ban className="h-3 w-3" />
                    Falso positivo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-emerald-600"
                    onClick={() => handleCreateRecovery(alert.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Recuperação
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Alert Rules Tab ──
  function RulesTab() {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg">Regras de Alerta</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Configure quando e como os alertas são gerados.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nova regra
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="w-[80px] text-center">Ativa</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead className="hidden md:table-cell">Cooldown</TableHead>
                <TableHead className="hidden lg:table-cell">Canais</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rulesData.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium text-sm">
                    {rule.name}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {alertTypeLabels[rule.type] || rule.type}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={ruleToggles[rule.id] ?? rule.active}
                      onCheckedChange={(checked) => {
                        setRuleToggles((prev) => ({ ...prev, [rule.id]: checked }))
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={getSeverityBadgeVariant(rule.severity)}
                      className={cn('gap-1 text-xs', getSeverityColor(rule.severity))}
                    >
                      {getSeverityIcon(rule.severity)}
                      {severityLabels[rule.severity] || rule.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {rule.cooldownMinutes} min
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {rule.channels.map((ch) => (
                        <Badge key={ch} variant="outline" className="text-xs">
                          {channelLabels[ch] || ch}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-600" />
            Alertas
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitore e gerencie alertas de qualidade em tempo real.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <TabsList>
            <TabsTrigger value="ativos" className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Ativos
              {tabCounts.ativos > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {tabCounts.ativos}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="acompanhamento" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Em acompanhamento
              {tabCounts.acompanhamento > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {tabCounts.acompanhamento}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="resolvidos" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resolvidos
              {tabCounts.resolvidos > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {tabCounts.resolvidos}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ignorados" className="gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Ignorados
              {tabCounts.ignorados > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {tabCounts.ignorados}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="regras" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Regras
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Filter bar – shown only for alert tabs, not rules */}
        <TabsContent value="ativos" className="mt-3">
          <FilterBar />
          <AlertList />
        </TabsContent>
        <TabsContent value="acompanhamento" className="mt-3">
          <FilterBar />
          <AlertList />
        </TabsContent>
        <TabsContent value="resolvidos" className="mt-3">
          <FilterBar />
          <AlertList />
        </TabsContent>
        <TabsContent value="ignorados" className="mt-3">
          <FilterBar />
          <AlertList />
        </TabsContent>
        <TabsContent value="regras" className="mt-3">
          <RulesTab />
        </TabsContent>
      </Tabs>

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
              <SelectTrigger>
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
            <Button
              onClick={confirmResolve}
              disabled={!resolveReason}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
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
              <SelectTrigger>
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
            <Button
              variant="destructive"
              onClick={confirmIgnore}
              disabled={!ignoreReason}
              className="gap-1.5"
            >
              <XCircle className="h-4 w-4" />
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
              <SelectTrigger>
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
            <Button
              onClick={confirmAssign}
              disabled={!assignAgentId}
              className="gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  // ── Filter Bar (inline to access state) ──
  function FilterBar() {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filtros
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2">
          {/* Search */}
          <div className="col-span-2 sm:col-span-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>
          </div>

          {/* Criticidade */}
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Criticidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="informativo">Informativo</SelectItem>
              <SelectItem value="atencao">Atenção</SelectItem>
              <SelectItem value="alto">Alto</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
            </SelectContent>
          </Select>

          {/* Tipo */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {alertTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {alertTypeLabels[t] || t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Atendente */}
          <Select value={filterAgent} onValueChange={setFilterAgent}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Atendente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Equipe */}
          <Select value={filterTeam} onValueChange={setFilterTeam}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Equipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Valor potencial */}
          <Select value={filterHasValue} onValueChange={setFilterHasValue}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Valor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="com">Com valor</SelectItem>
              <SelectItem value="sem">Sem valor</SelectItem>
            </SelectContent>
          </Select>

          {/* Confiança mínima */}
          <Input
            type="number"
            placeholder="Confiança mín. %"
            value={filterConfidenceMin}
            onChange={(e) => setFilterConfidenceMin(e.target.value)}
            className="h-8 text-xs"
            min={0}
            max={100}
          />
        </div>
      </Card>
    )
  }

  // ── Alert List (inline to access state) ──
  function AlertList() {
    if (filteredAlerts.length === 0) {
      return (
        <Card className="py-12">
          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
            <CheckCircle2 className="h-10 w-10" />
            <p className="text-sm font-medium">Nenhum alerta encontrado</p>
            <p className="text-xs">Ajuste os filtros ou aguarde novos alertas.</p>
          </div>
        </Card>
      )
    }

    return (
      <ScrollArea className="h-[calc(100vh-340px)] min-h-[300px]">
        <div className="flex flex-col gap-2 pr-3">
          {filteredAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
          <div className="text-center text-xs text-muted-foreground py-3">
            {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''} encontrado{filteredAlerts.length !== 1 ? 's' : ''}
          </div>
        </div>
      </ScrollArea>
    )
  }
}


