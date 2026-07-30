'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  RotateCcw,
  UserPlus,
  CalendarClock,
  Copy,
  PhoneCall,
  CheckCircle2,
  XCircle,
  DollarSign,
  Undo2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Info,
  Shield,
  TrendingUp,
  Clock,
  Users,
  PackageOpen,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  recoveryItems,
  agents,
  formatCurrency,
  timeAgo,
} from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'

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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

// --- Types ---

type RecoveryStatus = 'new' | 'assigned' | 'attempted' | 'contacted' | 'recovered' | 'lost'
type RecoveryPriority = 'baixa' | 'média' | 'alta' | 'crítica'

type SortField =
  | 'priority'
  | 'customerName'
  | 'reason'
  | 'originalAgentName'
  | 'assignedTo'
  | 'lastInteraction'
  | 'potentialValue'
  | 'dueAt'
  | 'status'

type SortDir = 'asc' | 'desc'

type OutcomeType =
  | 'contato_feito'
  | 'agendamento'
  | 'venda_recuperada'
  | 'nao_atendeu'
  | 'numero_errado'
  | 'nao_era_oportunidade'

const outcomeLabels: Record<OutcomeType, string> = {
  contato_feito: 'Contato feito',
  agendamento: 'Agendamento',
  venda_recuperada: 'Venda recuperada (com valor)',
  nao_atendeu: 'Não atendeu',
  numero_errado: 'Número errado',
  nao_era_oportunidade: 'Não era oportunidade',
}

const statusLabels: Record<RecoveryStatus, string> = {
  new: 'Nova',
  assigned: 'Atribuída',
  attempted: 'Tentada',
  contacted: 'Contactada',
  recovered: 'Recuperada',
  lost: 'Perdida',
}

const statusColors: Record<RecoveryStatus, string> = {
  new: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  assigned: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  attempted: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  contacted: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  recovered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  lost: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const priorityColors: Record<RecoveryPriority, string> = {
  baixa: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'média': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  alta: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  crítica: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// --- Helpers ---

function getPriorityFromScore(score: number): RecoveryPriority {
  if (score >= 0.8) return 'crítica'
  if (score >= 0.6) return 'alta'
  if (score >= 0.4) return 'média'
  return 'baixa'
}

function priorityOrder(p: RecoveryPriority): number {
  const map: Record<RecoveryPriority, number> = { 'crítica': 0, 'alta': 1, 'média': 2, 'baixa': 3 }
  return map[p]
}

// --- Component ---

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3" />
  )
}

export default function RecoveryView() {
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [recoveredValueFilter, setRecoveredValueFilter] = useState<string>('all')
  // Sort
  const [sortField, setSortField] = useState<SortField>('priority')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  // Dialogs
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignItemId, setAssignItemId] = useState<string | null>(null)
  const [assignAgent, setAssignAgent] = useState('')
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false)
  const [outcomeItemId, setOutcomeItemId] = useState<string | null>(null)
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeType | ''>('')
  const [valueDialogOpen, setValueDialogOpen] = useState(false)
  const [valueItemId, setValueItemId] = useState<string | null>(null)
  const [recoveredValueInput, setRecoveredValueInput] = useState('')
  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false)
  const [deadlineItemId, setDeadlineItemId] = useState<string | null>(null)
  const [deadlineInput, setDeadlineInput] = useState('')

  // Local overrides for demo
  const [localStatuses, setLocalStatuses] = useState<Record<string, RecoveryStatus>>({})
  const [localAssignees, setLocalAssignees] = useState<Record<string, string>>({})
  const [localOutcomes, setLocalOutcomes] = useState<Record<string, string>>({})
  const [localRecoveredValues, setLocalRecoveredValues] = useState<Record<string, number>>({})

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDir('asc')
      }
    },
    [sortField]
  )

  // Computed data
  const items = useMemo(() => {
    const data = recoveryItems.map((item) => ({
      ...item,
      priority: getPriorityFromScore(item.priorityScore),
      status: localStatuses[item.id] ?? (item.status as RecoveryStatus),
      assignedTo: localAssignees[item.id] ?? item.assignedTo,
      outcome: localOutcomes[item.id] ?? item.outcome,
      recoveredValue: localRecoveredValues[item.id] ?? item.recoveredValue,
    }))

    return data
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false
        if (agentFilter !== 'all') {
          const agentMatch = item.assignedTo === agentFilter || item.originalAgentName === agentFilter
          if (!agentMatch) return false
        }
        if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false
        if (recoveredValueFilter === 'with' && !item.recoveredValue) return false
        if (recoveredValueFilter === 'without' && item.recoveredValue) return false
        return true
      })
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        switch (sortField) {
          case 'priority':
            return (priorityOrder(a.priority) - priorityOrder(b.priority)) * dir
          case 'customerName':
            return a.customerName.localeCompare(b.customerName) * dir
          case 'reason':
            return a.reason.localeCompare(b.reason) * dir
          case 'originalAgentName':
            return a.originalAgentName.localeCompare(b.originalAgentName) * dir
          case 'assignedTo':
            return (a.assignedTo || '').localeCompare(b.assignedTo || '') * dir
          case 'lastInteraction':
            return (new Date(a.lastInteraction).getTime() - new Date(b.lastInteraction).getTime()) * dir
          case 'potentialValue':
            return ((a.potentialValue || 0) - (b.potentialValue || 0)) * dir
          case 'dueAt':
            return (new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()) * dir
          case 'status':
            return a.status.localeCompare(b.status) * dir
          default:
            return 0
        }
      })
  }, [recoveryItems, statusFilter, agentFilter, priorityFilter, recoveredValueFilter, sortField, sortDir, localStatuses, localAssignees, localOutcomes, localRecoveredValues])

  // Metrics
  const metrics = useMemo(() => {
    const total = recoveryItems.length
    const worked = recoveryItems.filter(
      (r) => r.status === 'attempted' || r.status === 'contacted' || r.status === 'recovered' || r.status === 'lost'
    ).length
    const contacted = recoveryItems.filter(
      (r) => r.status === 'contacted' || r.status === 'recovered'
    ).length
    const totalRecovered = recoveryItems.reduce((sum, r) => sum + (r.recoveredValue || 0), 0)
    const workedPlusLocal = worked + Object.values(localStatuses).filter(
      (s) => s === 'attempted' || s === 'contacted' || s === 'recovered' || s === 'lost'
    ).length
    const recoveredPlusLocal = totalRecovered + Object.values(localRecoveredValues).reduce((sum, v) => sum + v, 0)
    return {
      created: total,
      worked: workedPlusLocal,
      workedPct: total > 0 ? ((workedPlusLocal / total) * 100).toFixed(0) : '0',
      contactPct: workedPlusLocal > 0 ? ((contacted / workedPlusLocal) * 100).toFixed(0) : '0',
      recoveredValue: recoveredPlusLocal,
    }
  }, [recoveryItems, localStatuses, localRecoveredValues])

  // Action handlers
  const openAssignDialog = (id: string) => {
    setAssignItemId(id)
    setAssignAgent('')
    setAssignDialogOpen(true)
  }

  const confirmAssign = () => {
    if (assignItemId && assignAgent) {
      const agent = agents.find((a) => a.id === assignAgent)
      setLocalAssignees((prev) => ({ ...prev, [assignItemId]: agent?.name || '' }))
      if (localStatuses[assignItemId] === 'new') {
        setLocalStatuses((prev) => ({ ...prev, [assignItemId]: 'assigned' }))
      }
    }
    setAssignDialogOpen(false)
  }

  const openOutcomeDialog = (id: string) => {
    setOutcomeItemId(id)
    setSelectedOutcome('')
    setOutcomeDialogOpen(true)
  }

  const confirmOutcome = () => {
    if (outcomeItemId && selectedOutcome) {
      setLocalOutcomes((prev) => ({
        ...prev,
        [outcomeItemId]: outcomeLabels[selectedOutcome as OutcomeType],
      }))
      if (selectedOutcome === 'contato_feito') {
        setLocalStatuses((prev) => ({ ...prev, [outcomeItemId]: 'contacted' }))
      } else if (selectedOutcome === 'agendamento' || selectedOutcome === 'venda_recuperada') {
        setLocalStatuses((prev) => ({ ...prev, [outcomeItemId]: 'recovered' }))
      } else {
        setLocalStatuses((prev) => ({ ...prev, [outcomeItemId]: 'attempted' }))
      }
    }
    setOutcomeDialogOpen(false)
  }

  const openValueDialog = (id: string) => {
    setValueItemId(id)
    setRecoveredValueInput('')
    setValueDialogOpen(true)
  }

  const confirmValue = () => {
    if (valueItemId) {
      const val = parseFloat(recoveredValueInput.replace(',', '.')) || 0
      if (val > 0) {
        setLocalRecoveredValues((prev) => ({ ...prev, [valueItemId]: val }))
        setLocalStatuses((prev) => ({ ...prev, [valueItemId]: 'recovered' }))
      }
    }
    setValueDialogOpen(false)
  }

  const openDeadlineDialog = (id: string, currentDue: string) => {
    setDeadlineItemId(id)
    setDeadlineInput(new Date(currentDue).toISOString().split('T')[0])
    setDeadlineDialogOpen(true)
  }

  const handleCopyContext = (item: (typeof recoveryItems)[0]) => {
    const text = `[Recuperação] ${item.customerName}\nMotivo: ${item.reason}\nAtendente original: ${item.originalAgentName}\nValor potencial: ${formatCurrency(item.potentialValue || 0)}\nÚltima interação: ${timeAgo(item.lastInteraction)}`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  const handleAttempt = (id: string) => {
    setLocalStatuses((prev) => ({ ...prev, [id]: 'attempted' }))
  }

  const handleReturnOriginal = (id: string) => {
    setLocalAssignees((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setLocalStatuses((prev) => ({ ...prev, [id]: 'new' }))
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        {/* Page title */}
        <div className="flex items-center gap-2">
          <RotateCcw className="h-6 w-6 text-emerald-600" />
          <h1 className="text-2xl font-bold tracking-tight">Recuperação</h1>
        </div>

        {/* Metrics cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Itens criados</CardTitle>
              <PackageOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.created}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Itens trabalhados</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.worked}{' '}
                <span className="text-sm font-normal text-muted-foreground">({metrics.workedPct}%)</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de contato</CardTitle>
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.contactPct}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Receita recuperada</CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrency(metrics.recoveredValue)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter bar */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="new">Nova</SelectItem>
                    <SelectItem value="assigned">Atribuída</SelectItem>
                    <SelectItem value="attempted">Tentada</SelectItem>
                    <SelectItem value="contacted">Contactada</SelectItem>
                    <SelectItem value="recovered">Recuperada</SelectItem>
                    <SelectItem value="lost">Perdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Responsável</label>
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.name}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="média">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="crítica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Valor recuperado</label>
                <Select value={recoveredValueFilter} onValueChange={setRecoveredValueFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="with">Com valor</SelectItem>
                    <SelectItem value="without">Sem valor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[calc(100vh-380px)]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px]">
                      <button onClick={() => handleSort('priority')} className="flex items-center font-semibold">
                        Prioridade
                        <SortIcon field="priority" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[140px]">
                      <button onClick={() => handleSort('customerName')} className="flex items-center font-semibold">
                        Cliente
                        <SortIcon field="customerName" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[150px] hidden md:table-cell">Motivo</TableHead>
                    <TableHead className="min-w-[120px] hidden lg:table-cell">
                      <button onClick={() => handleSort('originalAgentName')} className="flex items-center font-semibold">
                        Atendente original
                        <SortIcon field="originalAgentName" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[120px] hidden lg:table-cell">
                      <button onClick={() => handleSort('assignedTo')} className="flex items-center font-semibold">
                        Responsável recuperação
                        <SortIcon field="assignedTo" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[100px] hidden md:table-cell">
                      <button onClick={() => handleSort('lastInteraction')} className="flex items-center font-semibold">
                        Última interação
                        <SortIcon field="lastInteraction" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[110px] hidden sm:table-cell">
                      <button onClick={() => handleSort('potentialValue')} className="flex items-center font-semibold">
                        Valor potencial
                        <SortIcon field="potentialValue" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[110px] hidden lg:table-cell">
                      <button onClick={() => handleSort('dueAt')} className="flex items-center font-semibold">
                        Prazo recomendado
                        <SortIcon field="dueAt" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="w-[100px]">
                      <button onClick={() => handleSort('status')} className="flex items-center font-semibold">
                        Status
                        <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="w-[50px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                        Nenhum item de recuperação encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow key={item.id} className="group">
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={cn('border', priorityColors[item.priority])}>
                                {item.priority}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-medium mb-1">Fórmula de prioridade</p>
                              <p className="text-xs text-muted-foreground">
                                prioridade = intenção × urgência × valor esperado × recência × risco
                              </p>
                              <p className="text-xs mt-1">Score: {item.priorityScore}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="font-medium">{item.customerName}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {item.reason}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{item.originalAgentName}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {item.assignedTo ? (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                              {item.assignedTo}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {timeAgo(item.lastInteraction)}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell font-medium text-emerald-600">
                          {item.potentialValue ? formatCurrency(item.potentialValue) : '-'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {new Date(item.dueAt).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('border', statusColors[item.status])}>
                            {statusLabels[item.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => openAssignDialog(item.id)}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Atribuir</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => openDeadlineDialog(item.id, item.dueAt)}
                                >
                                  <CalendarClock className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Alterar prazo</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleCopyContext(item)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copiar contexto</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleAttempt(item.id)}
                                >
                                  <PhoneCall className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Registrar tentativa</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => openOutcomeDialog(item.id)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Registrar resultado</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => openValueDialog(item.id)}
                                >
                                  <DollarSign className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Informar valor recuperado</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleReturnOriginal(item.id)}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Devolver ao responsável original</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Atribuir responsável</DialogTitle>
              <DialogDescription>Selecione o agente responsável pela recuperação deste item.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Select value={assignAgent} onValueChange={setAssignAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um agente" />
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
              <Button onClick={confirmAssign} disabled={!assignAgent}>
                Atribuir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Outcome Dialog */}
        <Dialog open={outcomeDialogOpen} onOpenChange={setOutcomeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar resultado</DialogTitle>
              <DialogDescription>Informe o resultado da tentativa de contato.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              {(Object.entries(outcomeLabels) as [OutcomeType, string][]).map(([key, label]) => (
                <label
                  key={key}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50',
                    selectedOutcome === key && 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  )}
                >
                  <input
                    type="radio"
                    name="outcome"
                    value={key}
                    checked={selectedOutcome === key}
                    onChange={() => setSelectedOutcome(key)}
                    className="accent-emerald-600"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOutcomeDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmOutcome} disabled={!selectedOutcome}>
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Value Dialog */}
        <Dialog open={valueDialogOpen} onOpenChange={setValueDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Informar valor recuperado</DialogTitle>
              <DialogDescription>Digite o valor em reais que foi recuperado nesta oportunidade.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  type="text"
                  placeholder="0,00"
                  value={recoveredValueInput}
                  onChange={(e) => setRecoveredValueInput(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setValueDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmValue} disabled={!recoveredValueInput}>
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deadline Dialog */}
        <Dialog open={deadlineDialogOpen} onOpenChange={setDeadlineDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Alterar prazo recomendado</DialogTitle>
              <DialogDescription>Defina a nova data limite para esta recuperação.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                type="date"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeadlineDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setDeadlineDialogOpen(false)}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
