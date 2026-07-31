'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UserPlus,
  Tag,
  Send,
  Download,
  CheckCircle2,
  Filter,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Phone,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'

import {
  formatCurrency,
  timeAgo,
  getSeverityColor,
  getStageLabel,
  getIntentLabel,
  getUrgencyLabel,
  getSentimentLabel,
  cn,
} from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type SortField =
  | 'customerName'
  | 'connectionName'
  | 'agentName'
  | 'waitingMinutes'
  | 'primaryIntent'
  | 'inferredStage'
  | 'sentiment'
  | 'alertCount'
  | 'potentialValue'
  | 'score'
  | 'lastActivity'

type SortDir = 'asc' | 'desc'

const PER_PAGE = 15

const sentimentDotColor: Record<string, string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-slate-400',
  confused: 'bg-amber-400',
  anxious: 'bg-orange-400',
  frustrated: 'bg-red-500',
  irritated: 'bg-red-600',
  desistindo: 'bg-gray-500',
}

const urgencyBadgeVariant: Record<string, 'destructive' | 'secondary' | 'outline' | 'default'> = {
  critical: 'destructive',
  high: 'destructive',
  normal: 'secondary',
  low: 'outline',
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

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3" />
  )
}

export default function ConversationsView() {
  const selectConversation = useAppStore((s) => s.selectConversation)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)

  // Filters
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('7d')
  const [agentFilter, setAgentFilter] = useState('all')
  const [intentFilter, setIntentFilter] = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [failureFilter, setFailureFilter] = useState('all')
  const [hasPotentialValue, setHasPotentialValue] = useState(false)
  const [unreadByManager, setUnreadByManager] = useState(false)

  // Sorting
  const [sortField, setSortField] = useState<SortField>('lastActivity')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Pagination
  const [page, setPage] = useState(1)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Dialogs
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignAgent, setAssignAgent] = useState('')
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')

  // API state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allConversations, setAllConversations] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (period) params.set('period', period)
      if (agentFilter !== 'all') params.set('agentId', agentFilter)
      if (intentFilter !== 'all') params.set('intent', intentFilter)
      if (urgencyFilter !== 'all') params.set('urgency', urgencyFilter)
      if (sentimentFilter !== 'all') params.set('sentiment', sentimentFilter)
      if (stageFilter !== 'all') params.set('stage', stageFilter)
      if (failureFilter !== 'all') params.set('hasAlerts', 'true')
      if (hasPotentialValue) params.set('minValue', '1')
      params.set('limit', '100')

      const res = await fetch(`/api/conversations?${params.toString()}`)
      if (!res.ok) throw new Error('Erro ao carregar conversas')
      const data = await res.json()
      setAllConversations(data.conversations || [])
      setTotalCount(data.pagination?.total || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [search, period, agentFilter, intentFilter, urgencyFilter, sentimentFilter, stageFilter, failureFilter, hasPotentialValue])

  useEffect(() => { fetchData() }, [fetchData, refreshTrigger])

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDir('desc')
      }
    },
    [sortField]
  )

  const filtered = useMemo(() => {
    let data = [...allConversations]
    // Search is done server-side, but we can still filter unreadByManager client-side
    if (unreadByManager) data = data.filter((c) => c.operationalStatus === 'new' || c.operationalStatus === 'waiting_company')

    data.sort((a, b) => {
      let cmp = 0
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal)
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal
      } else {
        cmp = 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return data
  }, [allConversations, unreadByManager, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === paged.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paged.map((c) => c.id)))
    }
  }, [paged, selectedIds.size])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleAssign = useCallback(() => {
    setAssignDialogOpen(false)
    setAssignAgent('')
    clearSelection()
  }, [clearSelection])

  const handleAddTag = useCallback(() => {
    setTagDialogOpen(false)
    setTagInput('')
    clearSelection()
  }, [clearSelection])

  const handleBatchAction = useCallback((action: string) => {
    if (action === 'assign') setAssignDialogOpen(true)
    if (action === 'tag') setTagDialogOpen(true)
    if (action === 'recovery' || action === 'export' || action === 'review') {
      clearSelection()
    }
  }, [clearSelection])

  const uniqueIntents = useMemo(
    () => [...new Set(allConversations.map((c) => c.primaryIntent).filter(Boolean))].sort(),
    [allConversations]
  )
  const uniqueStages = useMemo(
    () => [...new Set(allConversations.map((c) => c.inferredStage).filter(Boolean))].sort(),
    [allConversations]
  )

  // Loading skeleton
  if (isLoading) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full max-w-sm" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </TooltipProvider>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={fetchData} className="text-sm text-primary underline">Tentar novamente</button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col gap-4 p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Conversas</h1>
            <p className="text-sm text-muted-foreground">
              {totalCount || allConversations.length} conversa{(totalCount || allConversations.length) !== 1 ? 's' : ''} encontrada{(totalCount || allConversations.length) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col gap-3">
          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, telefone ou atendente..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-9"
            />
          </div>

          {/* Filters row */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9">
            {/* Período */}
            <Select
              value={period}
              onValueChange={(v) => {
                setPeriod(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {/* Responsável */}
            <Select
              value={agentFilter}
              onValueChange={(v) => {
                setAgentFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {allConversations
                  .filter((c) => c.agentId)
                  .reduce((acc, c) => {
                    if (!acc.find((a: any) => a.id === c.agentId)) acc.push({ id: c.agentId, name: c.agentName })
                    return acc
                  }, [] as { id: string; name: string }[])
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Intenção */}
            <Select
              value={intentFilter}
              onValueChange={(v) => {
                setIntentFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Intenção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueIntents.map((i) => (
                  <SelectItem key={i} value={i}>
                    {getIntentLabel(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Urgência */}
            <Select
              value={urgencyFilter}
              onValueChange={(v) => {
                setUrgencyFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Urgência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
              </SelectContent>
            </Select>

            {/* Sentimento */}
            <Select
              value={sentimentFilter}
              onValueChange={(v) => {
                setSentimentFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sentimento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="positive">Positivo</SelectItem>
                <SelectItem value="neutral">Neutro</SelectItem>
                <SelectItem value="confused">Confuso</SelectItem>
                <SelectItem value="anxious">Ansioso</SelectItem>
                <SelectItem value="frustrated">Frustrado</SelectItem>
              </SelectContent>
            </Select>

            {/* Etapa */}
            <Select
              value={stageFilter}
              onValueChange={(v) => {
                setStageFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueStages.map((s) => (
                  <SelectItem key={s} value={s}>
                    {getStageLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Falha */}
            <Select
              value={failureFilter}
              onValueChange={(v) => {
                setFailureFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Falha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="with_failures">Com falhas</SelectItem>
              </SelectContent>
            </Select>

            {/* Com valor potencial checkbox */}
            <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm cursor-pointer">
              <Checkbox
                checked={hasPotentialValue}
                onCheckedChange={(v) => {
                  setHasPotentialValue(!!v)
                  setPage(1)
                }}
              />
              <span className="whitespace-nowrap">Com valor</span>
            </label>

            {/* Não lidas pelo gestor checkbox */}
            <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm cursor-pointer">
              <Checkbox
                checked={unreadByManager}
                onCheckedChange={(v) => {
                  setUnreadByManager(!!v)
                  setPage(1)
                }}
              />
              <span className="whitespace-nowrap">Não lidas</span>
            </label>
          </div>
        </div>

        {/* Batch actions toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 px-4 py-2">
            <span className="mr-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => handleBatchAction('assign')}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Atribuir atendente
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => handleBatchAction('tag')}
            >
              <Tag className="h-3.5 w-3.5" />
              Adicionar tag
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => handleBatchAction('recovery')}
            >
              <Send className="h-3.5 w-3.5" />
              Enviar à recuperação
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => handleBatchAction('export')}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar metadados
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => handleBatchAction('review')}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Marcar como revisada
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 text-xs"
              onClick={clearSelection}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Table */}
        <ScrollArea className="custom-scrollbar max-h-[calc(100vh-280px)]">
          <div className="min-w-[1200px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 px-3">
                    <Checkbox
                      checked={paged.length > 0 && selectedIds.size === paged.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none px-3"
                    onClick={() => handleSort('customerName')}
                  >
                    <span className="inline-flex items-center">
                      Cliente
                      <SortIcon field="customerName" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="px-3 hidden lg:table-cell">Conexão</TableHead>
                  <TableHead
                    className="cursor-pointer select-none px-3"
                    onClick={() => handleSort('agentName')}
                  >
                    <span className="inline-flex items-center">
                      Responsável
                      <SortIcon field="agentName" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="px-3 hidden xl:table-cell">Última mensagem</TableHead>
                  <TableHead
                    className="cursor-pointer select-none px-3 hidden md:table-cell"
                    onClick={() => handleSort('waitingMinutes')}
                  >
                    <span className="inline-flex items-center">
                      Espera
                      <SortIcon field="waitingMinutes" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="px-3 hidden lg:table-cell">Intenção</TableHead>
                  <TableHead className="px-3 hidden lg:table-cell">Etapa</TableHead>
                  <TableHead className="px-3 hidden md:table-cell">Sent.</TableHead>
                  <TableHead
                    className="cursor-pointer select-none px-3"
                    onClick={() => handleSort('alertCount')}
                  >
                    <span className="inline-flex items-center">
                      Alertas
                      <SortIcon field="alertCount" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none px-3 hidden sm:table-cell"
                    onClick={() => handleSort('potentialValue')}
                  >
                    <span className="inline-flex items-center">
                      Valor
                      <SortIcon field="potentialValue" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none px-3"
                    onClick={() => handleSort('score')}
                  >
                    <span className="inline-flex items-center">
                      Nota
                      <SortIcon field="score" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none px-3"
                    onClick={() => handleSort('lastActivity')}
                  >
                    <span className="inline-flex items-center">
                      Atividade
                      <SortIcon field="lastActivity" sortField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="h-32 text-center text-muted-foreground">
                      Nenhuma conversa encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer group"
                      onClick={() => selectConversation(c.id)}
                    >
                      <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={() => toggleSelect(c.id)}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">{c.customerName}</span>
                          <span className="text-xs text-muted-foreground font-mono">{c.customerPhone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{c.connectionName}</span>
                      </TableCell>
                      <TableCell className="px-3">
                        <span className="text-sm">{c.agentName}</span>
                      </TableCell>
                      <TableCell className="px-3 hidden xl:table-cell">
                        <span className="text-xs text-muted-foreground max-w-[180px] truncate block">
                          {c.messagesCount > 0 ? `${c.messagesCount} mensagens` : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 hidden md:table-cell">
                        {c.waitingMinutes > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400">
                                <Clock className="h-3 w-3" />
                                {c.waitingMinutes}min
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Aguardando há {c.waitingMinutes} minutos</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 hidden lg:table-cell">
                        <Badge
                          variant="outline"
                          className={cn('text-xs font-normal', intentBadgeColor[c.primaryIntent] || '')}
                        >
                          {getIntentLabel(c.primaryIntent)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 hidden lg:table-cell">
                        <Badge
                          variant="outline"
                          className={cn('text-xs font-normal', stageBadgeColor[c.inferredStage] || '')}
                        >
                          {getStageLabel(c.inferredStage)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 hidden md:table-cell">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'inline-block h-2.5 w-2.5 rounded-full',
                                sentimentDotColor[c.sentiment] || 'bg-slate-400'
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{getSentimentLabel(c.sentiment)}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="px-3">
                        {c.alertCount > 0 ? (
                          <Badge
                            variant={c.alertCount >= 2 ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            <ShieldAlert className="mr-1 h-3 w-3" />
                            {c.alertCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 hidden sm:table-cell">
                        {c.potentialValue > 0 ? (
                          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(c.potentialValue)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3">
                        <span className={cn('text-sm font-bold tabular-nums', scoreColor(c.score))}>
                          {c.score}
                        </span>
                      </TableCell>
                      <TableCell className="px-3">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(c.lastActivity)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Mostrando {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true
                  if (p === 1 || p === totalPages) return true
                  if (Math.abs(p - safePage) <= 1) return true
                  return false
                })
                .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                  if (i > 0) {
                    const prev = arr[i - 1]
                    if (p - prev > 1) acc.push('ellipsis')
                  }
                  acc.push(p)
                  return acc
                }, [])
                .map((item, i) =>
                  item === 'ellipsis' ? (
                    <span key={`e${i}`} className="px-2 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={safePage === item ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  )
                )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atribuir atendente</DialogTitle>
              <DialogDescription>
                Selecione o atendente para {selectedIds.size} conversa{selectedIds.size !== 1 ? 's' : ''}.
              </DialogDescription>
            </DialogHeader>
            <Select value={assignAgent} onValueChange={setAssignAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o atendente" />
              </SelectTrigger>
              <SelectContent>
                {allConversations
                  .filter((c) => c.agentId)
                  .reduce((acc, c) => {
                    if (!acc.find((a: any) => a.id === c.agentId)) acc.push({ id: c.agentId, name: c.agentName, team: c.agentTeam })
                    return acc
                  }, [] as { id: string; name: string; team: string }[])
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — {a.team}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAssign} disabled={!assignAgent}>
                Atribuir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tag Dialog */}
        <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar tag</DialogTitle>
              <DialogDescription>
                Digite a tag para {selectedIds.size} conversa{selectedIds.size !== 1 ? 's' : ''}.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Ex: prioritario, vip, retorno..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddTag} disabled={!tagInput.trim()}>
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
