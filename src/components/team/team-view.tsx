'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
  Star,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatPhone } from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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

// --- Component ---

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3" />
  )
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-emerald-600" />
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-600" />
  return <Minus className="h-4 w-4 text-muted-foreground" />
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

  if (isLoading) {
    return <div className="flex flex-col gap-4 p-4 lg:p-6"><Skeleton className="h-8 w-48" />{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
  }
  if (error) return <div className="flex flex-col items-center justify-center h-96 gap-4"><p className="text-destructive font-medium">{error}</p><button onClick={fetchData} className="text-sm text-primary underline">Tentar novamente</button></div>

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600'
    if (score >= 70) return 'text-amber-600'
    return 'text-red-600'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-50 dark:bg-emerald-900/20'
    if (score >= 70) return 'bg-amber-50 dark:bg-amber-900/20'
    return 'bg-red-50 dark:bg-red-900/20'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', away: 'Ausente' }
    return labels[status] || status
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
      away: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    }
    return colors[status] || 'bg-muted text-muted-foreground'
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = { gestor: 'Gestor', supervisor: 'Supervisor', atendente: 'Atendente' }
    return labels[role] || role
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Page title */}
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6 text-emerald-600" />
        <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de agentes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAgents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Nota média</CardTitle>
            <Star className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', getScoreColor(avgScore))}>{avgScore}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo médio de resposta</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgResponseTime} min</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[calc(100vh-300px)]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[180px]">
                    <button onClick={() => handleSort('name')} className="flex items-center font-semibold">
                      Nome
                      <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[100px] hidden md:table-cell">
                    <button onClick={() => handleSort('team')} className="flex items-center font-semibold">
                      Equipe
                      <SortIcon field="team" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[130px] hidden lg:table-cell">Identidade WhatsApp</TableHead>
                  <TableHead className="w-[80px] hidden sm:table-cell">Estado</TableHead>
                  <TableHead className="w-[80px]">
                    <button onClick={() => handleSort('conversations')} className="flex items-center font-semibold">
                      Conversas
                      <SortIcon field="conversations" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="w-[70px]">
                    <button onClick={() => handleSort('score')} className="flex items-center font-semibold">
                      Nota
                      <SortIcon field="score" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="w-[100px] hidden md:table-cell">
                    <button onClick={() => handleSort('avgResponseTime')} className="flex items-center font-semibold">
                      Tempo mediano
                      <SortIcon field="avgResponseTime" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="w-[90px] hidden lg:table-cell">
                    <button onClick={() => handleSort('opportunities')} className="flex items-center font-semibold">
                      Oport. atendidas
                      <SortIcon field="opportunities" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="w-[90px] hidden lg:table-cell">
                    <button onClick={() => handleSort('opportunitiesLost')} className="flex items-center font-semibold">
                      Oport. perdidas
                      <SortIcon field="opportunitiesLost" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="w-[100px] hidden md:table-cell">
                    <button onClick={() => handleSort('promises')} className="flex items-center font-semibold">
                      Promessas
                      <SortIcon field="promises" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                  <TableHead className="w-[60px]">
                    <button onClick={() => handleSort('trend')} className="flex items-center font-semibold">
                      Tendência
                      <SortIcon field="trend" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAgents.map((agent) => {
                  const initials = agent.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                  const phoneMasked = formatPhone('1' + agent.id.split('_')[1].padStart(3, '0').slice(-3) + '00')

                  return (
                    <TableRow
                      key={agent.id}
                      className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
                      onClick={() => selectAgent(agent.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={cn('text-xs font-medium', getScoreBg(agent.score), getScoreColor(agent.score))}>
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            <div className="text-xs text-muted-foreground">{getRoleLabel(agent.role)}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-400">
                          {agent.team}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground font-mono text-xs">
                        {phoneMasked}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className={cn('border', getStatusColor(agent.status))}>
                          {getStatusLabel(agent.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{agent.conversations}</TableCell>
                      <TableCell>
                        <span className={cn('font-bold text-lg', getScoreColor(agent.score))}>{agent.score}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {agent.avgResponseTime} min
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-medium text-emerald-600">
                        {agent.opportunities}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className={agent.opportunitiesLost > 5 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                          {agent.opportunitiesLost}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className={agent.promisesKept === agent.promisesTotal ? 'text-emerald-600' : 'text-amber-600'}>
                          {agent.promisesKept}/{agent.promisesTotal}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TrendIcon trend={agent.trend} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
