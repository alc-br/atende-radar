'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ArrowLeft,
  Star,
  MessageSquare,
  MessageCircle,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Mail,
  Handshake,
  HeartHandshake,
  CircleDot,
  Zap,
  FileText,
  RotateCcw,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'

import { cn, getIntentLabel, getStageLabel } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'

// --- Types ---

interface ScoreDimension {
  key: string
  label: string
  weight: number
  score: number
}

// --- Helpers ---

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', supervisor: 'Supervisor', atendente: 'Atendente' }
  return labels[role] || role
}

const getRoleTag = (role: string) => {
  const tags: Record<string, string> = { admin: 'tag--roxo', gestor: 'tag--verde', supervisor: 'tag--roxo', atendente: 'tag--laranja' }
  return tags[role] || 'tag--cinza'
}

const getScoreText = (score: number) => {
  if (score >= 80) return 'verde-txt'
  if (score >= 70) return 'laranja-txt'
  return 'vermelho'
}

const getNotaClass = (score: number) => {
  if (score >= 80) return 'nota--alta'
  if (score >= 70) return 'nota--media'
  return 'nota--baixa'
}

const AVATAR_TONES = ['av--laranja', 'av--verde', 'av--roxo', 'av--azul', 'av--vermelho']

const avatarTone = (name: string) => {
  let h = 0
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}

const getStatusTag = (status: string) => {
  const tags: Record<string, string> = { active: 'tag--verde', inactive: 'tag--cinza', away: 'tag--ambar' }
  return tags[status] || 'tag--cinza'
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', away: 'Ausente' }
  return labels[status] || status
}

const formatShortDateTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

const DIMENSION_ICONS: Record<string, { icon: typeof Zap; tone: string }> = {
  velocidade: { icon: Zap, tone: 'tom-verde' },
  oportunidades: { icon: Target, tone: 'tom-laranja' },
  pendencias: { icon: FileText, tone: 'tom-azul' },
  qualidade: { icon: Star, tone: 'tom-laranja' },
  recuperacao: { icon: RotateCcw, tone: 'tom-verde' },
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
    items.push(`Tempo de resposta rápido (${stats.avgResponseTime.toFixed(1).replace('.', ',')} min em média)`)
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

const toConversationItem = (c: any) => ({
  id: c.id as string,
  name: (c.customerName as string) || 'Desconhecido',
  topic: c.primaryIntent ? getIntentLabel(c.primaryIntent) : c.inferredStage ? getStageLabel(c.inferredStage) : 'Conversa',
  score: c.score as number,
  at: (c.openedAt as string | undefined) ?? null,
})

// --- Component ---

export default function AgentProfile() {
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const setView = useAppStore((s) => s.setView)
  const selectConversation = useAppStore((s) => s.selectConversation)
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
      .map(toConversationItem)
  }, [recentConversations])

  const toReviewConversations = useMemo(() => {
    return [...recentConversations]
      .filter((c) => c.score < 70)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map(toConversationItem)
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
  if (isLoading) {
    return (
      <>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </>
    )
  }
  if (error) {
    return (
      <section className="cartao vazio" role="alert">
        <strong>{error}</strong>
        <button type="button" onClick={() => setView('team')} className="btn mt-3">Voltar</button>
      </section>
    )
  }
  if (!profileData) return null

  const getOpportunityStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      discovery: 'Descoberta', qualification: 'Qualificação', evaluation: 'Avaliação',
      price: 'Preço', proposal: 'Proposta', negotiation: 'Negociação',
      decision: 'Decisão', won: 'Ganha', lost: 'Perdida',
    }
    return labels[status] || status
  }

  const getOpportunityStatusTag = (status: string) => {
    const tags: Record<string, string> = {
      won: 'tag--verde',
      lost: 'tag--vermelho',
      negotiation: 'tag--ambar',
      price: 'tag--laranja',
    }
    return tags[status] || 'tag--cinza'
  }

  const getPromiseStatusIcon = (status: string) => {
    switch (status) {
      case 'fulfilled': return <CheckCircle2 className="ic verde-txt shrink-0" aria-hidden="true" />
      case 'overdue': return <XCircle className="ic vermelho shrink-0" aria-hidden="true" />
      default: return <CircleDot className="ic laranja-txt shrink-0" aria-hidden="true" />
    }
  }

  const getPromiseStatusLabel = (status: string) => {
    const labels: Record<string, string> = { fulfilled: 'Cumprida', overdue: 'Vencida', pending: 'Pendente' }
    return labels[status] || status
  }

  const getPromiseStatusTag = (status: string) => {
    const tags: Record<string, string> = { fulfilled: 'tag--verde', overdue: 'tag--vermelho', pending: 'tag--ambar' }
    return tags[status] || 'tag--cinza'
  }

  const trendInfo =
    agent.trend === 'up'
      ? { Icon: TrendingUp, cls: 'verde-txt', label: 'Nota em alta' }
      : agent.trend === 'down'
        ? { Icon: TrendingDown, cls: 'vermelho', label: 'Nota em queda' }
        : { Icon: Minus, cls: 'suave', label: 'Nota estável' }

  const conversationList = (
    list: { id: string; name: string; topic: string; score: number; at?: string | null }[],
    emptyText: string,
  ) =>
    list.length === 0 ? (
      <p className="vazio">{emptyText}</p>
    ) : (
      <ul className="lista-conversas">
        {list.map((c) => (
          <li key={c.id}>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); selectConversation(c.id) }}
            >
              <MessageCircle className="ic verde-txt" aria-hidden="true" />
              <b>{c.name}</b>
              <q>{c.topic}</q>
              <span className={cn('nota', getNotaClass(c.score))}>{c.score}</span>
              <time dateTime={c.at || undefined}>{formatShortDateTime(c.at)}</time>
              <ChevronRight className="ic suave" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    )

  return (
    <>
      <button type="button" className="voltar" onClick={() => setView('team')}>
        <ArrowLeft className="ic" aria-hidden="true" />
        Voltar para Equipe
      </button>

      {/* Header */}
      <header className="perfil">
        <span className={cn('av av--lg', avatarTone(agent.name))} aria-hidden="true">{initials}</span>
        <div className="min-w-0">
          <div className="linha-flex envolve">
            <h1>{agent.name}</h1>
            <span className={cn('tag tag--lg', getRoleTag(agent.role))}>{getRoleLabel(agent.role)}</span>
            {agent.team && <span className="tag tag--azul tag--lg">{agent.team}</span>}
            <span className={cn('tag tag--lg', getStatusTag(agent.status))}>{getStatusLabel(agent.status)}</span>
            <span className={cn('inline-flex items-center', trendInfo.cls)} title={trendInfo.label}>
              <trendInfo.Icon className="ic ic-tend" aria-hidden="true" />
              <span className="sr-only">{trendInfo.label}</span>
            </span>
          </div>
          {agent.email && (
            <p className="perfil__email"><Mail className="ic" aria-hidden="true" />{agent.email}</p>
          )}
        </div>
      </header>

      {/* Summary cards row */}
      <section className="kpis kpis--6" aria-label={`Indicadores de ${agent.name}`}>
        <article className="cartao kpi kpi--spark">
          <span className="kpi__icone tom-laranja"><Star className="ic" aria-hidden="true" /></span>
          <p className={cn('kpi__valor', getScoreText(agent.score))}>{agent.score}</p>
          <p className="kpi__rotulo-b">Nota atual</p>
        </article>
        <article className="cartao kpi kpi--spark">
          <span className="kpi__icone tom-azul"><MessageSquare className="ic" aria-hidden="true" /></span>
          <p className="kpi__valor">{agent.conversations}</p>
          <p className="kpi__rotulo-b">Conversas no período</p>
        </article>
        <article className="cartao kpi kpi--spark">
          <span className="kpi__icone tom-azul"><Clock className="ic" aria-hidden="true" /></span>
          <p className="kpi__valor">{String(agent.avgResponseTime).replace('.', ',')} min</p>
          <p className="kpi__rotulo-b">Tempo mediano resp.</p>
        </article>
        <article className="cartao kpi kpi--spark">
          <span className="kpi__icone tom-verde"><Target className="ic" aria-hidden="true" /></span>
          <p className="kpi__valor verde-txt">{agent.opportunities}</p>
          <p className="kpi__rotulo-b">Oportunidades</p>
        </article>
        <article className="cartao kpi kpi--spark">
          <span className="kpi__icone tom-vermelho"><AlertTriangle className="ic" aria-hidden="true" /></span>
          <p className={cn('kpi__valor', agent.opportunitiesLost > 5 ? 'vermelho' : 'laranja-txt')}>{agent.opportunitiesLost}</p>
          <p className="kpi__rotulo-b">Falhas críticas</p>
        </article>
        <article className="cartao kpi kpi--spark">
          <span className="kpi__icone tom-verde"><HeartHandshake className="ic" aria-hidden="true" /></span>
          <p className={cn('kpi__valor', agent.promisesKept === agent.promisesTotal ? 'verde-txt' : 'laranja-txt')}>
            {agent.promisesKept}/{agent.promisesTotal}
          </p>
          <p className="kpi__rotulo-b">Promessas cumpridas</p>
        </article>
      </section>

      {/* Evolution chart + Score breakdown */}
      <div className="grade membro__meio">
        <section className="cartao" aria-labelledby="ap-t-evol">
          <div className="cartao__cab">
            <div>
              <h2 id="ap-t-evol">Evolução da nota (14 dias)</h2>
              <p>Score geral por dia</p>
            </div>
          </div>
          <div className="cartao__corpo">
            {chartData.length === 0 ? (
              <p className="vazio">Ainda não há notas diárias para este agente.</p>
            ) : (
              <div className="grafico h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.slice(5)}
                      stroke="var(--suave)"
                    />
                    <YAxis
                      domain={[30, 100]}
                      tick={{ fontSize: 11 }}
                      stroke="var(--suave)"
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'var(--superficie)',
                        border: '1px solid var(--borda)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--texto)',
                      }}
                      labelFormatter={(v: string) => new Date(v + 'T12:00:00').toLocaleDateString('pt-BR')}
                      formatter={(value: number) => [value.toFixed(0), 'Nota']}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: 'var(--chart-1)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="cartao" aria-labelledby="ap-t-comp">
          <div className="cartao__cab">
            <div>
              <h2 id="ap-t-comp">Composição da nota</h2>
              <p>Detalhamento por dimensão</p>
            </div>
          </div>
          <div className="cartao__corpo">
            <ul className="dimensoes">
              {scoreDimensions.map((dim) => {
                const meta = DIMENSION_ICONS[dim.key]
                const Icon = meta?.icon ?? Star
                return (
                  <li key={dim.key}>
                    <span className={cn('dado-ic', meta?.tone)}><Icon className="ic" aria-hidden="true" /></span>
                    <div>
                      <p>{dim.label}</p>
                      <div
                        className="barra"
                        role="progressbar"
                        aria-label={`${dim.label}: ${dim.score} de 100`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={dim.score}
                      >
                        <i style={{ width: `${Math.max(0, Math.min(100, dim.score))}%` }} />
                      </div>
                    </div>
                    <span className="dimensoes__peso">{dim.weight}%</span>
                    <b className={getScoreText(dim.score)}>{dim.score}</b>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      </div>

      {/* Strengths + Failures */}
      <div className="grade grade-2 membro__resumo">
        <section className="cartao destaque destaque--verde">
          <span className="destaque__ic"><CheckCircle2 className="ic" aria-hidden="true" /></span>
          <h2>Pontos fortes</h2>
          <ul className="lista-check">
            {strengths.map((s, i) => (
              <li key={i}><CheckCircle2 className="ic" aria-hidden="true" />{s}</li>
            ))}
          </ul>
        </section>
        <section className="cartao destaque destaque--vermelho">
          <span className="destaque__ic"><AlertTriangle className="ic" aria-hidden="true" /></span>
          <h2>Falhas recorrentes</h2>
          <ul className="lista-check">
            {failures.map((f, i) => (
              <li key={i}><XCircle className="ic" aria-hidden="true" />{f}</li>
            ))}
          </ul>
        </section>
      </div>

      {/* Exemplary conversations + Conversations to review */}
      <div className="grade grade-2">
        <section className="cartao" aria-labelledby="ap-t-exemplares">
          <div className="cartao__cab">
            <div>
              <h2 id="ap-t-exemplares"><Star className="ic laranja-txt" aria-hidden="true" />Conversas exemplares</h2>
              <p>Exemplos de atendimentos bem avaliados</p>
            </div>
          </div>
          {conversationList(exemplaryConversations, 'Nenhuma conversa com nota 80 ou mais.')}
        </section>
        <section className="cartao" aria-labelledby="ap-t-revisar">
          <div className="cartao__cab">
            <div>
              <h2 id="ap-t-revisar"><AlertTriangle className="ic vermelho" aria-hidden="true" />Conversas para revisar</h2>
              <p>Exemplos de atendimentos que precisam de atenção</p>
            </div>
          </div>
          {conversationList(toReviewConversations, 'Nenhuma conversa com nota abaixo de 70.')}
        </section>
      </div>

      {/* Promises + Opportunities */}
      <div className="grade grade-2">
        <section className="cartao" aria-labelledby="ap-t-promessas">
          <div className="cartao__cab">
            <div>
              <h2 id="ap-t-promessas"><Handshake className="ic verde-txt" aria-hidden="true" />Promessas</h2>
              <p>Acompanhamento de promessas feitas ao cliente</p>
            </div>
          </div>
          <div className="cartao__corpo">
            {promises.length === 0 ? (
              <p className="vazio">Nenhuma promessa registrada.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {promises.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg border border-[var(--borda)] p-3">
                    {getPromiseStatusIcon(p.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.text}</p>
                      <p className="suave text-xs">
                        Prazo: {p.dueDate ? new Date(p.dueDate).toLocaleDateString('pt-BR') : '—'}
                      </p>
                    </div>
                    <span className={cn('tag shrink-0', getPromiseStatusTag(p.status))}>
                      {getPromiseStatusLabel(p.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="cartao" aria-labelledby="ap-t-oport">
          <div className="cartao__cab">
            <div>
              <h2 id="ap-t-oport"><Target className="ic verde-txt" aria-hidden="true" />Oportunidades</h2>
              <p>Oportunidades identificadas nas conversas</p>
            </div>
          </div>
          <div className="cartao__corpo">
            {opportunities.length === 0 ? (
              <p className="vazio">Nenhuma oportunidade identificada.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {opportunities.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 rounded-lg border border-[var(--borda)] p-3">
                    <p className="flex-1 min-w-0 text-sm font-medium truncate">{getIntentLabel(o.intent)}</p>
                    <span className="verde-txt forte text-sm shrink-0">
                      R$ {o.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className={cn('tag shrink-0', getOpportunityStatusTag(o.status))}>
                      {getOpportunityStatusLabel(o.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
