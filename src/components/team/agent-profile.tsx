'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ArrowLeft,
  Star,
  MessageSquare,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Mail,
  Users,
  Handshake,
  DollarSign,
  CalendarClock,
  CircleDot,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'

import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// --- Types ---

interface ScoreDimension {
  key: string
  label: string
  weight: number
  score: number
}

// --- Helpers ---

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = { gestor: 'Gestor', supervisor: 'Supervisor', atendente: 'Atendente' }
  return labels[role] || role
}

const getRoleColor = (role: string) => {
  const colors: Record<string, string> = {
    gestor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    supervisor: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    atendente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  }
  return colors[role] || 'bg-muted text-muted-foreground'
}

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

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
    away: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  }
  return colors[status] || 'bg-muted text-muted-foreground'
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', away: 'Ausente' }
  return labels[status] || status
}

const FINDING_TYPE_LABELS: Record<string, string> = {
  no_response: 'Sem resposta',
  slow_response: 'Resposta lenta',
  ignored_question: 'Pergunta ignorada',
  pending_quote: 'Orçamento pendente',
  overdue_promise: 'Promessa vencida',
  abandoned_lead: 'Lead abandonado',
  customer_frustrated: 'Cliente frustrado',
}

interface AgentStats {
  avgResponseTime: number
  opportunities: number
  opportunitiesLost: number
  promisesKept: number
  promisesTotal: number
  questionsAnswered: number
  questionsTotal: number
}

// Strengths derived from real per-agent metrics
function getStrengths(stats: AgentStats): string[] {
  const items: string[] = []
  if (stats.avgResponseTime > 0 && stats.avgResponseTime <= 5) {
    items.push(`Tempo de resposta rápido (${stats.avgResponseTime.toFixed(1)} min em média)`)
  }
  if (stats.promisesTotal > 0 && stats.promisesKept / stats.promisesTotal >= 0.8) {
    items.push(`Alta taxa de promessas cumpridas (${Math.round((stats.promisesKept / stats.promisesTotal) * 100)}%)`)
  }
  if (stats.opportunities > 0 && stats.opportunitiesLost === 0) {
    items.push('Nenhuma oportunidade perdida no período')
  }
  if (stats.questionsTotal > 0 && stats.questionsAnswered / stats.questionsTotal >= 0.9) {
    items.push('Responde quase todas as perguntas dos clientes')
  }
  return items.length > 0 ? items : ['Sem destaques suficientes no período']
}

// Failures derived from real audit findings for this agent's conversations
function getFailures(findings: { type: string }[]): string[] {
  if (findings.length === 0) return ['Nenhuma falha registrada no período']
  const counts = new Map<string, number>()
  for (const f of findings) {
    counts.set(f.type, (counts.get(f.type) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => `${count}x ${FINDING_TYPE_LABELS[type] || type}`)
}

// --- Component ---

export default function AgentProfile() {
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const setView = useAppStore((s) => s.setView)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<any>(null)

  const fetchData = useCallback(async () => {
    if (!selectedAgentId) return
    setIsLoading(true); setError(null)
    try {
      const res = await fetch(`/api/team/${selectedAgentId}`)
      if (!res.ok) throw new Error('Erro ao carregar perfil')
      const data = await res.json()
      setProfileData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally { setIsLoading(false) }
  }, [selectedAgentId])

  useEffect(() => { fetchData() }, [fetchData, refreshTrigger])

  const agent = profileData ? {
    id: profileData.id,
    name: profileData.name,
    email: profileData.email,
    role: profileData.role,
    team: profileData.team || '',
    avatar: null,
    status: profileData.status,
    score: profileData.metrics?.score || 0,
    conversations: profileData.metrics?.conversations || 0,
    avgResponseTime: profileData.metrics?.avgResponseTime || 0,
    opportunities: profileData.metrics?.opportunities || 0,
    opportunitiesLost: profileData.metrics?.opportunitiesLost || 0,
    promisesKept: profileData.metrics?.promisesKept || 0,
    promisesTotal: profileData.metrics?.promisesTotal || 0,
    questionsAnswered: profileData.metrics?.questionsAnswered || 0,
    questionsTotal: profileData.metrics?.questionsTotal || 0,
    trend: profileData.metrics?.trend || 'stable',
  } : {
    id: '', name: '', email: '', role: '', team: '', avatar: null, status: '', score: 0,
    conversations: 0, avgResponseTime: 0, opportunities: 0, opportunitiesLost: 0,
    promisesKept: 0, promisesTotal: 0, questionsAnswered: 0, questionsTotal: 0, trend: 'stable' as const,
  }

  // Score dimensions derived from real per-agent metrics
  const scoreDimensions: ScoreDimension[] = useMemo(() => {
    const base = agent.score
    const velocidade = Math.min(100, Math.max(0, Math.round(100 - agent.avgResponseTime * 8)))
    const oppDenom = agent.opportunities + agent.opportunitiesLost
    const oportunidades = oppDenom > 0 ? Math.round((agent.opportunities / oppDenom) * 100) : base
    const pendencias = agent.promisesTotal > 0 ? Math.round((agent.promisesKept / agent.promisesTotal) * 100) : base
    const qualidade = agent.questionsTotal > 0 ? Math.round((agent.questionsAnswered / agent.questionsTotal) * 100) : base
    return [
      { key: 'velocidade', label: 'Velocidade', weight: 30, score: velocidade },
      { key: 'oportunidades', label: 'Oportunidades', weight: 25, score: oportunidades },
      { key: 'pendencias', label: 'Pendências', weight: 20, score: pendencias },
      { key: 'qualidade', label: 'Qualidade', weight: 15, score: qualidade },
      { key: 'recuperacao', label: 'Recuperação', weight: 10, score: base },
    ]
  }, [agent.score, agent.avgResponseTime, agent.opportunities, agent.opportunitiesLost, agent.promisesKept, agent.promisesTotal, agent.questionsAnswered, agent.questionsTotal])

  const recentConversations: any[] = profileData?.recentConversations || []

  const exemplaryConversations = useMemo(() => {
    return [...recentConversations]
      .filter((c) => c.score >= 80)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => ({ id: c.id, title: `${c.customerName} — ${c.primaryIntent || c.inferredStage || 'conversa'}`, score: c.score }))
  }, [recentConversations])

  const toReviewConversations = useMemo(() => {
    return [...recentConversations]
      .filter((c) => c.score < 70)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((c) => ({ id: c.id, title: `${c.customerName} — ${c.primaryIntent || c.inferredStage || 'conversa'}`, reason: `Nota ${c.score}` }))
  }, [recentConversations])

  const promises = useMemo(() => {
    const raw: any[] = profileData?.promises || []
    const now = Date.now()
    return raw.map((p) => {
      let status: 'fulfilled' | 'overdue' | 'pending' = 'pending'
      if (p.status === 'kept') status = 'fulfilled'
      else if (p.dueDate && new Date(p.dueDate).getTime() < now) status = 'overdue'
      return { id: p.id, text: p.text, status, dueDate: p.dueDate }
    })
  }, [profileData])

  const opportunities = useMemo(() => {
    const raw: any[] = profileData?.opportunities || []
    return raw.map((o) => ({ id: o.id, intent: o.intent, value: o.value, status: o.status }))
  }, [profileData])

  const findings: { type: string; severity: string; status: string }[] = profileData?.findings || []

  const initials = agent.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // Chart data from API scoreEvolution
  const chartData = useMemo(() => {
    if (!profileData?.scoreEvolution?.length) return []
    return profileData.scoreEvolution.map((d: any) => ({
      date: d.date,
      score: d.score,
    }))
  }, [profileData?.scoreEvolution])

  const strengths = getStrengths(agent)
  const failures = getFailures(findings)

  // --- Early returns AFTER all hooks ---
  if (isLoading) return <div className="flex flex-col gap-4 p-4 md:p-6"><Skeleton className="h-8 w-40" /><Skeleton className="h-64 w-full rounded-lg" /><Skeleton className="h-64 w-full rounded-lg" /></div>
  if (error) return <div className="flex flex-col items-center justify-center h-96 gap-4"><p className="text-destructive font-medium">{error}</p><button onClick={() => setView('team')} className="text-sm text-primary underline">Voltar</button></div>
  if (!profileData) return null

  const getOpportunityStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      discovery: 'Descoberta', qualification: 'Qualificação', evaluation: 'Avaliação',
      price: 'Preço', proposal: 'Proposta', negotiation: 'Negociação',
      decision: 'Decisão', won: 'Ganha', lost: 'Perdida',
    }
    return labels[status] || status
  }

  const getOpportunityStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      won: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      lost: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      negotiation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      price: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    }
    return colors[status] || 'bg-muted text-muted-foreground'
  }

  const getPromiseStatusIcon = (status: string) => {
    switch (status) {
      case 'fulfilled': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      case 'overdue': return <XCircle className="h-4 w-4 text-red-600" />
      default: return <CircleDot className="h-4 w-4 text-amber-600" />
    }
  }

  const getPromiseStatusLabel = (status: string) => {
    const labels: Record<string, string> = { fulfilled: 'Cumprida', overdue: 'Vencida', pending: 'Pendente' }
    return labels[status] || status
  }

  const getPromiseStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      fulfilled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    }
    return colors[status] || 'bg-muted text-muted-foreground'
  }

  const TrendIcon = () => {
    if (agent.trend === 'up') return <TrendingUp className="h-5 w-5 text-emerald-600" />
    if (agent.trend === 'down') return <TrendingDown className="h-5 w-5 text-red-600" />
    return <Minus className="h-5 w-5 text-muted-foreground" />
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        Nenhum agente selecionado.
      </div>
    )
  }

  return (
    <TooltipProvider>
      <ScrollArea className="h-[calc(100vh-80px)]">
        <div className="flex flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">
          {/* Back button */}
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setView('team')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Equipe
          </Button>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className={cn('text-xl font-bold', getScoreBg(agent.score), getScoreColor(agent.score))}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
                <Badge className={cn('border', getRoleColor(agent.role))} variant="outline">
                  {getRoleLabel(agent.role)}
                </Badge>
                <Badge variant="outline" className="border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-400">
                  {agent.team}
                </Badge>
                <Badge variant="outline" className={cn('border', getStatusColor(agent.status))}>
                  {getStatusLabel(agent.status)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {agent.email}
              </div>
            </div>
            <TrendIcon />
          </div>

          <Separator />

          {/* Summary cards row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className={cn('text-3xl font-bold', getScoreColor(agent.score))}>{agent.score}</div>
                <p className="text-xs text-muted-foreground mt-1">Nota atual</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold">{agent.conversations}</div>
                <p className="text-xs text-muted-foreground mt-1">Conversas no período</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold">{agent.avgResponseTime}<span className="text-sm font-normal text-muted-foreground">min</span></div>
                <p className="text-xs text-muted-foreground mt-1">Tempo mediano resp.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold text-emerald-600">{agent.opportunities}</div>
                <p className="text-xs text-muted-foreground mt-1">Oportunidades</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className={cn('text-3xl font-bold', agent.opportunitiesLost > 5 ? 'text-red-600' : 'text-amber-600')}>{agent.opportunitiesLost}</div>
                <p className="text-xs text-muted-foreground mt-1">Falhas críticas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className={cn('text-3xl font-bold', agent.promisesKept === agent.promisesTotal ? 'text-emerald-600' : 'text-amber-600')}>
                  {agent.promisesKept}/{agent.promisesTotal}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Promessas cumpridas</p>
              </CardContent>
            </Card>
          </div>

          {/* Evolution mini chart + Score breakdown side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Evolution chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolução da nota (14 dias)</CardTitle>
                <CardDescription>Score geral por dia</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) => v.slice(5)}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <YAxis
                        domain={[30, 100]}
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelFormatter={(v: string) => new Date(v + 'T12:00:00').toLocaleDateString('pt-BR')}
                        formatter={(value: number) => [value.toFixed(0), 'Nota']}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(var(--chart-1))"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: 'hsl(var(--chart-1))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Score breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Composição da nota</CardTitle>
                <CardDescription>Detalhamento por dimensão</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {scoreDimensions.map((dim) => (
                  <div key={dim.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{dim.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{dim.weight}%</span>
                        <span className={cn('font-semibold', getScoreColor(dim.score))}>{dim.score}</span>
                      </div>
                    </div>
                    <Progress value={dim.score} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Strengths + Failures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Strengths */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Pontos fortes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span className="text-sm">{s}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Failures */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  Falhas recorrentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {failures.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <span className="text-sm">{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Exemplary conversations + Conversations to review */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  Conversas exemplares
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {exemplaryConversations.map((c) => (
                    <li key={c.id}>
                      <button className="flex items-center gap-2 text-sm text-teal-600 hover:underline w-full text-left">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span>{c.title}</span>
                        <Badge variant="outline" className={cn('border ml-auto shrink-0', getScoreBg(c.score), getScoreColor(c.score))}>
                          {c.score}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Conversas para revisar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {toReviewConversations.map((c) => (
                    <li key={c.id}>
                      <button className="flex items-center gap-2 text-sm text-teal-600 hover:underline w-full text-left">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1">{c.title}</span>
                        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 shrink-0">
                          {c.reason}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Promises section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Handshake className="h-4 w-4 text-teal-600" />
                Promessas
              </CardTitle>
              <CardDescription>Acompanhamento de promessas feitas ao cliente</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {promises.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                    {getPromiseStatusIcon(p.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.text}</p>
                      <p className="text-xs text-muted-foreground">
                        Prazo: {new Date(p.dueDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn('border shrink-0', getPromiseStatusColor(p.status))}>
                      {getPromiseStatusLabel(p.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Opportunities section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-600" />
                Oportunidades
              </CardTitle>
              <CardDescription>Oportunidades identificadas nas conversas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {opportunities.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{o.intent}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 shrink-0">
                      R$ {o.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <Badge variant="outline" className={cn('border shrink-0', getOpportunityStatusColor(o.status))}>
                      {getOpportunityStatusLabel(o.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </TooltipProvider>
  )
}
