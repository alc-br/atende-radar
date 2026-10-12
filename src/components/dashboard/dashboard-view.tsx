'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  MessageSquareMore,
  Users,
  Clock,
  Target,
  CircleAlert,
  CalendarX,
  DollarSign,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CalendarDays,
  ChartBarBig,
  TriangleAlert,
  ChartLine,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
} from 'recharts'

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
import { Skeleton } from '@/components/ui/skeleton'

import { formatCurrency, getIntentLabel, cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { canOpenView } from '@/lib/permissions'
import { SetupChecklist } from './setup-checklist'

// ─── Tipos ───────────────────────────────────────────────────────────

interface Summary {
  conversationsStarted: number; conversationsStartedChange: number
  customersWaiting: number; customersWaitingChange: number
  medianFirstResponse: number; medianFirstResponseChange: number
  opportunitiesDetected: number; opportunitiesDetectedChange: number
  opportunitiesAtRisk: number; opportunitiesAtRiskChange: number
  overduePromises: number; overduePromisesChange: number
  potentialValueAtRisk: number; potentialValueAtRiskChange: number
  overallScore: number; overallScoreChange: number
}

interface DashboardData {
  summary: Summary | null
  funnel: { stage: string; count: number; color: string }[]
  failures: { type: string; count: number; severity: string }[]
  evolution: { date: string; score: number; responseTime: number; abandonment: number; valueAtRisk: number }[]
  priorities: {
    id: string; customerName: string; customerPhone: string; agentName: string
    agentTeam: string; primaryIntent: string; urgency: string; waitingMinutes: number
    potentialValue: number; score: number; riskScore: number
  }[]
  teamPerformance: {
    id: string; name: string; team: string; score: number; avgResponseTime: number
    opportunities: number; criticalFailures: number; promisesKept: number
    promisesTotal: number; trend: 'up' | 'down' | 'stable'
  }[]
}

interface KpiCardData {
  label: string
  value: string
  unit?: string
  change: number
  /** Métricas em que cair é bom (tempo de espera, risco...). */
  lowerIsBetter?: boolean
  icon: React.ElementType
  tone: string
  tooltip: string
}

// ─── Formatação ──────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('pt-BR')

function formatWait(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}min` : `${h}h`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

const AVATAR_TONES = ['av--azul', 'av--verde', 'av--laranja', 'av--roxo', 'av--vermelho']
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}

function urgencyTag(urgency: string): string {
  if (urgency === 'critical') return 'tag--vermelho'
  if (urgency === 'high') return 'tag--laranja'
  return 'tag--ambar'
}

function scoreClass(score: number): string {
  if (score >= 80) return 'nota--alta'
  if (score >= 70) return 'nota--media'
  return 'nota--baixa'
}

// ─── Cores dos gráficos (paleta do pacote de design) ─────────────────

const FUNNEL_COLORS: Record<string, string> = {
  Conversas: '#0f7a4a',
  Oportunidades: '#34b977',
  'Pedidos de preço': '#f2803a',
  Propostas: '#f5c84a',
  'Vendas confirmadas': '#1aa89a',
  'Perdas confirmadas': '#e5383f',
  'Sem desfecho': '#7b847f',
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#e8343d',
  high: '#e76d2c',
  medium: '#e98a3f',
  low: '#7b847f',
}

const EVOLUTION_COLORS = {
  score: '#13865a',
  responseTime: '#2f74e8',
  abandonment: '#e5383f',
  valueAtRisk: '#f2803a',
}

const AXIS_TICK = { fontSize: 11.5, fill: 'var(--suave)' }

// ─── KPIs ────────────────────────────────────────────────────────────

function buildKpiCards(s: Summary): KpiCardData[] {
  return [
    {
      label: 'Conversas iniciadas',
      value: fmt(s.conversationsStarted),
      change: s.conversationsStartedChange,
      icon: MessageSquareMore,
      tone: 'tom-verde',
      tooltip: 'Total de conversas iniciadas por clientes no período selecionado.',
    },
    {
      label: 'Clientes aguardando',
      value: fmt(s.customersWaiting),
      change: s.customersWaitingChange,
      lowerIsBetter: true,
      icon: Users,
      tone: 'tom-azul',
      tooltip: 'Clientes aguardando resposta da equipe há mais de 5 minutos.',
    },
    {
      label: 'Tempo mediano da 1ª resposta',
      value: fmt(s.medianFirstResponse),
      unit: 'min',
      change: s.medianFirstResponseChange,
      lowerIsBetter: true,
      icon: Clock,
      tone: 'tom-azul',
      tooltip: 'Tempo mediano entre a primeira mensagem do cliente e a primeira resposta do atendente.',
    },
    {
      label: 'Oportunidades detectadas',
      value: fmt(s.opportunitiesDetected),
      change: s.opportunitiesDetectedChange,
      icon: Target,
      tone: 'tom-verde',
      tooltip: 'Conversas onde foi identificada intenção de compra ou contratação.',
    },
    {
      label: 'Oportunidades em risco',
      value: fmt(s.opportunitiesAtRisk),
      change: s.opportunitiesAtRiskChange,
      lowerIsBetter: true,
      icon: CircleAlert,
      tone: 'tom-vermelho',
      tooltip: 'Oportunidades com alto risco de perda por demora, falha ou abandono.',
    },
    {
      label: 'Promessas vencidas',
      value: fmt(s.overduePromises),
      change: s.overduePromisesChange,
      lowerIsBetter: true,
      icon: CalendarX,
      tone: 'tom-ambar',
      tooltip: 'Promessas de retorno/orçamento não cumpridas dentro do prazo combinado.',
    },
    {
      label: 'Valor em risco',
      value: formatCurrency(s.potentialValueAtRisk),
      change: s.potentialValueAtRiskChange,
      lowerIsBetter: true,
      icon: DollarSign,
      tone: 'tom-laranja',
      tooltip: 'Soma do valor potencial das oportunidades em risco de perda.',
    },
    {
      label: 'Nota geral',
      value: fmt(s.overallScore),
      unit: '/ 100',
      change: s.overallScoreChange,
      icon: Star,
      tone: 'tom-verde',
      tooltip: 'Nota composta (0-100) baseada em tempo de resposta, taxa de conversão e qualidade do atendimento.',
    },
  ]
}

function TrendCell({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return (
      <span className="verde-txt">
        <TrendingUp className="ic ic-tend" aria-hidden="true" />
        <span className="sr-only">Em alta</span>
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span className="vermelho">
        <TrendingDown className="ic ic-tend" aria-hidden="true" />
        <span className="sr-only">Em queda</span>
      </span>
    )
  }
  return (
    <span className="suave">
      <Minus className="ic ic-tend" aria-hidden="true" />
      <span className="sr-only">Estável</span>
    </span>
  )
}

// ─── Configuração dos gráficos (rótulos do tooltip) ──────────────────

const funnelChartConfig = { count: { label: 'Conversas' } }
const failuresChartConfig = { count: { label: 'Ocorrências' } }
const evolutionChartConfig = {
  score: { label: 'Nota geral', color: EVOLUTION_COLORS.score },
  responseTime: { label: 'Tempo de resposta (min)', color: EVOLUTION_COLORS.responseTime },
  abandonment: { label: 'Abandonos', color: EVOLUTION_COLORS.abandonment },
  valueAtRisk: { label: 'Valor em risco (R$)', color: EVOLUTION_COLORS.valueAtRisk },
}

type EvolutionMode = 'indicadores' | 'risco'

const EVOLUTION_SERIES: Record<EvolutionMode, (keyof typeof EVOLUTION_COLORS)[]> = {
  indicadores: ['score', 'responseTime', 'abandonment'],
  risco: ['valueAtRisk'],
}

// ─── Componente ──────────────────────────────────────────────────────

export default function DashboardView() {
  const { period, selectConversation, selectAgent, setView, refreshTrigger } = useAppStore()
  const me = useAppStore((s) => s.me)
  const role = me?.role
  const teamScoped = role === 'supervisor' && !!me?.team
  const canOpenConversation = canOpenView(role, 'conversation-detail')
  const canOpenAlerts = canOpenView(role, 'alerts')
  const canOpenTeam = canOpenView(role, 'team')
  const canOpenAgent = canOpenView(role, 'agent-profile')

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiData, setApiData] = useState<DashboardData | null>(null)
  const [evolutionMode, setEvolutionMode] = useState<EvolutionMode>('indicadores')

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard?period=${period}`)
      if (!res.ok) throw new Error('Erro ao carregar dashboard')
      const data = await res.json()
      setApiData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData, refreshTrigger])

  const kpiCards = useMemo(() => {
    if (!apiData?.summary) return []
    return buildKpiCards(apiData.summary)
  }, [apiData?.summary])

  const priorities = useMemo(() => apiData?.priorities.slice(0, 10) ?? [], [apiData?.priorities])

  const formattedEvolution = useMemo(() => {
    if (!apiData?.evolution) return []
    return apiData.evolution.map((d) => ({
      ...d,
      dateLabel: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
    }))
  }, [apiData?.evolution])

  const funnelHeight = Math.max(160, (apiData?.funnel.length ?? 0) * 34 + 30)
  const failuresHeight = Math.max(160, (apiData?.failures.length ?? 0) * 34 + 30)

  const header = (
    <div className="cab-pagina">
      <div>
        <h1>Visão Geral</h1>
        <p>Acompanhe o desempenho do atendimento, identifique oportunidades e recupere mais vendas pelo WhatsApp.</p>
      </div>
    </div>
  )

  if (isLoading) {
    return (
      <>
        {header}
        <div className="kpis kpis--8" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px] w-full rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-[14px]" />
        <div className="grade grade-2">
          <Skeleton className="h-80 w-full rounded-[14px]" />
          <Skeleton className="h-80 w-full rounded-[14px]" />
        </div>
        <Skeleton className="h-80 w-full rounded-[14px]" />
      </>
    )
  }

  if (error) {
    return (
      <>
        {header}
        <div className="cartao vazio" role="alert">
          <TriangleAlert className="ic mx-auto block" aria-hidden="true" />
          <strong>{error}</strong>
          <button type="button" onClick={fetchData} className="btn btn--contorno-verde mt-3">
            Tentar novamente
          </button>
        </div>
      </>
    )
  }

  if (!apiData) return null

  return (
    <>
      {header}

      {teamScoped && (
        <div role="note" data-testid="team-scope-note" className="aviso aviso--ambar">
          <span className="aviso__ic">
            <CircleAlert className="ic" aria-hidden="true" />
          </span>
          <p>
            Os números desta tela são da organização inteira. Conversas, Alertas, Recuperação e Equipe mostram só a sua equipe ({me?.team}) e o que ainda não tem atendente.
          </p>
        </div>
      )}

      <SetupChecklist />

      {/* ─── Indicadores ─────────────────────────────────────────── */}
      <section className="kpis kpis--8" aria-label="Indicadores do período" data-tour="dashboard-kpis">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          const improved = kpi.lowerIsBetter ? kpi.change <= 0 : kpi.change >= 0
          const trendClass = kpi.change === 0 ? 'neutro' : improved ? 'sobe' : 'desce'
          return (
            <Tooltip key={kpi.label}>
              <TooltipTrigger asChild>
                <article className="cartao kpi">
                  <span className={cn('kpi__icone', kpi.tone)}>
                    <Icon className="ic" aria-hidden="true" />
                  </span>
                  <p className="kpi__rotulo">{kpi.label}</p>
                  <p className="kpi__valor">
                    {kpi.value}
                    {kpi.unit && <small> {kpi.unit}</small>}
                  </p>
                  <p className={cn('kpi__variacao', trendClass)}>
                    {kpi.change > 0 && <ArrowUp className="ic" aria-hidden="true" />}
                    {kpi.change < 0 && <ArrowDown className="ic" aria-hidden="true" />}
                    {kpi.change === 0 && <Minus className="ic" aria-hidden="true" />}
                    {kpi.change > 0 ? '+' : kpi.change < 0 ? '-' : ''}
                    {fmt(Math.abs(kpi.change))}%
                  </p>
                  <p className="kpi__ref">vs. período anterior</p>
                </article>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px]">
                {kpi.tooltip}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </section>

      {/* ─── Prioridades ─────────────────────────────────────────── */}
      <section className="cartao" aria-labelledby="t-prioridades" data-tour="dashboard-priorities">
        <div className="cartao__cab">
          <div>
            <h2 id="t-prioridades">
              <span className="selo-icone tom-vermelho-solido">
                <TriangleAlert className="ic" aria-hidden="true" />
              </span>
              Prioridades Agora
              <span className="contador-pill">{priorities.length}</span>
            </h2>
            <p>Conversas com maior risco de perda que precisam de atenção imediata.</p>
          </div>
          {canOpenAlerts && (
            <button type="button" className="btn" onClick={() => setView('alerts')}>
              Ver todas <ArrowRight className="ic" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="cartao__corpo">
          {priorities.length === 0 ? (
            <div className="vazio">
              <strong>Nenhuma conversa em risco agora.</strong>
              Quando um cliente estiver perto de ser perdido, ele aparece aqui.
            </div>
          ) : (
            <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Conversas prioritárias">
              <table className="tabela tabela--prioridades">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Atendente</th>
                    <th>Motivo</th>
                    <th>Tempo de espera</th>
                    <th>Valor potencial</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {priorities.map((conv) => (
                    <tr key={conv.id}>
                      <td>
                        <div className="pessoa">
                          <span className={cn('av', avatarTone(conv.customerName))} aria-hidden="true">
                            {initials(conv.customerName)}
                          </span>
                          <span>
                            <strong>{conv.customerName}</strong>
                            <small className="mono">{conv.customerPhone}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="pessoa">
                          <span className={cn('av av--sm', avatarTone(conv.agentName))} aria-hidden="true">
                            {initials(conv.agentName)}
                          </span>
                          <span>{conv.agentName}</span>
                        </div>
                      </td>
                      <td>
                        {conv.primaryIntent ? (
                          <span className={cn('tag', urgencyTag(conv.urgency))}>
                            {getIntentLabel(conv.primaryIntent)}
                          </span>
                        ) : (
                          <span className="suave">—</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'num',
                          conv.waitingMinutes > 30 && 'vermelho forte',
                          conv.waitingMinutes <= 0 && 'suave',
                        )}
                      >
                        {formatWait(conv.waitingMinutes)}
                      </td>
                      <td className="num">
                        {conv.potentialValue > 0 ? formatCurrency(conv.potentialValue) : <span className="suave">—</span>}
                      </td>
                      <td>
                        {canOpenConversation ? (
                          <button
                            type="button"
                            className="ver-conversa"
                            onClick={() => selectConversation(conv.id)}
                            aria-label={`Ver conversa de ${conv.customerName}`}
                          >
                            <Eye className="ic" aria-hidden="true" />
                            Ver conversa
                          </button>
                        ) : (
                          <span className="suave">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ─── Funil e falhas ──────────────────────────────────────── */}
      <div className="grade grade-2">
        <section className="cartao" aria-labelledby="t-funil">
          <div className="cartao__cab">
            <div>
              <h2 id="t-funil">
                <ChartBarBig className="ic verde-txt" aria-hidden="true" />
                Funil Auditado
              </h2>
              <p>Distribuição das conversas por estágio no atendimento.</p>
            </div>
          </div>
          <div className="cartao__corpo">
            <div className="grafico">
              <ChartContainer config={funnelChartConfig} className="aspect-auto w-full" style={{ height: funnelHeight }}>
                <BarChart data={apiData.funnel} layout="vertical" margin={{ left: 0, right: 44, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="var(--borda)" strokeDasharray="3 4" />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: 'var(--borda-forte)' }} tickLine={false} allowDecimals={false} />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    width={130}
                    tick={{ ...AXIS_TICK, fill: 'var(--texto-2)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={{ fill: 'var(--superficie-2)' }} />
                  <Bar dataKey="count" radius={4} barSize={18}>
                    {apiData.funnel.map((entry) => (
                      <Cell key={entry.stage} fill={FUNNEL_COLORS[entry.stage] ?? '#16a063'} />
                    ))}
                    <LabelList dataKey="count" position="right" fill="var(--texto)" fontSize={12} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          </div>
        </section>

        <section className="cartao" aria-labelledby="t-falhas">
          <div className="cartao__cab">
            <div>
              <h2 id="t-falhas">
                <TriangleAlert className="ic vermelho" aria-hidden="true" />
                Falhas por Tipo
              </h2>
              <p>Principais falhas detectadas no período.</p>
            </div>
          </div>
          <div className="cartao__corpo">
            {apiData.failures.length === 0 ? (
              <div className="vazio">
                <strong>Nenhuma falha detectada.</strong>
                As falhas encontradas nas conversas aparecem aqui.
              </div>
            ) : (
              <div className="grafico">
                <ChartContainer config={failuresChartConfig} className="aspect-auto w-full" style={{ height: failuresHeight }}>
                  <BarChart data={apiData.failures} layout="vertical" margin={{ left: 0, right: 44, top: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke="var(--borda)" strokeDasharray="3 4" />
                    <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: 'var(--borda-forte)' }} tickLine={false} allowDecimals={false} />
                    <YAxis
                      dataKey="type"
                      type="category"
                      width={130}
                      tick={{ ...AXIS_TICK, fill: 'var(--texto-2)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={{ fill: 'var(--superficie-2)' }} />
                    <Bar dataKey="count" radius={4} barSize={18}>
                      {apiData.failures.map((entry, index) => (
                        <Cell key={`${entry.type}-${index}`} fill={SEVERITY_COLORS[entry.severity] ?? '#e98a3f'} />
                      ))}
                      <LabelList dataKey="count" position="right" fill="var(--texto)" fontSize={12} fontWeight={700} />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ─── Desempenho da equipe ────────────────────────────────── */}
      <section className="cartao" aria-labelledby="t-equipe" data-tour="dashboard-team-perf">
        <div className="cartao__cab">
          <div>
            <h2 id="t-equipe">
              <Users className="ic verde-txt" aria-hidden="true" />
              Desempenho da Equipe
            </h2>
            <p>Comparativo de indicadores por atendente.</p>
          </div>
          {canOpenTeam && (
            <button type="button" className="btn btn--contorno-verde" onClick={() => setView('team')}>
              Ver relatório completo <ArrowRight className="ic" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="cartao__corpo">
          {apiData.teamPerformance.length === 0 ? (
            <div className="vazio">
              <strong>Nenhum atendente para comparar.</strong>
              Os indicadores por atendente aparecem aqui quando houver equipe ativa.
            </div>
          ) : (
            <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Desempenho por atendente">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Atendente</th>
                    <th>Equipe</th>
                    <th className="centro">Nota</th>
                    <th>Tempo médio de resposta</th>
                    <th className="centro">Oportunidades</th>
                    <th className="centro">Oportunidades perdidas</th>
                    <th className="centro">Promessas</th>
                    <th className="centro">Tendência</th>
                  </tr>
                </thead>
                <tbody>
                  {apiData.teamPerformance.map((agent) => {
                    const person = (
                      <>
                        <span className={cn('av av--sm', avatarTone(agent.name))} aria-hidden="true">
                          {initials(agent.name)}
                        </span>
                        <span>{agent.name}</span>
                      </>
                    )
                    const unfulfilled = agent.promisesTotal - agent.promisesKept
                    return (
                      <tr key={agent.id}>
                        <td>
                          {canOpenAgent ? (
                            <button
                              type="button"
                              className="pessoa border-0 bg-transparent p-0 text-left hover:underline"
                              onClick={() => selectAgent(agent.id)}
                            >
                              {person}
                            </button>
                          ) : (
                            <div className="pessoa">{person}</div>
                          )}
                        </td>
                        <td><span className="tag tag--azul">{agent.team}</span></td>
                        <td className="centro">
                          <span className={cn('nota', scoreClass(agent.score))}>{agent.score}</span>
                        </td>
                        <td className="num">{fmt(agent.avgResponseTime)} min</td>
                        <td className="centro num">{agent.opportunities}</td>
                        <td className="centro">
                          {agent.criticalFailures > 0 ? (
                            <span className="nota nota--critica">{agent.criticalFailures}</span>
                          ) : (
                            <span className="suave">0</span>
                          )}
                        </td>
                        <td className={cn('centro num', unfulfilled > 0 && 'vermelho forte')}>
                          {agent.promisesKept}/{agent.promisesTotal}
                        </td>
                        <td className="centro"><TrendCell trend={agent.trend} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ─── Evolução ────────────────────────────────────────────── */}
      <section className="cartao" aria-labelledby="t-evolucao">
        <div className="cartao__cab flex-wrap">
          <div>
            <h2 id="t-evolucao">
              <ChartLine className="ic verde-txt" aria-hidden="true" />
              Evolução
            </h2>
            <p>Tendência dos principais indicadores nos últimos 14 dias.</p>
          </div>
          <div className="linha-flex envolve">
            <div className="segmentado" role="group" aria-label="Escolha a métrica">
              <button
                type="button"
                aria-pressed={evolutionMode === 'indicadores'}
                onClick={() => setEvolutionMode('indicadores')}
              >
                Indicadores
              </button>
              <button
                type="button"
                aria-pressed={evolutionMode === 'risco'}
                onClick={() => setEvolutionMode('risco')}
              >
                Valor em risco
              </button>
            </div>
            <span className="seletor seletor--sm">
              <CalendarDays className="ic" aria-hidden="true" />
              Últimos 14 dias
            </span>
          </div>
        </div>
        <div className="cartao__corpo">
          <div className="grafico">
            <ChartContainer config={evolutionChartConfig} className="aspect-auto h-[230px] w-full">
              <AreaChart data={formattedEvolution} margin={{ left: 0, right: 14, top: 12, bottom: 4 }}>
                <defs>
                  {EVOLUTION_SERIES[evolutionMode].map((key) => (
                    <linearGradient key={key} id={`evo-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={EVOLUTION_COLORS[key]} stopOpacity={evolutionMode === 'risco' ? 0.22 : 0.14} />
                      <stop offset="1" stopColor={EVOLUTION_COLORS[key]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--borda)" strokeDasharray="3 4" />
                <XAxis dataKey="dateLabel" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--borda-forte)' }} minTickGap={16} />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={evolutionMode === 'risco' ? 56 : 36}
                  domain={[0, 'auto']}
                  tickFormatter={
                    evolutionMode === 'risco'
                      ? (v: number) => (v ? `R$ ${fmt(Math.round(v / 100) / 10)}k` : 'R$ 0')
                      : (v: number) => fmt(v)
                  }
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {EVOLUTION_SERIES[evolutionMode].map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={EVOLUTION_COLORS[key]}
                    strokeWidth={2.2}
                    fill={`url(#evo-${key})`}
                    dot={{ r: 3.6, fill: EVOLUTION_COLORS[key], stroke: 'var(--superficie)', strokeWidth: 1.5 }}
                    activeDot={{ r: 5.5, stroke: 'var(--superficie)', strokeWidth: 2 }}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          </div>
          <div className="legenda">
            {EVOLUTION_SERIES[evolutionMode].map((key) => (
              <span key={key}>
                <i style={{ background: EVOLUTION_COLORS[key] }} aria-hidden="true" />
                {evolutionChartConfig[key].label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
