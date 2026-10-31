'use client'

import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Briefcase,
  Calculator,
  ChartBar,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleX,
  Hourglass,
  Info,
  ListChecks,
  ListTodo,
  Percent,
  Target,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { presetActivitiesFilter } from '@/components/crm/activity-list'
import { SuggestionsPanel } from '@/components/crm/suggestions-panel'
import { useCrmQuery } from '@/lib/crm/client'
import { LOST_REASON_LABEL } from '@/lib/crm/labels'
import { formatCents } from '@/lib/crm/money'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'

// Visão comercial (CRM-08): indicadores do período, no escopo de quem vê. Valor declarado, valor ganho e estimativa
// ficam sempre separados: a estimativa vem da análise das conversas e nunca é receita. Analista e visualizador veem só
// esta tela (agregados, sem botões de criação).

interface Overview {
  period: { from: string; to: string }
  open: { count: number; declaredCents: number; estimatedCents: number; withoutDeclaredAmount: number; stale: number; withoutNextAction: number }
  won: { count: number; confirmedCents: number; withoutAmount: number; recoveredCount: number; recoveredCents: number }
  lost: { count: number; byReason: { reason: string; count: number }[] }
  conversion: number | null
  overdueTasks: number
  byStage: { stageId: string; name: string; position: number; pipelineId: string; count: number; declaredCents: number; estimatedCents: number; avgDaysInStage: number | null }[]
  byOwner: { ownerMemberId: string | null; open: number; won: number; confirmedCents: number }[]
  methodology: Partial<Record<'window' | 'declared' | 'estimated' | 'confirmed' | 'recovered' | 'stale' | 'dedupe', string>> & Record<string, string>
}

interface MemberRow {
  id: string
  name: string
}

const PERIODS = [7, 30, 90] as const
type PeriodDays = (typeof PERIODS)[number]
type Period = { days: PeriodDays; from: string; to: string }

const DAY = 86400_000
const AXIS_TICK = { fontSize: 11.5, fill: 'var(--suave)' }
/** Nome longo de etapa ou pessoa cabe nos 120px do eixo; o nome inteiro está na tabela logo abaixo. */
const shortTick = (v: unknown) => {
  const s = String(v ?? '')
  return s.length > 18 ? `${s.slice(0, 17)}…` : s
}
const TOOLTIP_STYLE = { background: 'var(--superficie)', border: '1px solid var(--borda)', borderRadius: 8, color: 'var(--texto)', fontSize: 12.5 }
const METHOD_LABEL: Record<string, string> = {
  window: 'Período',
  declared: 'Valor declarado',
  estimated: 'Estimativa',
  confirmed: 'Valor ganho',
  recovered: 'Recuperado',
  stale: 'Negócio parado',
  dedupe: 'Contagem',
}

const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const dec = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Últimos N dias até o fim de hoje (fuso de quem vê): o endereço fica estável durante o dia. */
function periodOf(days: PeriodDays): Period {
  const end = new Date()
  end.setHours(24, 0, 0, 0)
  return { days, from: new Date(end.getTime() - days * DAY).toISOString(), to: end.toISOString() }
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

// rótulo da barra: sem barra (valor 0), sem número solto colado no eixo
function hideZero(v: unknown) {
  return v === 0 ? '' : String(v ?? '')
}

function lostLabel(code: string) {
  return (LOST_REASON_LABEL as Record<string, string>)[code] ?? code
}

function Kpi({ icon: Icon, tone, label, value, note }: { icon: LucideIcon; tone: string; label: string; value: ReactNode; note?: string | null }) {
  return (
    <div className="cartao kpi">
      <span className={`kpi__icone ${tone}`} aria-hidden="true">
        <Icon className="ic" />
      </span>
      <div className="kpi__rotulo">{label}</div>
      <div className="kpi__valor">{value}</div>
      {note && <div className="kpi__ref">{note}</div>}
    </div>
  )
}

export default function CrmOverviewView() {
  const me = useAppStore((s) => s.me)
  const setView = useAppStore((s) => s.setView)
  const [period, setPeriod] = useState<Period>(() => periodOf(30))
  const [showMethod, setShowMethod] = useState(false)

  const crmOn = !!me?.crm?.enabled
  const canAnalytics = crmOn && can(me?.role, 'crm.analytics.view')
  const canDeals = crmOn && can(me?.role, 'crm.deals.view')
  const canManageDeals = canDeals && can(me?.role, 'crm.deals.manage')
  const canContacts = crmOn && can(me?.role, 'crm.contacts.view')
  const canActivities = crmOn && can(me?.role, 'crm.activities.view')
  const canSeeTeam = crmOn && can(me?.role, 'members.view')

  const q = useCrmQuery<Overview>(canAnalytics ? `/api/crm/overview?from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}` : null)
  const d = q.data
  const nothingInPeriod = !!d && d.open.count === 0 && d.won.count === 0 && d.lost.count === 0

  // primeiro uso: só para quem cria negócio (analista e visualizador não recebem checklist nem botões)
  const dealsQ = useCrmQuery<{ total: number }>(nothingInPeriod && canManageDeals ? '/api/crm/deals?limit=1' : null)
  const contactsQ = useCrmQuery<{ total: number }>(nothingInPeriod && canManageDeals && canContacts ? '/api/crm/contacts?limit=1' : null)
  const suggestionsQ = useCrmQuery<{ suggestions: unknown[] }>(nothingInPeriod && canManageDeals ? '/api/crm/suggestions' : null)
  const firstUse = nothingInPeriod && canManageDeals && dealsQ.data?.total === 0
  // enquanto confere se é o primeiro uso, não mostra o vazio comum (evita trocar de cartão na frente da pessoa)
  const checkingFirstUse = nothingInPeriod && canManageDeals && dealsQ.loading

  const ownersShown = canSeeTeam && !!d && d.byOwner.length > 0
  const membersQ = useCrmQuery<{ members: MemberRow[] }>(ownersShown ? '/api/members' : null)
  const memberName = new Map((membersQ.data?.members ?? []).map((m) => [m.id, m.name]))

  function choose(days: PeriodDays) {
    setPeriod(periodOf(days))
  }

  function goOverdue() {
    presetActivitiesFilter('overdue')
    setView('crm-activities')
  }

  const header = (
    <header className="cab-pagina">
      <div className="cab-pagina__titulo">
        <ChartBar className="ic cab-pagina__icone" aria-hidden="true" />
        <div>
          <h1>Visão comercial</h1>
          <p>Negócios, ganhos e tarefas do período. Valor declarado e estimativa ficam sempre separados.</p>
        </div>
      </div>
      {canAnalytics && (
        <div className="cab-pagina__acoes">
          <div className="segmentado" role="group" aria-label="Período" data-tour="crm-overview-period">
            {PERIODS.map((n) => (
              <button key={n} type="button" aria-pressed={period.days === n} onClick={() => choose(n)}>
                {n} dias
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  )

  if (!canAnalytics) {
    return (
      <>
        {header}
        <div className="cartao vazio">
          <ChartBar className="ic" aria-hidden="true" />
          <strong>{crmOn ? 'Visão comercial não disponível para o seu perfil' : 'O CRM comercial está desligado'}</strong>
          <p>{crmOn ? 'Peça ao gestor da empresa para revisar o seu acesso.' : 'O administrador da empresa pode ligá-lo nas configurações do CRM.'}</p>
        </div>
      </>
    )
  }

  if (q.error && !d) {
    return (
      <>
        {header}
        <div className="cartao vazio" role="alert">
          <strong>Não foi possível carregar a visão comercial.</strong>
          <p>{q.error.message && q.error.status === 400 ? q.error.message : 'Verifique a conexão e tente novamente.'}</p>
          <button type="button" className="btn mt-3" onClick={q.refetch}>
            Tentar novamente
          </button>
        </div>
      </>
    )
  }

  if (!d) {
    return (
      <>
        {header}
        <div className="kpis crm-carregando" role="status" aria-busy="true" aria-label="Carregando indicadores">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-[var(--raio)]" />
          ))}
        </div>
        <div className="grade grade-2 crm-grade crm-carregando">
          <Skeleton className="h-64 w-full rounded-[var(--raio)]" />
          <Skeleton className="h-64 w-full rounded-[var(--raio)]" />
        </div>
      </>
    )
  }

  const periodText = `${dateFmt.format(new Date(d.period.from))} a ${dateFmt.format(new Date(new Date(d.period.to).getTime() - 1))}`
  const declaredOpenCount = d.open.count - d.open.withoutDeclaredAmount
  const wonWithAmount = d.won.count - d.won.withoutAmount

  const wonNote = [
    d.won.withoutAmount > 0 ? `${d.won.withoutAmount} sem valor informado` : null,
    d.won.recoveredCount > 0 ? `${d.won.recoveredCount} da Fila de Recuperação` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const stageRows = d.byStage.map((s) => ({ ...s, label: s.name }))
  const ownerRows = d.byOwner.map((o) => ({
    ...o,
    label: o.ownerMemberId ? (memberName.get(o.ownerMemberId) ?? (membersQ.loading ? 'Carregando…' : 'Pessoa sem acesso')) : 'Sem responsável',
  }))
  const lostMax = Math.max(1, ...d.lost.byReason.map((r) => r.count))

  const checklist = firstUse
    ? [
        {
          id: 'deal',
          done: (dealsQ.data?.total ?? 0) > 0,
          title: 'Crie o primeiro negócio',
          text: 'Um negócio é uma venda em andamento: cliente, valor e etapa do funil.',
          action: { label: 'Ir para negócios', onClick: () => setView('crm-deals') },
        },
        {
          id: 'contact',
          done: (contactsQ.data?.total ?? 0) > 0,
          title: 'Cadastre um contato',
          text: 'Pessoas e empresas com quem você negocia, como Maria Silva.',
          action: canContacts ? { label: 'Ir para contatos', onClick: () => setView('crm-contacts') } : null,
        },
        {
          id: 'suggestions',
          done: (suggestionsQ.data?.suggestions.length ?? 0) > 0,
          title: 'Veja as sugestões das conversas',
          text:
            (suggestionsQ.data?.suggestions.length ?? 0) > 0
              ? 'Há sugestões esperando você logo abaixo. Nada muda sem você aceitar.'
              : 'Quando uma conversa indicar uma venda, a sugestão aparece nesta tela para você aceitar ou descartar.',
          action: null,
        },
      ]
    : null

  return (
    <>
      {header}

      <p className="crm-visao__periodo suave">
        <span className="sr-only">Período: </span>
        {periodText}. Abertos, parados e tarefas mostram a situação de agora.
      </p>

      {checklist && (
        <section className="cartao crm-checklist" data-tour="crm-overview-start" aria-labelledby="crm-comece-titulo">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-comece-titulo">
                <ListChecks className="ic" aria-hidden="true" />
                Comece por aqui
              </h2>
              <p>Três passos para o CRM começar a mostrar números.</p>
            </div>
            <span className="tag tag--cinza">
              {checklist.filter((c) => c.done).length} de {checklist.length}
            </span>
          </div>
          <ol className="cartao__corpo crm-checklist__lista">
            {checklist.map((c) => (
              <li key={c.id} className={`crm-checklist__item${c.done ? ' crm-checklist__item--feito' : ''}`}>
                {c.done ? <CircleCheck className="ic crm-checklist__ic" aria-hidden="true" /> : <Circle className="ic crm-checklist__ic" aria-hidden="true" />}
                <div className="crm-checklist__texto">
                  <strong>
                    {c.title}
                    <span className="sr-only">{c.done ? ' (feito)' : ' (a fazer)'}</span>
                  </strong>
                  <span className="suave">{c.text}</span>
                </div>
                {c.action && !c.done && (
                  <button type="button" className="btn btn--sm btn--contorno-verde" onClick={c.action.onClick}>
                    {c.action.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="kpis crm-kpis" data-tour="crm-overview-kpis">
        <Kpi icon={Briefcase} tone="tom-azul" label="Negócios abertos" value={String(d.open.count)} note={d.open.withoutDeclaredAmount > 0 ? `${d.open.withoutDeclaredAmount} sem valor informado` : 'situação de agora'} />
        <Kpi icon={Trophy} tone="tom-verde" label="Ganhos no período" value={String(d.won.count)} note={wonNote || null} />
        <Kpi icon={CircleX} tone="tom-vermelho" label="Perdidos no período" value={String(d.lost.count)} />
        <Kpi
          icon={Percent}
          tone="tom-roxo"
          label="Conversão"
          value={d.conversion === null ? '—' : pct.format(d.conversion)}
          note={d.conversion === null ? 'sem negócios fechados no período' : 'ganhos ÷ (ganhos + perdidos)'}
        />
        <Kpi
          icon={Wallet}
          tone="tom-verde"
          label="Valor ganho (declarado)"
          value={d.won.count === 0 ? '—' : wonWithAmount === 0 ? formatCents(null) : formatCents(d.won.confirmedCents)}
          note={d.won.count === 0 ? 'nenhum ganho no período' : d.won.withoutAmount > 0 ? `${plural(d.won.withoutAmount, 'ganho sem valor fica', 'ganhos sem valor ficam')} fora da soma` : 'soma dos ganhos com valor informado'}
        />
        <Kpi
          icon={Target}
          tone="tom-azul"
          label="Valor em aberto (declarado)"
          value={d.open.count === 0 ? '—' : declaredOpenCount === 0 ? formatCents(null) : formatCents(d.open.declaredCents)}
          note={d.open.count === 0 ? 'nenhum negócio aberto' : d.open.withoutDeclaredAmount > 0 ? `${plural(d.open.withoutDeclaredAmount, 'negócio sem valor fica', 'negócios sem valor ficam')} fora da soma` : 'informado nos negócios'}
        />
      </div>

      <div className="grade grade-3 crm-grade">
        <section className="cartao crm-kpi-estimativa" aria-labelledby="crm-estimativa-titulo">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-estimativa-titulo">
                <Calculator className="ic" aria-hidden="true" />
                Estimativa (não é receita)
              </h2>
              <p>Calculada pela análise das conversas nos negócios abertos. Não entra em nenhuma soma de valor.</p>
            </div>
          </div>
          <div className="cartao__corpo">
            <div className="kpi__valor">{d.open.estimatedCents > 0 ? formatCents(d.open.estimatedCents) : 'Sem estimativa'}</div>
            <div className="kpi__ref">{d.open.estimatedCents > 0 ? 'valor estimado, não é receita' : 'nenhum negócio aberto tem estimativa'}</div>
          </div>
        </section>

        <section className="cartao" aria-labelledby="crm-atrasadas-titulo">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-atrasadas-titulo">
                <ListTodo className="ic" aria-hidden="true" />
                Tarefas atrasadas
              </h2>
              <p>Abertas com o prazo vencido, agora.</p>
            </div>
          </div>
          <div className="cartao__corpo crm-visao__cartao-corpo">
            <div className={`kpi__valor${d.overdueTasks > 0 ? ' vermelho' : ''}`}>{d.overdueTasks}</div>
            <div className="kpi__ref">{d.overdueTasks > 0 ? `${plural(d.overdueTasks, 'tarefa precisa', 'tarefas precisam')} de atenção` : 'nenhuma tarefa com prazo vencido'}</div>
            {canActivities && (
              <button type="button" className="btn btn--sm" onClick={d.overdueTasks > 0 ? goOverdue : () => setView('crm-activities')}>
                {d.overdueTasks > 0 ? 'Ver tarefas atrasadas' : 'Ver tarefas'}
              </button>
            )}
          </div>
        </section>

        <section className="cartao" aria-labelledby="crm-parados-titulo">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-parados-titulo">
                <Hourglass className="ic" aria-hidden="true" />
                Negócios parados
              </h2>
              <p>Há mais tempo na etapa do que o prazo dela.</p>
            </div>
          </div>
          <div className="cartao__corpo crm-visao__cartao-corpo">
            <div className="kpi__valor">{d.open.stale}</div>
            <div className="kpi__ref">{plural(d.open.withoutNextAction, 'aberto sem próxima ação', 'abertos sem próxima ação')}</div>
            {canDeals && d.open.count > 0 && (
              <button type="button" className="btn btn--sm" onClick={() => setView('crm-deals')}>
                Ver negócios
              </button>
            )}
          </div>
        </section>
      </div>

      <SuggestionsPanel onChanged={q.refetch} />

      {nothingInPeriod && !firstUse && !checkingFirstUse && (
        <div className="cartao vazio">
          <ChartBar className="ic" aria-hidden="true" />
          <strong>Nenhum negócio no período</strong>
          <p>
            {canManageDeals
              ? 'Não há negócios abertos nem fechados nestes dias. Registre uma venda em andamento em Negócios.'
              : 'Os indicadores aparecem quando a equipe comercial registrar negócios no CRM.'}
          </p>
          <div className="crm-visao__vazio-acoes">
            {period.days < 90 && (
              <button type="button" className="btn btn--sm" onClick={() => choose(90)}>
                Ver os últimos 90 dias
              </button>
            )}
            {canManageDeals && (
              <button type="button" className="btn btn--sm btn--primario" onClick={() => setView('crm-deals')}>
                Ir para negócios
              </button>
            )}
          </div>
        </div>
      )}

      {!nothingInPeriod && (
        <div className={ownersShown ? 'grade crm-grade crm-visao__tabelas' : 'grade crm-grade'}>
          <section className="cartao" aria-labelledby="crm-etapas-titulo" data-tour="crm-overview-stages">
            <div className="cartao__cab">
              <div>
                <h2 id="crm-etapas-titulo">
                  <Briefcase className="ic" aria-hidden="true" />
                  Negócios abertos por etapa
                </h2>
                <p>Quantidade de negócios em cada etapa, agora.</p>
              </div>
            </div>
            <div className="cartao__corpo">
              {stageRows.length === 0 ? (
                <div className="vazio">
                  <strong>Nenhum negócio aberto</strong>
                  <p>Os negócios fechados no período estão nos indicadores acima.</p>
                </div>
              ) : (
                <>
                  <div className="crm-grafico" style={{ height: Math.max(140, stageRows.length * 38 + 30) }} role="img" aria-label="Gráfico de barras com os negócios abertos por etapa. Os números estão na tabela abaixo.">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stageRows} layout="vertical" margin={{ left: 0, right: 40, top: 4, bottom: 4 }}>
                        <CartesianGrid horizontal={false} stroke="var(--borda)" strokeDasharray="3 4" />
                        <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: 'var(--borda-forte)' }} tickLine={false} allowDecimals={false} />
                        <YAxis dataKey="label" type="category" width={120} tick={{ ...AXIS_TICK, fill: 'var(--texto-2)', fontSize: 12 }} tickFormatter={shortTick} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: 'var(--superficie-2)' }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [String(v), 'Negócios']} />
                        <Bar dataKey="count" name="Negócios" fill="var(--azul)" radius={4} barSize={18} isAnimationActive={false}>
                          <LabelList dataKey="count" position="right" fill="var(--texto)" fontSize={12} fontWeight={700} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="tabela-wrap crm-tabela-rola" role="region" tabIndex={0} aria-label="Negócios abertos por etapa">
                    <table className="tabela">
                      <thead>
                        <tr>
                          <th scope="col">Etapa</th>
                          <th scope="col" className="direita">
                            Negócios
                          </th>
                          <th scope="col" className="direita">
                            Valor declarado
                          </th>
                          <th scope="col" className="direita">
                            Estimativa (não é receita)
                          </th>
                          <th scope="col" className="direita">
                            Dias na etapa (média)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageRows.map((s) => (
                          <tr key={s.stageId}>
                            <th scope="row">{s.name}</th>
                            <td className="direita num">{s.count}</td>
                            <td className="direita num">{s.declaredCents > 0 ? formatCents(s.declaredCents) : formatCents(null)}</td>
                            <td className="direita num">{s.estimatedCents > 0 ? formatCents(s.estimatedCents) : 'Sem estimativa'}</td>
                            <td className="direita num">{s.avgDaysInStage === null ? '—' : dec.format(s.avgDaysInStage)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>

          {ownersShown && (
            <section className="cartao" aria-labelledby="crm-responsaveis-titulo" data-tour="crm-overview-owners">
              <div className="cartao__cab">
                <div>
                  <h2 id="crm-responsaveis-titulo">
                    <Users className="ic" aria-hidden="true" />
                    Por responsável
                  </h2>
                  <p>Abertos agora e ganhos no período.</p>
                </div>
              </div>
              <div className="cartao__corpo">
                <div className="legenda legenda--topo" aria-hidden="true">
                  <span>
                    <i className="crm-legenda--abertos" />
                    Abertos
                  </span>
                  <span>
                    <i className="crm-legenda--ganhos" />
                    Ganhos
                  </span>
                </div>
                <div className="crm-grafico" style={{ height: Math.max(140, ownerRows.length * 52 + 30) }} role="img" aria-label="Gráfico de barras com os negócios abertos e ganhos por responsável. Os números estão na tabela abaixo.">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ownerRows} layout="vertical" margin={{ left: 0, right: 40, top: 4, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="var(--borda)" strokeDasharray="3 4" />
                      <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: 'var(--borda-forte)' }} tickLine={false} allowDecimals={false} />
                      <YAxis dataKey="label" type="category" width={120} tick={{ ...AXIS_TICK, fill: 'var(--texto-2)', fontSize: 12 }} tickFormatter={shortTick} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'var(--superficie-2)' }} contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="open" name="Abertos" fill="var(--azul)" radius={4} barSize={14} isAnimationActive={false}>
                        <LabelList dataKey="open" position="right" fill="var(--texto)" fontSize={11.5} fontWeight={700} formatter={hideZero} />
                      </Bar>
                      <Bar dataKey="won" name="Ganhos" fill="var(--verde-600)" radius={4} barSize={14} isAnimationActive={false}>
                        <LabelList dataKey="won" position="right" fill="var(--texto)" fontSize={11.5} fontWeight={700} formatter={hideZero} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="tabela-wrap crm-tabela-rola" role="region" tabIndex={0} aria-label="Negócios por responsável">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th scope="col">Responsável</th>
                        <th scope="col" className="direita">
                          Abertos
                        </th>
                        <th scope="col" className="direita">
                          Ganhos
                        </th>
                        <th scope="col" className="direita">
                          Valor ganho (declarado)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownerRows.map((o) => (
                        <tr key={o.ownerMemberId ?? 'sem-responsavel'}>
                          <th scope="row">{o.label}</th>
                          <td className="direita num">{o.open}</td>
                          <td className="direita num">{o.won}</td>
                          <td className="direita num">{o.won === 0 ? '—' : o.confirmedCents > 0 ? formatCents(o.confirmedCents) : formatCents(null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {!nothingInPeriod && (
        <section className="cartao" aria-labelledby="crm-motivos-titulo">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-motivos-titulo">
                <CircleX className="ic" aria-hidden="true" />
                Motivos de perda
              </h2>
              <p>Negócios perdidos no período, por motivo.</p>
            </div>
          </div>
          <div className="cartao__corpo">
            {d.lost.byReason.length === 0 ? (
              <div className="vazio">
                <strong>Nenhuma perda no período</strong>
                <p>Quando um negócio for fechado como perdido, o motivo informado aparece aqui.</p>
              </div>
            ) : (
              <ul className="crm-motivos">
                {d.lost.byReason.map((r) => (
                  <li key={r.reason}>
                    <span className="crm-motivos__nome">{lostLabel(r.reason)}</span>
                    <span className="barra crm-motivos__barra" aria-hidden="true">
                      <i style={{ width: `${Math.round((r.count / lostMax) * 100)}%` }} />
                    </span>
                    <span className="crm-motivos__qtd num">{plural(r.count, 'negócio', 'negócios')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="cartao crm-metodo" data-tour="crm-overview-method">
        <h2 className="crm-metodo__cab">
          <button type="button" className="crm-metodo__botao" aria-expanded={showMethod} aria-controls="crm-metodo-corpo" onClick={() => setShowMethod((v) => !v)}>
            <Info className="ic" aria-hidden="true" />
            Como calculamos
            <ChevronDown className="ic crm-metodo__seta" aria-hidden="true" />
          </button>
        </h2>
        <div id="crm-metodo-corpo" className="crm-metodo__corpo" hidden={!showMethod}>
          <dl>
            {Object.entries(d.methodology).map(([key, text]) => (
              <div key={key} className="crm-metodo__item">
                <dt>{METHOD_LABEL[key] ?? key}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
