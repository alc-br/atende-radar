'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  Users,
  Star,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  MoreVertical,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'

// --- Types ---

type SortField =
  | 'name'
  | 'team'
  | 'identity'
  | 'status'
  | 'conversations'
  | 'score'
  | 'avgResponseTime'
  | 'opportunities'
  | 'opportunitiesLost'
  | 'promises'
  | 'trend'

type SortDir = 'asc' | 'desc'

const AVATAR_TONES = ['av--laranja', 'av--verde', 'av--roxo', 'av--azul', 'av--vermelho']

function avatarTone(name: string): string {
  let h = 0
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}

function notaClass(score: number): string {
  if (score >= 80) return 'nota--alta'
  if (score >= 70) return 'nota--media'
  return 'nota--baixa'
}

function scoreTextClass(score: number): string {
  if (score >= 80) return 'verde-txt'
  if (score >= 70) return 'laranja-txt'
  return 'vermelho'
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

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up') return <span className="verde-txt"><TrendingUp className="ic ic-tend" aria-hidden="true" /><span className="sr-only">Em alta</span></span>
  if (trend === 'down') return <span className="vermelho"><TrendingDown className="ic ic-tend" aria-hidden="true" /><span className="sr-only">Em queda</span></span>
  return <span className="suave"><Minus className="ic ic-tend" aria-hidden="true" /><span className="sr-only">Estável</span></span>
}

export default function TeamView() {
  const selectAgent = useAppStore((s) => s.selectAgent)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)

  const [sortField, setSortField] = useState<SortField>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentsData, setAgentsData] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      const res = await fetch('/api/team')
      if (!res.ok) throw new Error('Erro ao carregar equipe')
      const data = await res.json()
      setAgentsData(data.agents || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData, refreshTrigger])

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

  const sortedAgents = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...agentsData].sort((a, b) => {
      switch (sortField) {
        case 'name':
          return a.name.localeCompare(b.name) * dir
        case 'team':
          return (a.team || '').localeCompare(b.team || '') * dir
        case 'identity':
          return 0
        case 'status':
          return a.status.localeCompare(b.status) * dir
        case 'conversations':
          return (a.conversations - b.conversations) * dir
        case 'score':
          return (a.score - b.score) * dir
        case 'avgResponseTime':
          return (a.avgResponseTime - b.avgResponseTime) * dir
        case 'opportunities':
          return (a.opportunities - b.opportunities) * dir
        case 'opportunitiesLost':
          return (a.opportunitiesLost - b.opportunitiesLost) * dir
        case 'promises':
          const aRatio = a.promisesTotal > 0 ? a.promisesKept / a.promisesTotal : 0
          const bRatio = b.promisesTotal > 0 ? b.promisesKept / b.promisesTotal : 0
          return (aRatio - bRatio) * dir
        case 'trend': {
          const trendOrder: Record<string, number> = { up: 0, stable: 1, down: 2 }
          return ((trendOrder[a.trend] ?? 1) - (trendOrder[b.trend] ?? 1)) * dir
        }
        default:
          return 0
      }
    })
  }, [agentsData, sortField, sortDir])

  // Summary stats
  const totalAgents = agentsData.length
  const avgScore = agentsData.length > 0 ? Math.round(agentsData.reduce((sum: number, a: any) => sum + (a.score || 0), 0) / agentsData.length) : 0
  const avgResponseTime = agentsData.length > 0 ? (agentsData.reduce((sum: number, a: any) => sum + (a.avgResponseTime || 0), 0) / agentsData.length).toFixed(1) : '0.0'

  const pageHeader = (
    <div className="cab-pagina">
      <div className="cab-pagina__titulo">
        <span className="cab-pagina__icone cab-pagina__icone--caixa"><Users className="ic" aria-hidden="true" /></span>
        <div>
          <h1>Equipe</h1>
          <p>Acompanhe o desempenho da sua equipe de atendimento no WhatsApp.</p>
        </div>
      </div>
    </div>
  )

  if (isLoading) {
    return (
      <>
        {pageHeader}
        <div className="grade grade-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
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

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', away: 'Ausente' }
    return labels[status] || status
  }

  const getStatusTag = (status: string) => {
    const tags: Record<string, string> = { active: 'tag--verde', inactive: 'tag--cinza', away: 'tag--ambar' }
    return tags[status] || 'tag--cinza'
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', supervisor: 'Supervisor', atendente: 'Atendente' }
    return labels[role] || role
  }

  const sortHeader = (field: SortField, label: string, centered = false) => (
    <th
      data-ordenar=""
      className={centered ? 'centro' : undefined}
      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => handleSort(field)} className="inline-flex items-center font-semibold">
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </button>
    </th>
  )

  return (
    <>
      {pageHeader}

      {/* Summary stats */}
      <section data-tour="team-summary" className="grade grade-3" aria-label="Resumo da equipe">
        <article className="cartao kpi-h kpi-h--grande">
          <span className="kpi__icone tom-verde"><Users className="ic" aria-hidden="true" /></span>
          <div>
            <p className="kpi-h__rotulo">Total de agentes</p>
            <p className="kpi-h__valor">{totalAgents}</p>
          </div>
        </article>
        <article className="cartao kpi-h kpi-h--grande">
          <span className="kpi__icone tom-laranja"><Star className="ic" aria-hidden="true" /></span>
          <div>
            <p className="kpi-h__rotulo">Nota média</p>
            <p className={cn('kpi-h__valor', scoreTextClass(avgScore))}>{avgScore}</p>
          </div>
        </article>
        <article className="cartao kpi-h kpi-h--grande">
          <span className="kpi__icone tom-azul"><Clock className="ic" aria-hidden="true" /></span>
          <div>
            <p className="kpi-h__rotulo">Tempo médio de resposta</p>
            <p className="kpi-h__valor">{avgResponseTime.replace('.', ',')} min</p>
          </div>
        </article>
      </section>

      {/* Table */}
      <section className="cartao" data-tour="team-table" aria-labelledby="team-t-desemp">
        <div className="cartao__cab cab-equipe">
          <div className="linha-flex">
            <span className="cab-pagina__icone cab-pagina__icone--caixa mini-caixa"><BarChart3 className="ic" aria-hidden="true" /></span>
            <div>
              <h2 id="team-t-desemp">Desempenho da Equipe</h2>
              <p>Visão detalhada do desempenho de cada agente.</p>
            </div>
          </div>
        </div>
        <div className="cartao__corpo">
          <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Desempenho dos agentes">
            <table className="tabela tabela--cab-cinza tabela--equipe">
              <thead>
                <tr>
                  {sortHeader('name', 'Nome')}
                  {sortHeader('team', 'Equipe')}
                  <th>Identidade WhatsApp</th>
                  {sortHeader('status', 'Estado')}
                  {sortHeader('conversations', 'Conversas', true)}
                  {sortHeader('score', 'Nota', true)}
                  {sortHeader('avgResponseTime', 'Tempo mediano', true)}
                  {sortHeader('opportunities', 'Oport. atendidas', true)}
                  {sortHeader('opportunitiesLost', 'Oport. perdidas', true)}
                  {sortHeader('promises', 'Promessas', true)}
                  {sortHeader('trend', 'Tendência', true)}
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="vazio">Nenhum agente encontrado.</td>
                  </tr>
                ) : (
                  sortedAgents.map((agent) => {
                    const initials = agent.name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                    const promisesOk = agent.promisesKept === agent.promisesTotal
                    return (
                      <tr
                        key={agent.id}
                        className="cursor-pointer"
                        onClick={() => selectAgent(agent.id)}
                      >
                        <td>
                          <button
                            type="button"
                            className="pessoa pessoa--forte text-left"
                            onClick={(e) => { e.stopPropagation(); selectAgent(agent.id) }}
                          >
                            <span className={cn('av', avatarTone(agent.name))} aria-hidden="true">{initials}</span>
                            <span><strong>{agent.name}</strong><small>{getRoleLabel(agent.role)}</small></span>
                          </button>
                        </td>
                        <td>
                          {agent.team ? <span className="tag tag--azul tag--lg">{agent.team}</span> : <span className="suave">—</span>}
                        </td>
                        <td className="mono suave">{agent.whatsappIdentity || '—'}</td>
                        <td>
                          <span className={cn('tag tag--lg', getStatusTag(agent.status))}>
                            <span className="ponto" />{getStatusLabel(agent.status)}
                          </span>
                        </td>
                        <td className="centro">{agent.conversations}</td>
                        <td className="centro">
                          <span className={cn('nota nota--lg', notaClass(agent.score))}>{agent.score}</span>
                        </td>
                        <td className="centro">{String(agent.avgResponseTime).replace('.', ',')} min</td>
                        <td className="centro verde-txt forte">{agent.opportunities}</td>
                        <td className={cn('centro', agent.opportunitiesLost > 5 && 'vermelho forte')}>{agent.opportunitiesLost}</td>
                        <td className="centro">
                          <span className={cn('nota', promisesOk ? 'nota--alta' : 'nota--media')}>
                            {agent.promisesKept}/{agent.promisesTotal}
                          </span>
                        </td>
                        <td className="centro">
                          <TrendIcon trend={agent.trend} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="reticencias"
                            aria-label={`Ver perfil de ${agent.name}`}
                            onClick={(e) => { e.stopPropagation(); selectAgent(agent.id) }}
                          >
                            <MoreVertical className="ic" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
