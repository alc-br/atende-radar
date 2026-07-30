'use client'

import { useMemo, useState } from 'react'
import {
  MessageSquare,
  Clock,
  Users,
  AlertTriangle,
  ShieldAlert,
  DollarSign,
  Star,
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  BarChart3,
  Activity,
  AlertOctagon,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts'

import {
  Card,
  CardContent,
  CardDescription,
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
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'

import {
  dashboardSummary,
  conversations,
  agents,
  auditFunnel,
  failuresByType,
  evolutionData,
  formatCurrency,
  timeAgo,
  getSeverityColor,
  getIntentLabel,
} from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────

interface KpiCardData {
  label: string
  value: string | number
  change: number
  icon: React.ElementType
  tooltip: string
  href?: string
  prefix?: string
  suffix?: string
}

// ─── Period options ──────────────────────────────────────────────────

const periodOptions = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'custom', label: 'Personalizado' },
] as const

// ─── Severity color mapping for failures chart ───────────────────────

const severityChartColor: Record<string, string> = {
  critical: 'var(--destructive)',
  high: 'var(--chart-4)',
  medium: 'var(--chart-2)',
  low: 'var(--chart-3)',
}

// ─── KPI definitions ─────────────────────────────────────────────────

function buildKpiCards(): KpiCardData[] {
  const s = dashboardSummary
  return [
    {
      label: 'Conversas Iniciadas',
      value: s.conversationsStarted,
      change: s.conversationsStartedChange,
      icon: MessageSquare,
      tooltip: 'Total de conversas iniciadas por clientes no período selecionado.',
      href: '/conversations',
    },
    {
      label: 'Clientes Aguardando',
      value: s.customersWaiting,
      change: s.customersWaitingChange,
      icon: Clock,
      tooltip: 'Clientes aguardando resposta da equipe há mais de 5 minutos.',
      href: '/conversations?filter=waiting',
    },
    {
      label: 'Tempo Mediano 1ª Resposta',
      value: s.medianFirstResponse,
      change: s.medianFirstResponseChange,
      icon: Timer,
      tooltip: 'Tempo mediano entre a primeira mensagem do cliente e a primeira resposta do atendente.',
      suffix: 'min',
    },
    {
      label: 'Oportunidades Detectadas',
      value: s.opportunitiesDetected,
      change: s.opportunitiesDetectedChange,
      icon: TrendingUp,
      tooltip: 'Conversas onde foi identificada intenção de compra ou contratação.',
      href: '/conversations?filter=opportunities',
    },
    {
      label: 'Oportunidades em Risco',
      value: s.opportunitiesAtRisk,
      change: s.opportunitiesAtRiskChange,
      icon: AlertTriangle,
      tooltip: 'Oportunidades com alto risco de perda por demora, falha ou abandono.',
      href: '/alerts',
    },
    {
      label: 'Promessas Vencidas',
      value: s.overduePromises,
      change: s.overduePromisesChange,
      icon: ShieldAlert,
      tooltip: 'Promessas de retorno/orçamento não cumpridas dentro do prazo combinado.',
      href: '/alerts?filter=overdue',
    },
    {
      label: 'Valor em Risco',
      value: formatCurrency(s.potentialValueAtRisk),
      change: s.potentialValueAtRiskChange,
      icon: DollarSign,
      tooltip: 'Soma do valor potencial das oportunidades em risco de perda.',
    },
    {
      label: 'Nota Geral',
      value: s.overallScore,
      change: s.overallScoreChange,
      icon: Star,
      tooltip: 'Nota composta (0-100) baseada em tempo de resposta, taxa de conversão e qualidade do atendimento.',
      suffix: '/100',
    },
  ]
}

// ─── Contextual change color (green when improvement) ────────────────

function contextualChangeColor(label: string, change: number): boolean {
  // These metrics are "lower is better"
  const lowerIsBetter = [
    'Clientes Aguardando',
    'Tempo Mediano 1ª Resposta',
    'Oportunidades em Risco',
    'Promessas Vencidas',
    'Valor em Risco',
  ]
  if (lowerIsBetter.includes(label)) {
    return change <= 0 // green when decrease
  }
  return change >= 0 // green when increase
}

// ─── Trend arrow ─────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <TrendingUp className="size-3.5 text-emerald-500" />
  if (trend === 'down') return <TrendingDown className="size-3.5 text-red-500" />
  return <Minus className="size-3.5 text-muted-foreground" />
}

// ─── Chart configs ───────────────────────────────────────────────────

const funnelChartConfig = {
  count: { label: 'Quantidade' },
  Conversas: { label: 'Conversas', color: 'var(--chart-1)' },
  Oportunidades: { label: 'Oportunidades', color: 'var(--chart-3)' },
  'Pedidos de preço': { label: 'Pedidos de preço', color: 'var(--chart-2)' },
  Propostas: { label: 'Propostas', color: 'var(--chart-1)' },
  'Vendas confirmadas': { label: 'Vendas', color: 'var(--chart-3)' },
  'Perdas confirmadas': { label: 'Perdas', color: 'var(--destructive)' },
  'Sem desfecho': { label: 'Sem desfecho', color: 'var(--muted-foreground)' },
}

const failuresChartConfig = {
  count: { label: 'Ocorrências' },
}

const evolutionChartConfig = {
  score: { label: 'Nota Geral', color: 'var(--chart-1)' },
  responseTime: { label: 'Tempo Resposta (min)', color: 'var(--chart-3)' },
  abandonment: { label: 'Abandonos', color: 'var(--destructive)' },
  valueAtRisk: { label: 'Valor em Risco (R$)', color: 'var(--chart-2)' },
}

// ─── Component ───────────────────────────────────────────────────────

export default function DashboardView() {
  const { period, setPeriod, selectConversation } = useAppStore()
  const [prioridadesCount] = useState(10)

  const kpiCards = useMemo(() => buildKpiCards(), [])

  // Top conversations by risk (highest urgency + lowest score)
  const priorityConversations = useMemo(() => {
    return [...conversations]
      .filter((c) => c.hasOpportunity && c.operationalStatus !== 'won')
      .sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 }
        const uDiff = (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2)
        if (uDiff !== 0) return uDiff
        return a.score - b.score
      })
      .slice(0, prioridadesCount)
  }, [prioridadesCount])

  // Evolution data formatted for pt-BR dates
  const formattedEvolution = useMemo(() => {
    return evolutionData.map((d) => ({
      ...d,
      dateLabel: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
    }))
  }, [])

  // Agent performance with computed values
  const agentPerformance = useMemo(() => {
    return agents.map((a) => {
      const criticalFailures = Math.floor(Math.random() * 4)
      const unfulfilledPromises = a.promisesTotal - a.promisesKept
      return {
        ...a,
        criticalFailures,
        unfulfilledPromises,
      }
    })
  }, [])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* ─── Header + Period Filter ──────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-muted-foreground text-sm">
            Acompanhe as métricas de atendimento em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="text-muted-foreground size-4" />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          const isImproved = contextualChangeColor(kpi.label, kpi.change)
          return (
            <Tooltip key={kpi.label}>
              <TooltipTrigger asChild>
                <Card
                  className="group relative cursor-pointer gap-0 py-4 transition-shadow hover:shadow-md"
                >
                  <CardContent className="flex flex-col gap-1 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs font-medium leading-none">
                        {kpi.label}
                      </span>
                      <Icon className="text-muted-foreground/60 size-3.5" />
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-xl font-bold tabular-nums leading-tight">
                        {kpi.prefix}
                        {kpi.value}
                        {kpi.suffix && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {kpi.suffix}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 text-xs font-medium',
                          kpi.change === 0 && 'text-muted-foreground',
                          kpi.change !== 0 && isImproved && 'text-emerald-600 dark:text-emerald-400',
                          kpi.change !== 0 && !isImproved && 'text-red-500 dark:text-red-400'
                        )}
                      >
                        {kpi.change > 0 && (
                          <ArrowUpRight className="size-3" />
                        )}
                        {kpi.change < 0 && (
                          <ArrowDownRight className="size-3" />
                        )}
                        {kpi.change === 0 && <Minus className="size-3" />}
                        {Math.abs(kpi.change)}%
                      </span>
                    </div>
                  </CardContent>
                  {kpi.href && (
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <ChevronRight className="text-muted-foreground size-3.5" />
                    </div>
                  )}
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px]">
                {kpi.tooltip}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* ─── Prioridades Agora Table ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="text-destructive size-4" />
            <CardTitle className="text-base">Prioridades Agora</CardTitle>
          </div>
          <CardDescription>
            Top {prioridadesCount} conversas com maior risco de perda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Atendente</TableHead>
                <TableHead className="hidden lg:table-cell">Motivo</TableHead>
                <TableHead>Espera</TableHead>
                <TableHead className="hidden sm:table-cell">Valor Potencial</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {priorityConversations.map((conv) => (
                <TableRow key={conv.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{conv.customerName}</span>
                      <span className="text-muted-foreground text-xs">
                        {conv.customerPhone}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {conv.agentName}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', getSeverityColor(conv.urgency === 'critical' || conv.urgency === 'high' ? conv.urgency : 'medium'))}
                    >
                      {getIntentLabel(conv.primaryIntent)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        conv.waitingMinutes > 30
                          ? 'text-red-500'
                          : conv.waitingMinutes > 10
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                      )}
                    >
                      {conv.waitingMinutes > 0
                        ? `${conv.waitingMinutes}min`
                        : timeAgo(conv.lastActivity)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {conv.potentialValue > 0
                      ? formatCurrency(conv.potentialValue)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => selectConversation(conv.id)}
                    >
                      <Eye className="size-3.5" />
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Charts Row: Funil + Falhas ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Funil Auditado */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-primary size-4" />
              <CardTitle className="text-base">Funil Auditado</CardTitle>
            </div>
            <CardDescription>
              Distribuição das conversas por estágio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={funnelChartConfig} className="h-[280px] w-full">
              <BarChart
                data={auditFunnel}
                layout="vertical"
                margin={{ left: 0, right: 20, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  dataKey="stage"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel />}
                  cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                  {auditFunnel.map((entry, index) => (
                    <Cell key={`funnel-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Falhas por Tipo */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-chart-4 size-4" />
              <CardTitle className="text-base">Falhas por Tipo</CardTitle>
            </div>
            <CardDescription>
              Principais falhas detectadas no período
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={failuresChartConfig} className="h-[280px] w-full">
              <BarChart
                data={failuresByType}
                layout="vertical"
                margin={{ left: 0, right: 20, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  dataKey="type"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel />}
                  cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                  {failuresByType.map((entry, index) => (
                    <Cell
                      key={`failure-${index}`}
                      fill={severityChartColor[entry.severity] || 'var(--chart-1)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ─── Team Performance Table ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="text-primary size-4" />
            <CardTitle className="text-base">Desempenho da Equipe</CardTitle>
          </div>
          <CardDescription>
            Comparativo de indicadores por atendente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Equipe</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead className="hidden md:table-cell">Tempo Mediano</TableHead>
                <TableHead className="hidden lg:table-cell">Oportunidades</TableHead>
                <TableHead className="hidden lg:table-cell">Falhas Críticas</TableHead>
                <TableHead className="hidden md:table-cell">Promessas</TableHead>
                <TableHead className="w-12">Tendência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentPerformance.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <span className="font-medium">{agent.name}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="text-[10px]">
                      {agent.team}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        agent.score >= 80
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : agent.score >= 70
                            ? 'text-amber-600'
                            : 'text-red-500'
                      )}
                    >
                      {agent.score}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell tabular-nums">
                    {agent.avgResponseTime}min
                  </TableCell>
                  <TableCell className="hidden lg:table-cell tabular-nums">
                    {agent.opportunities}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {agent.criticalFailures > 0 ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px]"
                      >
                        {agent.criticalFailures}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">0</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell tabular-nums">
                    <span
                      className={cn(
                        'text-xs',
                        agent.unfulfilledPromises > 0
                          ? 'text-red-500 font-medium'
                          : 'text-muted-foreground'
                      )}
                    >
                      {agent.promisesKept}/{agent.promisesTotal}
                    </span>
                  </TableCell>
                  <TableCell>
                    <TrendArrow trend={agent.trend} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Evolution Chart ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="text-primary size-4" />
            <CardTitle className="text-base">Evolução</CardTitle>
          </div>
          <CardDescription>
            Tendência dos últimos 14 dias
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={evolutionChartConfig} className="h-[300px] w-full">
            <LineChart
              data={formattedEvolution}
              margin={{ left: 0, right: 10, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                yAxisId="score"
                orientation="left"
                domain={[50, 100]}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                yAxisId="time"
                orientation="right"
                domain={[0, 'auto']}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="score"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--chart-1)' }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="time"
                type="monotone"
                dataKey="responseTime"
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--chart-3)' }}
                activeDot={{ r: 5 }}
                strokeDasharray="5 5"
              />
              <Line
                yAxisId="time"
                type="monotone"
                dataKey="abandonment"
                stroke="var(--destructive)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--destructive)' }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="time"
                type="monotone"
                dataKey="valueAtRisk"
                stroke="var(--chart-2)"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="2 4"
              />
            </LineChart>
          </ChartContainer>
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-[2px]" style={{ backgroundColor: 'var(--chart-1)' }} />
              Nota Geral
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-[2px]" style={{ backgroundColor: 'var(--chart-3)' }} />
              Tempo de Resposta
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-[2px]" style={{ backgroundColor: 'var(--destructive)' }} />
              Abandonos
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-[2px] border border-dashed" style={{ backgroundColor: 'var(--chart-2)' }} />
              Valor em Risco
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}