'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  RotateCcw,
  UserPlus,
  CalendarClock,
  Copy,
  PhoneCall,
  CheckCircle2,
  DollarSign,
  Undo2,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  User,
  Flag,
  Users,
  Package,
  Search,
  MoreHorizontal,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

import {
  cn,
  formatCurrency,
  timeAgo,
} from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { mutate } from '@/lib/mutation'
import { Skeleton } from '@/components/ui/skeleton'

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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

const PER_PAGE = 20

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

// Classes de tag do pacote de design
const statusTags: Record<RecoveryStatus, string> = {
  new: 'tag--azul',
  assigned: 'tag--ambar',
  attempted: 'tag--laranja',
  contacted: 'tag--roxo',
  recovered: 'tag--verde',
  lost: 'tag--vermelho',
}

const priorityTags: Record<RecoveryPriority, string> = {
  baixa: 'tag--verde',
  'média': 'tag--ambar',
  alta: 'tag--laranja',
  crítica: 'tag--vermelho',
}

const priorityLabels: Record<RecoveryPriority, string> = {
  baixa: 'Baixa',
  'média': 'Média',
  alta: 'Alta',
  crítica: 'Crítica',
}

const AVATAR_TONES = ['av--azul', 'av--verde', 'av--roxo', 'av--laranja', 'av--vermelho']

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

function initialsOf(name: string): string {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function avatarTone(name: string): string {
  let h = 0
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function dueLabel(iso: string): { text: string; late: boolean } | null {
  const due = new Date(iso)
  if (Number.isNaN(due.getTime())) return null
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const dueDay = new Date(due)
  dueDay.setHours(0, 0, 0, 0)
  const days = Math.round((dueDay.getTime() - startOfToday.getTime()) / 86_400_000)
  if (days === 0) return { text: 'Vence hoje', late: false }
  if (days > 0) return { text: days === 1 ? 'Em 1 dia' : `Em ${days} dias`, late: false }
  return { text: days === -1 ? 'Venceu há 1 dia' : `Venceu há ${-days} dias`, late: true }
}

// --- Component ---

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="ic" aria-hidden="true" />
  return sortDir === 'asc' ? (
    <ArrowUp className="ic" aria-hidden="true" />
  ) : (
    <ArrowDown className="ic" aria-hidden="true" />
  )
}

export default function RecoveryView() {
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  const selectConversation = useAppStore((s) => s.selectConversation)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [recoveredValueFilter, setRecoveredValueFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
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

  // API state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recoveryItems, setRecoveryItems] = useState<any[]>([])
  // D3 · antes a tela pedia a 1ª página da API (20 itens) e o resto da fila nunca aparecia; agora carrega até 100
  // (os de maior prioridade) e pagina na tela
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [agentList, setAgentList] = useState<{id:string,name:string,team?:string}[]>([])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (agentFilter !== 'all') params.set('assignedTo', agentFilter)
      params.set('limit', '100')
      const res = await fetch(`/api/recovery?${params.toString()}`)
      if (!res.ok) throw new Error('Erro ao carregar recuperação')
      const data = await res.json()
      setRecoveryItems(data.items || [])
      setTotalCount(data.pagination?.total ?? (data.items || []).length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, agentFilter])

  useEffect(() => { fetchData() }, [fetchData, refreshTrigger])

  // Fetch agents for assign dialog
  useEffect(() => {
    fetch('/api/team').then(r => (r.ok ? r.json() : Promise.resolve({})) as Promise<any>).then(d => setAgentList(d.agents || [])).catch(() => {})
  }, [])

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

  const clearFilters = () => {
    setStatusFilter('all')
    setAgentFilter('all')
    setPriorityFilter('all')
    setRecoveredValueFilter('all')
    setSearch('')
  }

  // Computed data
  const items = useMemo(() => {
    const data = recoveryItems.map((item: any) => ({
      ...item,
      priority: getPriorityFromScore(item.priorityScore),
      status: item.status as RecoveryStatus,
      assignedTo: item.assignedTo,
      outcome: item.outcome,
      recoveredValue: item.recoveredValue,
    }))
    const q = search.trim().toLowerCase()

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
        if (q) {
          const hay = `${item.customerName || ''} ${item.reason || ''} ${item.originalAgentName || ''} ${item.assignedTo || ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        switch (sortField) {
          case 'priority':
            return (priorityOrder(a.priority) - priorityOrder(b.priority)) * dir
          case 'customerName':
            return (a.customerName || '').localeCompare(b.customerName || '') * dir
          case 'reason':
            return (a.reason || '').localeCompare(b.reason || '') * dir
          case 'originalAgentName':
            return (a.originalAgentName || '').localeCompare(b.originalAgentName || '') * dir
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
  }, [recoveryItems, statusFilter, agentFilter, priorityFilter, recoveredValueFilter, search, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paged = items.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  // Metrics
  const metrics = useMemo(() => {
    const total = recoveryItems.length
    const worked = recoveryItems.filter(
      (r: any) => r.status === 'attempted' || r.status === 'contacted' || r.status === 'recovered' || r.status === 'lost'
    ).length
    const contacted = recoveryItems.filter(
      (r: any) => r.status === 'contacted' || r.status === 'recovered'
    ).length
    const totalRecovered = recoveryItems.reduce((sum: number, r: any) => sum + (r.recoveredValue || 0), 0)
    return {
      created: total,
      worked,
      workedPct: total > 0 ? ((worked / total) * 100).toFixed(0) : '0',
      contactPct: worked > 0 ? ((contacted / worked) * 100).toFixed(0) : '0',
      recoveredValue: totalRecovered,
    }
  }, [recoveryItems])

  // Action handlers
  const openAssignDialog = (id: string) => {
    setAssignItemId(id)
    setAssignAgent('')
    setAssignDialogOpen(true)
  }

  const confirmAssign = () => {
    if (assignItemId && assignAgent) {
      void mutate(`/api/recovery/${assignItemId}`, {
        method: 'PATCH',
        json: { assignedTo: assignAgent, status: 'assigned' },
      }, { onSettled: fetchData })
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
      let newStatus = 'attempted'
      if (selectedOutcome === 'contato_feito') newStatus = 'contacted'
      if (selectedOutcome === 'agendamento' || selectedOutcome === 'venda_recuperada') newStatus = 'recovered'
      void mutate(`/api/recovery/${outcomeItemId}`, {
        method: 'PATCH',
        json: { status: newStatus, outcome: outcomeLabels[selectedOutcome as OutcomeType] },
      }, { onSettled: fetchData })
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
        void mutate(`/api/recovery/${valueItemId}`, {
          method: 'PATCH',
          json: { status: 'recovered', recoveredValue: val },
        }, { onSettled: fetchData })
      }
    }
    setValueDialogOpen(false)
  }

  const confirmDeadline = () => {
    if (deadlineItemId && deadlineInput) {
      void mutate(`/api/recovery/${deadlineItemId}`, {
        method: 'PATCH',
        json: { dueAt: new Date(deadlineInput).toISOString() },
      }, { onSettled: fetchData })
    }
    setDeadlineDialogOpen(false)
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
    void mutate(`/api/recovery/${id}`, {
      method: 'PATCH',
      json: { status: 'attempted', attempts: (recoveryItems.find((r: any) => r.id === id)?.attempts || 0) + 1 },
    }, { onSettled: fetchData })
  }

  const handleReturnOriginal = (id: string) => {
    void mutate(`/api/recovery/${id}`, {
      method: 'PATCH',
      json: { assignedTo: null, status: 'new' },
    }, { onSettled: fetchData })
  }

  const sortHeader = (field: SortField, label: string, className?: string) => (
    <th
      data-ordenar=""
      className={className}
      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => handleSort(field)} className="inline-flex items-center font-semibold">
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </button>
    </th>
  )

  const pageHeader = (
    <div className="cab-pagina">
      <div className="cab-pagina__titulo">
        <RotateCcw className="ic cab-pagina__icone" aria-hidden="true" />
        <div>
          <h1>Recuperação</h1>
          <p>Recupere oportunidades perdidas e aumente suas vendas pelo WhatsApp.</p>
        </div>
      </div>
    </div>
  )

  // Loading skeleton
  if (isLoading) {
    return (
      <>
        {pageHeader}
        <div className="grade grade-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        {pageHeader}
        <section className="cartao vazio" role="alert">
          <strong>{error}</strong>
          <button type="button" onClick={fetchData} className="btn mt-3">Tentar novamente</button>
        </section>
      </>
    )
  }

  return (
    <TooltipProvider>
      <>
        {pageHeader}

        {/* Metrics cards */}
        <section data-tour="recovery-metrics" className="grade grade-4" aria-label="Indicadores de recuperação">
          <article className="cartao kpi-h">
            <span className="kpi__icone tom-verde"><Package className="ic" aria-hidden="true" /></span>
            <div>
              <p className="kpi-h__rotulo">Itens criados</p>
              <p className="kpi-h__valor">{metrics.created}</p>
            </div>
          </article>
          <article className="cartao kpi-h">
            <span className="kpi__icone tom-azul"><Users className="ic" aria-hidden="true" /></span>
            <div>
              <p className="kpi-h__rotulo">Itens trabalhados</p>
              <p className="kpi-h__valor">{metrics.worked} <small>({metrics.workedPct}%)</small></p>
            </div>
          </article>
          <article className="cartao kpi-h">
            <span className="kpi__icone tom-vermelho"><PhoneCall className="ic" aria-hidden="true" /></span>
            <div>
              <p className="kpi-h__rotulo">Taxa de contato</p>
              <p className="kpi-h__valor">{metrics.contactPct}%</p>
            </div>
          </article>
          <article className="cartao kpi-h">
            <span className="kpi__icone tom-verde"><DollarSign className="ic" aria-hidden="true" /></span>
            <div>
              <p className="kpi-h__rotulo">Receita recuperada</p>
              <p className="kpi-h__valor">{formatCurrency(metrics.recoveredValue)}</p>
            </div>
          </article>
        </section>

        {/* Filter bar */}
        <section className="cartao filtros-rec" aria-label="Filtros">
          <div className="campo">
            <label htmlFor="rec-f-status">Status</label>
            <div className="entrada-ic">
              <Filter className="ic" aria-hidden="true" />
              <select id="rec-f-status" className="selecao" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Todas</option>
                <option value="new">Nova</option>
                <option value="assigned">Atribuída</option>
                <option value="attempted">Tentada</option>
                <option value="contacted">Contactada</option>
                <option value="recovered">Recuperada</option>
                <option value="lost">Perdida</option>
              </select>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="rec-f-resp">Responsável</label>
            <div className="entrada-ic">
              <User className="ic" aria-hidden="true" />
              <select id="rec-f-resp" className="selecao" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
                <option value="all">Todos</option>
                {agentList.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="rec-f-prio">Prioridade</label>
            <div className="entrada-ic">
              <Flag className="ic" aria-hidden="true" />
              <select id="rec-f-prio" className="selecao" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="all">Todas</option>
                <option value="crítica">Crítica</option>
                <option value="alta">Alta</option>
                <option value="média">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="rec-f-valor">Valor recuperado</label>
            <div className="entrada-ic">
              <DollarSign className="ic" aria-hidden="true" />
              <select id="rec-f-valor" className="selecao" value={recoveredValueFilter} onChange={(e) => setRecoveredValueFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="with">Com valor</option>
                <option value="without">Sem valor</option>
              </select>
            </div>
          </div>
          <button className="btn btn--lg" type="button" onClick={clearFilters}>
            <RotateCcw className="ic" aria-hidden="true" />Limpar filtros
          </button>
        </section>

        {/* Table */}
        <section className="cartao" data-tour="recovery-table" aria-labelledby="rec-t-oport">
          <div className="cartao__cab cab-com-busca">
            <div>
              <h2 id="rec-t-oport">Oportunidades de recuperação</h2>
              <p aria-live="polite">{items.length} {items.length === 1 ? 'item encontrado' : 'itens encontrados'}</p>
            </div>
            <div className="linha-flex cab-com-busca__acoes">
              <div className="entrada-ic busca-local">
                <Search className="ic" aria-hidden="true" />
                <input
                  className="entrada"
                  type="search"
                  aria-label="Buscar cliente, motivo ou atendente"
                  placeholder="Buscar cliente, motivo ou atendente..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Itens de recuperação">
            <table className="tabela tabela--folgada tabela--rec">
              <thead>
                <tr>
                  {sortHeader('priority', 'Prioridade')}
                  {sortHeader('customerName', 'Cliente')}
                  {sortHeader('reason', 'Motivo')}
                  {sortHeader('originalAgentName', 'Atendente original')}
                  {sortHeader('assignedTo', 'Responsável recuperação')}
                  {sortHeader('lastInteraction', 'Última interação')}
                  {sortHeader('potentialValue', 'Valor potencial')}
                  {sortHeader('dueAt', 'Prazo recomendado')}
                  {sortHeader('status', 'Status')}
                  <th className="centro">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="vazio">
                      Nenhum item de recuperação encontrado.
                    </td>
                  </tr>
                ) : (
                  paged.map((item) => {
                    const due = item.dueAt ? dueLabel(item.dueAt) : null
                    return (
                      <tr key={item.id}>
                        <td>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn('tag', priorityTags[item.priority as RecoveryPriority])}>
                                <span className="ponto" />{priorityLabels[item.priority as RecoveryPriority]}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-medium mb-1">Fórmula de prioridade</p>
                              <p className="text-xs text-muted-foreground">
                                prioridade = intenção × urgência × valor esperado × recência × risco
                              </p>
                              <p className="text-xs mt-1">Score: {item.priorityScore}</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td>
                          <div className="pessoa">
                            <span className={cn('av', avatarTone(item.customerName))} aria-hidden="true">{initialsOf(item.customerName)}</span>
                            <span><strong>{item.customerName}</strong></span>
                          </div>
                        </td>
                        <td className="suave">{item.reason}</td>
                        <td>
                          {item.originalAgentName ? (
                            <div className="pessoa">
                              <span className={cn('av', avatarTone(item.originalAgentName))} aria-hidden="true">{initialsOf(item.originalAgentName)}</span>
                              <span><strong>{item.originalAgentName}</strong></span>
                            </div>
                          ) : (
                            <span className="suave">-</span>
                          )}
                        </td>
                        <td>
                          {item.assignedTo ? (
                            <span className="responsavel">
                              <span className={cn('av av--sm', avatarTone(item.assignedTo))} aria-hidden="true">{initialsOf(item.assignedTo)}</span>
                              <span><b>{item.assignedTo}</b></span>
                            </span>
                          ) : (
                            <span className="suave">-</span>
                          )}
                        </td>
                        <td>
                          <span className="pilha">
                            {timeAgo(item.lastInteraction)}
                            <small>{formatDateTime(item.lastInteraction)}</small>
                          </span>
                        </td>
                        <td className={item.potentialValue ? 'verde-txt forte' : 'suave'}>
                          {item.potentialValue ? formatCurrency(item.potentialValue) : '-'}
                        </td>
                        <td>
                          {item.dueAt ? (
                            <span className="pilha">
                              {new Date(item.dueAt).toLocaleDateString('pt-BR')}
                              {due && <small className={due.late ? 'vermelho' : undefined}>{due.text}</small>}
                            </span>
                          ) : (
                            <span className="suave">-</span>
                          )}
                        </td>
                        <td>
                          <span className={cn('tag', statusTags[item.status as RecoveryStatus])}>
                            <span className="ponto" />{statusLabels[item.status as RecoveryStatus] ?? item.status}
                          </span>
                        </td>
                        <td className="centro">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="reticencias reticencias--caixa"
                                aria-label={`Ações para ${item.customerName}`}
                              >
                                <MoreHorizontal className="ic" aria-hidden="true" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openAssignDialog(item.id)}>
                                <UserPlus className="w-4 h-4 mr-2" aria-hidden="true" />Atribuir
                              </DropdownMenuItem>
                              {item.conversationId && (
                                <DropdownMenuItem onClick={() => selectConversation(item.conversationId)}>
                                  <MessageSquare className="w-4 h-4 mr-2" aria-hidden="true" />Abrir conversa
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openDeadlineDialog(item.id, item.dueAt)}>
                                <CalendarClock className="w-4 h-4 mr-2" aria-hidden="true" />Alterar prazo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCopyContext(item)}>
                                <Copy className="w-4 h-4 mr-2" aria-hidden="true" />Copiar contexto
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleAttempt(item.id)}>
                                <PhoneCall className="w-4 h-4 mr-2" aria-hidden="true" />Registrar tentativa
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openOutcomeDialog(item.id)}>
                                <CheckCircle2 className="w-4 h-4 mr-2" aria-hidden="true" />Registrar resultado
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openValueDialog(item.id)}>
                                <DollarSign className="w-4 h-4 mr-2" aria-hidden="true" />Informar valor recuperado
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleReturnOriginal(item.id)}>
                                <Undo2 className="w-4 h-4 mr-2" aria-hidden="true" />Devolver ao responsável original
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {items.length > 0 && (
            <div className="paginacao">
              <span className="suave">
                Mostrando {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, items.length)} de {items.length}
                {totalCount > recoveryItems.length && ` (os ${recoveryItems.length} de maior prioridade, de ${totalCount}; use os filtros para ver os demais)`}
              </span>
              {totalPages > 1 && (
                <div className="linha-flex flex-wrap !gap-1.5">
                  <button type="button" className="pag" aria-label="Página anterior" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))}>
                    <ChevronLeft className="ic" aria-hidden="true" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={cn('pag', safePage === n && 'pag--atual')}
                      aria-current={safePage === n ? 'page' : undefined}
                      aria-label={`Página ${n}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button type="button" className="pag" aria-label="Próxima página" disabled={safePage >= totalPages} onClick={() => setPage(Math.min(totalPages, safePage + 1))}>
                    <ChevronRight className="ic" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Atribuir responsável</DialogTitle>
              <DialogDescription>Selecione o agente responsável pela recuperação deste item.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Select value={assignAgent} onValueChange={setAssignAgent}>
                <SelectTrigger aria-label="Selecione um agente">
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  {agentList.map((a) => (
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
                  aria-label="Valor recuperado em reais"
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
                aria-label="Novo prazo"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeadlineDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmDeadline}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    </TooltipProvider>
  )
}
