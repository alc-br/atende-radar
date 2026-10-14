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
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  MessagesSquare,
  RotateCcw,
} from 'lucide-react'

import {
  formatCurrency,
  timeAgo,
  getStageLabel,
  getIntentLabel,
  getSentimentLabel,
  cn,
} from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { fetchMutation, runMutation } from '@/lib/mutation'

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
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { INTENT_TAG, STAGE_TAG, SENTIMENT_TAG, scoreBadgeClass, avatarTone, initials } from './tags'

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

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="ic" aria-hidden="true" />
  return sortDir === 'asc' ? (
    <ArrowUp className="ic" aria-hidden="true" />
  ) : (
    <ArrowDown className="ic" aria-hidden="true" />
  )
}

export default function ConversationsView() {
  const selectConversation = useAppStore((s) => s.selectConversation)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  const pendingSearch = useAppStore((s) => s.pendingSearch)
  const setPendingSearch = useAppStore((s) => s.setPendingSearch)
  // T4 · atendente pode mandar à recuperação e exportar; atribuir, etiquetar e revisar é da gestão
  const canManage = can(useAppStore((s) => s.me?.role), 'conversations.manage')

  // Filters
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (pendingSearch) {
      setSearch(pendingSearch)
      setPendingSearch(null)
    }
  }, [pendingSearch, setPendingSearch])
  const [period, setPeriod] = useState('7d')
  const [filtersOpen, setFiltersOpen] = useState(false) // celular: os filtros ficam recolhidos
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
  const [hasLoaded, setHasLoaded] = useState(false) // depois da 1ª carga, refazer a busca não desmonta a tela (o campo de busca mantém o foco)

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
      setHasLoaded(true)
      setHasLoaded(true)
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
    const ids = Array.from(selectedIds)
    void runMutation(() => Promise.all(ids.map((id) =>
      fetchMutation(`/api/conversations/${id}`, {
        method: 'PATCH',
        json: { agentId: assignAgent },
      })
    )), { onSettled: fetchData })
    setAssignDialogOpen(false)
    setAssignAgent('')
    clearSelection()
  }, [clearSelection, selectedIds, assignAgent, fetchData])

  const handleAddTag = useCallback(() => {
    const ids = Array.from(selectedIds)
    const tag = tagInput.trim()
    void runMutation(() => Promise.all(ids.map((id) =>
      fetchMutation(`/api/conversations/${id}`, {
        method: 'PATCH',
        json: { addTag: tag },
      })
    )), { onSettled: fetchData })
    setTagDialogOpen(false)
    setTagInput('')
    clearSelection()
  }, [clearSelection, selectedIds, tagInput, fetchData])

  const handleBatchAction = useCallback((action: string) => {
    if (action === 'assign') setAssignDialogOpen(true)
    if (action === 'tag') setTagDialogOpen(true)
    if (action === 'review') {
      const ids = Array.from(selectedIds)
      void runMutation(() => Promise.all(ids.map((id) =>
        fetchMutation(`/api/conversations/${id}`, {
          method: 'PATCH',
          json: { markReviewed: true },
        })
      )), { onSettled: fetchData })
      clearSelection()
    }
    if (action === 'recovery') {
      // coloca as conversas escolhidas na fila de Recuperação (uma linha por conversa)
      const chosen = allConversations.filter((c) => selectedIds.has(c.id))
      Promise.all(chosen.map((c) => fetch('/api/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: c.id, reason: 'Enviado manualmente para recuperação', customerName: c.customerName, originalAgentName: c.agentName, priorityScore: 0.5 }),
      }))).then((rs) => {
        const ok = rs.filter((r) => r.ok).length
        if (ok === rs.length) toast.success(`${ok} conversa(s) enviada(s) para a fila de Recuperação.`)
        else if (ok > 0) toast.warning(`${ok} de ${rs.length} conversa(s) enviada(s) para a Recuperação. As demais falharam; tente de novo.`)
        else toast.error('Não foi possível enviar para a Recuperação.')
      }).catch(() => toast.error('Não foi possível enviar para a Recuperação.'))
      clearSelection()
    }
    if (action === 'export') {
      // exporta SÓ os dados de gestão (sem o conteúdo das mensagens), em CSV para Excel
      const chosen = allConversations.filter((c) => selectedIds.has(c.id))
      const head = ['Cliente', 'Telefone', 'Atendente', 'Situação', 'Intenção', 'Etapa', 'Valor estimado', 'Nota', 'Última atividade']
      const cell = (v: unknown) => {
        const t = String(v ?? '')
        const safe = /^[=+\-@]/.test(t) ? `'${t}` : t
        return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
      }
      const lines = [head.join(';'), ...chosen.map((c) => [c.customerName, c.customerPhone, c.agentName, c.operationalStatus, c.primaryIntent, c.inferredStage, c.potentialValue, c.score, c.lastActivity].map(cell).join(';'))]
      const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'atenderadar-conversas.csv'
      a.click()
      URL.revokeObjectURL(url)
      clearSelection()
    }
  }, [clearSelection, selectedIds, fetchData, allConversations])

  const uniqueIntents = useMemo(
    () => [...new Set(allConversations.map((c) => c.primaryIntent).filter(Boolean))].sort(),
    [allConversations]
  )
  const uniqueStages = useMemo(
    () => [...new Set(allConversations.map((c) => c.inferredStage).filter(Boolean))].sort(),
    [allConversations]
  )
  const agentList = useMemo(
    () =>
      allConversations
        .filter((c) => c.agentId)
        .reduce((acc, c) => {
          if (!acc.find((a: { id: string }) => a.id === c.agentId)) acc.push({ id: c.agentId, name: c.agentName, team: c.agentTeam })
          return acc
        }, [] as { id: string; name: string; team: string }[]),
    [allConversations]
  )

  const hasActiveFilters =
    period !== '7d' || agentFilter !== 'all' || intentFilter !== 'all' || urgencyFilter !== 'all' ||
    sentimentFilter !== 'all' || stageFilter !== 'all' || failureFilter !== 'all' || hasPotentialValue || unreadByManager

  const clearFilters = () => {
    setPeriod('7d')
    setAgentFilter('all')
    setIntentFilter('all')
    setUrgencyFilter('all')
    setSentimentFilter('all')
    setStageFilter('all')
    setFailureFilter('all')
    setHasPotentialValue(false)
    setUnreadByManager(false)
    setPage(1)
  }

  // Loading skeleton
  if (isLoading && !hasLoaded) {
    return (
      <div className="flex flex-col gap-[18px]">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-28 w-full rounded-[var(--raio)]" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="cartao vazio flex flex-col items-center gap-4" role="alert">
        <p className="font-medium vermelho">{error}</p>
        <button type="button" onClick={fetchData} className="btn btn--sm">Tentar novamente</button>
      </div>
    )
  }

  const shownCount = totalCount || allConversations.length

  const sortHeader = (field: SortField, label: string, className?: string) => (
    <th
      data-ordenar
      className={className}
      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button type="button" className="inline-flex items-center font-[inherit]" onClick={() => handleSort(field)}>
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </button>
    </th>
  )

  const pageItems = Array.from({ length: totalPages }, (_, i) => i + 1)
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

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-[18px]">
        {/* Cabeçalho */}
        <div className="cab-pagina">
          <div className="cab-pagina__titulo">
            <MessagesSquare className="ic cab-pagina__icone" aria-hidden="true" />
            <div>
              <h1>Conversas</h1>
              <p>
                {shownCount} conversa{shownCount !== 1 ? 's' : ''} encontrada{shownCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Busca + filtros */}
        <section className="cartao px-4 py-4 sm:px-[18px]" aria-label="Busca e filtros">
          <div className="flex flex-wrap items-end gap-3">
            <div data-tour="conversations-search" className="campo min-w-0 flex-1 basis-[260px] max-w-[520px]">
              <span className="rotulo !text-[12.5px] !font-medium !text-[color:var(--texto-2)] inline-flex items-center gap-1.5">
                <Filter className="ic" aria-hidden="true" /> Filtros
              </span>
              <label className="entrada-ic">
                <Search className="ic" aria-hidden="true" />
                <span className="sr-only">Buscar conversas</span>
                <input
                  className="entrada !bg-[var(--superficie-2)]"
                  type="search"
                  placeholder="Buscar por cliente, telefone ou atendente..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn md:hidden"
              data-testid="conversations-filters-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Filter className="ic" aria-hidden="true" />
              {filtersOpen ? 'Ocultar filtros' : 'Filtros'}
            </button>
            {hasActiveFilters && (
              <button type="button" className="btn btn--link filtros__limpar hidden md:inline-flex" onClick={clearFilters}>
                <RotateCcw className="ic" aria-hidden="true" />
                Limpar filtros
              </button>
            )}
          </div>

          <div
            data-tour="conversations-filters"
            className={cn(
              'filtros !p-0 mt-4 !gap-3 !grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-5 2xl:!grid-cols-9',
              filtersOpen ? 'grid' : 'hidden md:grid'
            )}
          >
            <div className="campo">
              <label htmlFor="cv-periodo">Período</label>
              <select
                id="cv-periodo"
                className="selecao"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value)
                  setPage(1)
                }}
              >
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="7d">7 dias</option>
                <option value="30d">30 dias</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>

            <div className="campo">
              <label htmlFor="cv-responsavel">Responsável</label>
              <select
                id="cv-responsavel"
                className="selecao"
                value={agentFilter}
                onChange={(e) => {
                  setAgentFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="all">Todos</option>
                {agentList.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="cv-intencao">Intenção</label>
              <select
                id="cv-intencao"
                className="selecao"
                value={intentFilter}
                onChange={(e) => {
                  setIntentFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="all">Todas</option>
                {uniqueIntents.map((i) => (
                  <option key={i} value={i}>{getIntentLabel(i)}</option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="cv-urgencia">Urgência</label>
              <select
                id="cv-urgencia"
                className="selecao"
                value={urgencyFilter}
                onChange={(e) => {
                  setUrgencyFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="all">Todas</option>
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>

            <div className="campo">
              <label htmlFor="cv-sentimento">Sentimento</label>
              <select
                id="cv-sentimento"
                className="selecao"
                value={sentimentFilter}
                onChange={(e) => {
                  setSentimentFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="all">Todos</option>
                <option value="positive">Positivo</option>
                <option value="neutral">Neutro</option>
                <option value="confused">Confuso</option>
                <option value="anxious">Ansioso</option>
                <option value="frustrated">Frustrado</option>
              </select>
            </div>

            <div className="campo">
              <label htmlFor="cv-etapa">Etapa</label>
              <select
                id="cv-etapa"
                className="selecao"
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="all">Todas</option>
                {uniqueStages.map((s) => (
                  <option key={s} value={s}>{getStageLabel(s)}</option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="cv-falha">Falha</label>
              <select
                id="cv-falha"
                className="selecao"
                value={failureFilter}
                onChange={(e) => {
                  setFailureFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="all">Todas</option>
                <option value="with_failures">Com falhas</option>
              </select>
            </div>

            <label className="flex h-10 cursor-pointer items-center gap-2 self-end rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie-2)] px-3 text-[13.5px]">
              <input
                type="checkbox"
                className="caixa"
                checked={hasPotentialValue}
                onChange={(e) => {
                  setHasPotentialValue(e.target.checked)
                  setPage(1)
                }}
              />
              <span className="whitespace-nowrap">Com valor</span>
            </label>

            <label className="flex h-10 cursor-pointer items-center gap-2 self-end rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie-2)] px-3 text-[13.5px]">
              <input
                type="checkbox"
                className="caixa"
                checked={unreadByManager}
                onChange={(e) => {
                  setUnreadByManager(e.target.checked)
                  setPage(1)
                }}
              />
              <span className="whitespace-nowrap">Não lidas</span>
            </label>

            {hasActiveFilters && (
              <button type="button" className="btn btn--link filtros__limpar col-span-full justify-self-start md:hidden" onClick={clearFilters}>
                <RotateCcw className="ic" aria-hidden="true" />
                Limpar filtros
              </button>
            )}
          </div>
        </section>

        {/* Ações em lote */}
        {selectedIds.size > 0 && (
          <div className="cartao flex flex-wrap items-center gap-2 !border-[var(--verde-300)] !bg-[var(--verde-50)] px-4 py-2.5">
            <span className="mr-2 text-[13.5px] font-semibold text-[color:var(--verde-700)]">
              {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
            </span>
            {canManage && (<>
            <button type="button" className="btn btn--sm" onClick={() => handleBatchAction('assign')}>
              <UserPlus className="ic" aria-hidden="true" />
              Atribuir atendente
            </button>
            <button type="button" className="btn btn--sm" onClick={() => handleBatchAction('tag')}>
              <Tag className="ic" aria-hidden="true" />
              Adicionar tag
            </button>
            </>)}
            <button type="button" className="btn btn--sm" onClick={() => handleBatchAction('recovery')}>
              <Send className="ic" aria-hidden="true" />
              Enviar à recuperação
            </button>
            <button type="button" className="btn btn--sm" onClick={() => handleBatchAction('export')}>
              <Download className="ic" aria-hidden="true" />
              Exportar metadados
            </button>
            {canManage && (
            <button type="button" className="btn btn--sm" onClick={() => handleBatchAction('review')}>
              <CheckCircle2 className="ic" aria-hidden="true" />
              Marcar como revisada
            </button>
            )}
            <button type="button" className="reticencias ml-auto" aria-label="Limpar seleção" onClick={clearSelection}>
              <X className="ic" aria-hidden="true" />
            </button>
          </div>
        )}

        <section className="cartao overflow-hidden" aria-label="Conversas encontradas" data-tour="conversations-table">
          {/* Celular: cada conversa é um cartão com o que importa (a tabela larga fica para telas maiores) */}
          <div className="md:hidden flex flex-col" data-testid="conversation-cards">
            {paged.length === 0 ? (
              <div className="vazio">
                <MessagesSquare className="ic" aria-hidden="true" />
                <strong>Nenhuma conversa encontrada.</strong>
              </div>
            ) : (
              paged.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className="flex flex-col gap-2 border-t border-[var(--borda)] px-4 py-3 text-left first:border-t-0 active:bg-[var(--superficie-2)]"
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="pessoa">
                      <span className={cn('av', avatarTone(c.customerName))} aria-hidden="true">{initials(c.customerName)}</span>
                      <span className="min-w-0">
                        <strong className="truncate">{c.customerName}</strong>
                        <small className="mono">{c.customerPhone}</small>
                      </span>
                    </div>
                    {c.waitingMinutes > 0 ? (
                      <span className="vermelho inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
                        <Clock className="ic" aria-hidden="true" />
                        espera {c.waitingMinutes}min
                      </span>
                    ) : (
                      <span className="suave shrink-0 text-xs">{timeAgo(c.lastActivity)}</span>
                    )}
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-1.5">
                    {c.primaryIntent && (
                      <span className={cn('tag', INTENT_TAG[c.primaryIntent] || 'tag--cinza')}>
                        {getIntentLabel(c.primaryIntent)}
                      </span>
                    )}
                    {c.potentialValue > 0 && <span className="verde-txt text-xs font-semibold">{formatCurrency(c.potentialValue)}</span>}
                    <span className="suave ml-auto text-xs">{!c.agentId && c.suggestedAgentName ? `${c.suggestedAgentName} · sugerido` : c.agentName}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Tabela (a partir de telas médias) */}
          <div className="tabela-wrap hidden md:block" tabIndex={0} role="region" aria-label="Lista de conversas">
            <table className="tabela tabela--cab-cinza">
              <thead>
                <tr>
                  <th className="chk">
                    <input
                      type="checkbox"
                      className="caixa"
                      aria-label="Selecionar todas as conversas da página"
                      checked={paged.length > 0 && selectedIds.size === paged.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {sortHeader('customerName', 'Cliente')}
                  <th className="hidden lg:table-cell">Conexão</th>
                  {sortHeader('agentName', 'Responsável')}
                  <th className="hidden xl:table-cell">Última mensagem</th>
                  {sortHeader('waitingMinutes', 'Espera')}
                  <th className="hidden lg:table-cell">Intenção</th>
                  <th className="hidden lg:table-cell">Etapa</th>
                  <th>Sentimento</th>
                  {sortHeader('alertCount', 'Alertas')}
                  {sortHeader('potentialValue', 'Valor')}
                  {sortHeader('score', 'Nota', 'centro')}
                  {sortHeader('lastActivity', 'Atividade')}
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={14}>
                      <div className="vazio">
                        <MessagesSquare className="ic" aria-hidden="true" />
                        <strong>Nenhuma conversa encontrada.</strong>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paged.map((c) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => selectConversation(c.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="caixa"
                          aria-label={`Selecionar conversa de ${c.customerName}`}
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                        />
                      </td>
                      <td>
                        <div className="pessoa">
                          <span className={cn('av', avatarTone(c.customerName))} aria-hidden="true">{initials(c.customerName)}</span>
                          <span>
                            <strong>{c.customerName}</strong>
                            <small className="mono">{c.customerPhone}</small>
                          </span>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell">
                        <span className="suave text-xs">{c.connectionName}</span>
                      </td>
                      <td>
                        {!c.agentId && c.suggestedAgentName ? (
                          // P5: identidade ainda sem confirmação — não conta nos indicadores do atendente
                          <span className="suave" data-testid="agent-suggested" title="Sugestão pela identidade do WhatsApp; confirme em Equipe › Identidades do WhatsApp">
                            {c.suggestedAgentName} · sugerido
                          </span>
                        ) : c.agentName ? (
                          <div className="pessoa">
                            <span className={cn('av av--sm', avatarTone(c.agentName))} aria-hidden="true">{initials(c.agentName)}</span>
                            <span>{c.agentName}</span>
                          </div>
                        ) : (
                          <span className="suave">-</span>
                        )}
                      </td>
                      <td className="hidden xl:table-cell">
                        <span className="suave block max-w-[180px] truncate text-xs">
                          {c.messagesCount > 0 ? `${c.messagesCount} mensagens` : '-'}
                        </span>
                      </td>
                      <td>
                        {c.waitingMinutes > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="vermelho forte inline-flex items-center gap-1 whitespace-nowrap">
                                <Clock className="ic" aria-hidden="true" />
                                {c.waitingMinutes}min
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Aguardando há {c.waitingMinutes} minutos</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="suave">-</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell">
                        {c.primaryIntent ? (
                          <span className={cn('tag', INTENT_TAG[c.primaryIntent] || 'tag--cinza')}>{getIntentLabel(c.primaryIntent)}</span>
                        ) : (
                          <span className="suave">-</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell">
                        {c.inferredStage ? (
                          <span className={cn('tag', STAGE_TAG[c.inferredStage] || 'tag--cinza')}>{getStageLabel(c.inferredStage)}</span>
                        ) : (
                          <span className="suave">-</span>
                        )}
                      </td>
                      <td>
                        {c.sentiment ? (
                          <span className={cn('tag', SENTIMENT_TAG[c.sentiment] || 'tag--cinza')}>
                            <span className="ponto" aria-hidden="true" />
                            {getSentimentLabel(c.sentiment)}
                          </span>
                        ) : (
                          <span className="suave">-</span>
                        )}
                      </td>
                      <td>
                        {c.alertCount > 0 ? (
                          <span className={cn('tag', c.alertCount >= 2 ? 'tag--vermelho' : 'tag--ambar')}>
                            <ShieldAlert className="ic" aria-hidden="true" />
                            {c.alertCount}
                          </span>
                        ) : (
                          <span className="suave">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        {c.potentialValue > 0 ? (
                          <span className="verde-txt font-semibold">{formatCurrency(c.potentialValue)}</span>
                        ) : (
                          <span className="suave">-</span>
                        )}
                      </td>
                      <td className="centro">
                        <span className={scoreBadgeClass(c.score)}>{c.score}</span>
                      </td>
                      <td>
                        <span className="suave whitespace-nowrap text-xs">{timeAgo(c.lastActivity)}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ver-conversa"
                          onClick={(e) => {
                            e.stopPropagation()
                            selectConversation(c.id)
                          }}
                        >
                          <Eye className="ic" aria-hidden="true" />
                          Ver conversa<span className="sr-only"> de {c.customerName}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {filtered.length > 0 && (
            <div className="paginacao">
              <span className="suave">
                Mostrando {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, filtered.length)} de {filtered.length}
              </span>
              {totalPages > 1 && (
                <div className="linha-flex flex-wrap !gap-1.5">
                  <button
                    type="button"
                    className="pag"
                    aria-label="Página anterior"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="ic" aria-hidden="true" />
                  </button>
                  {pageItems.map((item, i) =>
                    item === 'ellipsis' ? (
                      <span key={`e${i}`} className="suave px-1" aria-hidden="true">...</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={cn('pag', safePage === item && 'pag--atual')}
                        aria-current={safePage === item ? 'page' : undefined}
                        aria-label={`Página ${item}`}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className="pag"
                    aria-label="Próxima página"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="ic" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

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
              <SelectTrigger aria-label="Selecione o atendente">
                <SelectValue placeholder="Selecione o atendente" />
              </SelectTrigger>
              <SelectContent>
                {agentList.map((a) => (
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
              aria-label="Tag"
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
