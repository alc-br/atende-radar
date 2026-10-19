'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Check, Crown, Zap, Rocket, MessageSquare, Users, Wifi,
  CreditCard, ArrowRight, ArrowUpCircle, Sparkles, AlertTriangle, Loader2, Receipt, Download, CalendarCheck, Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { AddressFields, CardFields, EMPTY_ADDRESS, EMPTY_CARD, addressProblem, cardProblem, tokenizeCard, type AddressValue, type CardValue } from './payment-fields'

interface PlanLimits {
  maxConnections: number
  maxAgents: number
  maxConversationsMonthly: number
  maxMessagesMonthly: number
  maxAudioMinutes: number
  retentionDays: number
  maxExports: number
  maxAlertRules: number
}

interface ApiPlan {
  id: string
  code: string
  name: string
  description: string | null
  monthlyPrice: number
  annualPrice: number
  currency: string
  trialDays: number
  limits: PlanLimits
  features: Record<string, boolean | string | number>
  highlight: boolean
}

interface UsageEntry {
  current: number
  limit: number
  percentage: number
}

interface SubscriptionData {
  id: string
  status: string
  plan: { id: string; code: string; name: string; monthlyPrice: number; annualPrice: number }
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEnd: string | null
  trialDaysLeft?: number | null
  cancelAtPeriodEnd: boolean
}

interface Billing {
  enabled: boolean
  mode: 'test' | 'live' | null
  publicKey: string | null
  subscription: {
    status: string
    plan: { id: string; name: string }
    recurring: boolean
    billingCycle: 'monthly' | 'annual'
    cardBrand: string | null
    cardLast4: string | null
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
    pending: boolean
    lastPaymentError: string | null
    graceEndsAt: string | null
    providerCanceled: boolean
    renewalAmount: number | null
    withdrawal: { until: string; amount: number } | null
  } | null
  invoices: { id: string; planName: string | null; billingCycle: string | null; amount: number; status: string; dueAt: string | null; paidAt: string | null; periodStart: string | null; periodEnd: string | null; failureMessage: string | null; createdAt: string }[]
}

type Cycle = 'monthly' | 'annual'

const PLAN_ICONS: Record<string, React.ElementType> = {
  essencial: Zap,
  gestao: Crown,
  performance: Rocket,
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Em teste',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
  unpaid: 'Não paga',
  expired: 'Teste encerrado',
}

const STATUS_TAGS: Record<string, string> = {
  active: 'tag--verde',
  trialing: 'tag--azul',
  past_due: 'tag--ambar',
  unpaid: 'tag--vermelho',
}

const INVOICE_STATUS: Record<string, { label: string; tag: string }> = {
  paid: { label: 'Paga', tag: 'tag--verde' },
  pending: { label: 'Pendente', tag: 'tag--azul' },
  failed: { label: 'Recusada', tag: 'tag--vermelho' },
  canceled: { label: 'Cancelada', tag: 'tag--cinza' },
  refunded: { label: 'Estornada', tag: 'tag--cinza' },
}

const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
// data de cobrança do Pagar.me (start_at): só o dia, gravado como meia-noite UTC
const fmtUtcDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')

// Os planos se diferenciam pelos LIMITES (aplicados de verdade nas cotas). A lista de "recursos" do catálogo não é
// aplicada a ninguém hoje, então não é exibida (nada de comparativo decorativo).

const USAGE_METRICS: { key: 'conversations' | 'messages' | 'agents' | 'connections' | 'exports'; label: string; icon: React.ElementType; tone: string }[] = [
  { key: 'conversations', label: 'Conversas', icon: MessageSquare, tone: 'tom-verde' },
  { key: 'messages', label: 'Mensagens', icon: MessageSquare, tone: 'tom-azul' },
  { key: 'agents', label: 'Agentes', icon: Users, tone: 'tom-laranja' },
  { key: 'connections', label: 'Conexões', icon: Wifi, tone: 'tom-roxo' },
  { key: 'exports', label: 'Exportações', icon: Download, tone: 'tom-teal' },
]

function PlanIcon({ code }: { code: string }) {
  const Icon = PLAN_ICONS[code] || Zap
  return <Icon className="ic" aria-hidden="true" />
}

export default function PlansView() {
  const startCheckout = useAppStore((s) => s.startCheckout)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  const incrementRefresh = useAppStore((s) => s.incrementRefresh)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plans, setPlans] = useState<ApiPlan[]>([])
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [usage, setUsage] = useState<Record<string, UsageEntry> | null>(null)
  const [billing, setBilling] = useState<Billing | null>(null)
  const [analysis, setAnalysis] = useState<{ paused: string | null; unanalyzed: number } | null>(null)
  const [cycle, setCycle] = useState<Cycle>('monthly')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [plansRes, subRes, billingRes] = await Promise.all([
        fetch('/api/plans'),
        fetch('/api/subscription'),
        fetch('/api/billing'),
      ])
      if (!plansRes.ok || !subRes.ok) throw new Error('Erro ao carregar planos')
      const plansData = await plansRes.json()
      const subData = await subRes.json()
      const billingData: Billing | null = billingRes.ok ? await billingRes.json() : null
      setPlans(plansData.plans || [])
      setSubscription(subData.subscription || null)
      setUsage(subData.usage || null)
      setAnalysis(subData.analysis || null)
      setBilling(billingData)
      if (billingData?.subscription?.recurring) setCycle(billingData.subscription.billingCycle)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData, refreshTrigger])

  const [changingPlanId, setChangingPlanId] = useState<string | null>(null)

  // Sem pagamento on-line configurado: pedido de troca registrado para a equipe
  const handleRequest = async (planId: string, planName: string) => {
    setChangingPlanId(planId)
    try {
      const res = await fetch('/api/subscription/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao pedir a troca de plano')
      }
      toast.success(`Pedido registrado: ${planName}.`, { description: 'Nossa equipe entra em contato para combinar o pagamento e ativar o plano.' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao pedir a troca de plano')
    } finally {
      setChangingPlanId(null)
    }
  }

  const [cardOpen, setCardOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const [reactivateOpen, setReactivateOpen] = useState(false)
  const [reactivating, setReactivating] = useState(false)

  const reactivateRenewal = async () => {
    setReactivating(true)
    try {
      const res = await fetch('/api/billing/reactivate', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Não foi possível reativar a renovação')
      toast.success('Renovação reativada.', { description: `Nada foi cobrado agora. A próxima cobrança será em ${fmtUtcDate(data.nextChargeAt)}.` })
      setReactivateOpen(false)
      incrementRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível reativar a renovação')
    } finally {
      setReactivating(false)
    }
  }

  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const withdrawNow = async () => {
    setWithdrawing(true)
    try {
      const res = await fetch('/api/billing/withdraw', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Não foi possível desfazer a contratação')
      toast.success('Contratação desfeita.', { description: `O estorno de ${formatCurrency(data.amountCents / 100)} foi pedido à operadora do cartão.` })
      setWithdrawOpen(false)
      incrementRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível desfazer a contratação')
      setWithdrawOpen(false)
      incrementRefresh()
    } finally {
      setWithdrawing(false)
    }
  }

  const cancelRenewal = async () => {
    setCanceling(true)
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Não foi possível cancelar a renovação')
      toast.success('Renovação cancelada.', { description: `O plano continua valendo até ${fmtDate(data.until)}.` })
      setCancelOpen(false)
      incrementRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível cancelar a renovação')
    } finally {
      setCanceling(false)
    }
  }

  if (error) {
    return (
      <div className="cartao vazio" role="alert">
        <strong>{error}</strong>
        <button type="button" onClick={fetchData} className="btn btn--sm mt-3">Tentar novamente</button>
      </div>
    )
  }

  const online = !!billing?.enabled
  const bsub = billing?.subscription ?? null
  const status = bsub?.status ?? subscription?.status ?? ''
  const recurring = !!bsub?.recurring
  const active = status === 'active'
  // O plano atual só "trava" o botão quando já é pago (no teste grátis ou expirado, dá para contratar o mesmo plano)
  const paidPlanId = active ? subscription?.plan.id : null
  const priceOf = (p: { monthlyPrice: number; annualPrice: number }, c: Cycle) => (c === 'annual' ? p.annualPrice : p.monthlyPrice)
  const currentCycle: Cycle = recurring && bsub ? bsub.billingCycle : 'monthly'
  // quem já assina paga o valor da contratação dele (preço novo do catálogo só vale para novas contratações)
  const currentPrice = recurring && bsub?.renewalAmount != null ? bsub.renewalAmount : subscription ? priceOf(subscription.plan, currentCycle) : 0
  const canReactivate = recurring && !!bsub?.cancelAtPeriodEnd && active && !bsub?.pending
  // Quem já paga só sobe de plano (nunca rebaixa pela tela): planos mais caros que o atual, ou o anual do mesmo plano
  const paying = active && recurring
  const currentMonthly = subscription?.plan.monthlyPrice ?? 0
  const canUpgrade = paying && !bsub?.pending && (plans.some((p) => p.monthlyPrice > currentMonthly) || currentCycle === 'monthly')
  // Pagamento em atraso (past_due: 7 dias de tolerância; unpaid: depois deles). Enquanto a cobrança automática existir,
  // o caminho é trocar o cartão (a fatura em aberto é cobrada na hora); se a operadora já a encerrou, contratar de novo.
  const delinquent = status === 'past_due' || status === 'unpaid'
  const providerCanceled = !!bsub?.providerCanceled
  const canChangeCard = recurring && !bsub?.cancelAtPeriodEnd && !providerCanceled
  // Teste grátis, teste encerrado ou assinatura encerrada: o cartão do plano atual chama para assinar ali mesmo
  const canSubscribe = online && !paying && !!subscription && !(delinquent && canChangeCard)
  const currentPlanFull = plans.find((p) => p.id === subscription?.plan.id) ?? null
  const scrollToCompare = () => document.getElementById('t-compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const COMPARE_ROWS: { label: string; value: (p: ApiPlan) => string | number }[] = [
    { label: 'Conversas/mês', value: (p) => p.limits.maxConversationsMonthly.toLocaleString('pt-BR') },
    { label: 'Agentes', value: (p) => p.limits.maxAgents },
    { label: 'Conexões WhatsApp', value: (p) => p.limits.maxConnections },
    { label: 'Mensagens/mês', value: (p) => p.limits.maxMessagesMonthly.toLocaleString('pt-BR') },
    { label: 'Regras de alerta', value: (p) => p.limits.maxAlertRules },
    { label: 'Exportações/mês', value: (p) => p.limits.maxExports },
  ]

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><CreditCard className="ic" /></span>
          <div>
            <h1>Planos e faturamento</h1>
            <p>Gerencie sua assinatura e acompanhe o uso.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grade grade-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <>
          {billing?.mode === 'test' && (
            <p className="suave text-xs" data-testid="billing-test-mode">Pagamentos em ambiente de testes do Pagar.me: nenhuma cobrança real é feita.</p>
          )}
          <div className="grade grade-2">
            {/* Plano atual */}
            <section className="cartao flex flex-col" data-testid="current-plan" aria-labelledby="t-plano-atual">
              <div className="cartao__cab">
                <div><h2 id="t-plano-atual"><CreditCard className="ic verde-txt" aria-hidden="true" />Plano atual</h2></div>
                {subscription && (
                  <span className={`tag tag--lg ${STATUS_TAGS[status] || 'tag--cinza'}`} data-testid="subscription-status">
                    {bsub?.cancelAtPeriodEnd && active ? 'Não renova' : STATUS_LABELS[status] || status}
                  </span>
                )}
              </div>
              <div className="cartao__corpo flex flex-1 flex-col gap-4">
                {subscription ? (
                  <>
                    <div className="resumo-plano__nome">
                      <span className="coroa coroa--sm" aria-hidden="true"><PlanIcon code={subscription.plan.code} /></span>
                      <div>
                        <b>Plano {subscription.plan.name}</b>
                        <span className="preco text-2xl">
                          {formatCurrency(currentPrice)}
                          <small className="inline">{currentCycle === 'annual' ? '/ano' : '/mês'}</small>
                        </span>
                      </div>
                    </div>
                    {delinquent && (
                      <div className="aviso aviso--ambar" role="alert" data-testid="past-due-plans">
                        <span className="aviso__ic" aria-hidden="true"><AlertTriangle className="ic" /></span>
                        <p>
                          {bsub?.lastPaymentError ? `A cobrança da renovação foi recusada: ${bsub.lastPaymentError}` : 'O pagamento da renovação não foi confirmado.'}{' '}
                          {status === 'past_due'
                            ? `Tudo continua funcionando até ${bsub?.graceEndsAt ? fmtDateTime(bsub.graceEndsAt) : 'o fim dos 7 dias de tolerância'}; depois disso, o painel é bloqueado. `
                            : 'Os 7 dias de tolerância acabaram e o painel está bloqueado. '}
                          {providerCanceled
                            ? 'A operadora encerrou a cobrança automática depois das tentativas sem sucesso: contrate o plano de novo para voltar.'
                            : 'Troque o cartão: a fatura em aberto é cobrada na hora no cartão novo e tudo volta ao normal.'}
                        </p>
                      </div>
                    )}
                    {bsub?.pending && (
                      <p className="suave text-[13px] flex items-center gap-2"><Loader2 className="ic animate-spin" aria-hidden="true" /> Troca de plano aguardando a confirmação do pagamento.</p>
                    )}
                    <dl className="border-t border-[var(--borda)] pt-3 space-y-2 text-[13.5px]">
                      {status === 'trialing' ? (
                        <div className="linha-flex entre">
                          <dt className="suave">Teste grátis até</dt>
                          <dd className="forte">{fmtDate(subscription.trialEnd)}</dd>
                        </div>
                      ) : (
                        <div className="linha-flex entre">
                          <dt className="suave">{recurring && !bsub?.cancelAtPeriodEnd ? 'Próxima cobrança' : 'Vale até'}</dt>
                          <dd className="forte" data-testid="period-end">{fmtDate(subscription.currentPeriodEnd)}</dd>
                        </div>
                      )}
                      {recurring && (
                        <>
                          <div className="linha-flex entre">
                            <dt className="suave">Ciclo</dt>
                            <dd className="forte">{currentCycle === 'annual' ? 'Anual' : 'Mensal'}</dd>
                          </div>
                          {bsub?.cardLast4 && (
                            <div className="linha-flex entre">
                              <dt className="suave">Cartão</dt>
                              <dd className="forte" data-testid="card-on-file">{bsub.cardBrand ?? 'Cartão'} final {bsub.cardLast4}</dd>
                            </div>
                          )}
                        </>
                      )}
                    </dl>
                    {canSubscribe && currentPlanFull && (
                      <ul className="lista-ok" aria-label={`O plano ${currentPlanFull.name} inclui`}>
                        <li><Check className="ic" aria-hidden="true" /><span>Até {currentPlanFull.limits.maxConversationsMonthly.toLocaleString('pt-BR')} conversas analisadas por mês</span></li>
                        <li><Check className="ic" aria-hidden="true" /><span>{currentPlanFull.limits.maxAgents} agentes e {currentPlanFull.limits.maxConnections} {currentPlanFull.limits.maxConnections === 1 ? 'conexão' : 'conexões'} WhatsApp</span></li>
                        <li><Check className="ic" aria-hidden="true" /><span>{currentPlanFull.limits.maxAlertRules} regras de alerta</span></li>
                      </ul>
                    )}
                    {canSubscribe && (
                      <div className="plano-cta mt-auto" data-testid="subscribe-cta">
                        <p>
                          {status === 'trialing'
                            ? subscription.trialDaysLeft != null && subscription.trialDaysLeft > 0
                              ? `Faltam ${subscription.trialDaysLeft} ${subscription.trialDaysLeft === 1 ? 'dia' : 'dias'} de teste. Assine agora e continue sem interrupção: nada muda nos seus dados.`
                              : 'Seu teste termina hoje. Assine agora e continue sem interrupção: nada muda nos seus dados.'
                            : status === 'expired'
                              ? 'Seu teste grátis terminou e a análise das conversas está pausada. Assine para voltar a analisar: seus dados continuam guardados.'
                              : delinquent
                                ? 'A cobrança automática foi encerrada. Contrate o plano de novo para continuar: seus dados continuam guardados.'
                                : 'Sua assinatura foi encerrada. Assine de novo para voltar a analisar: seus dados continuam guardados.'}
                        </p>
                        <div className="plano-cta__acoes">
                          <button type="button" className="btn btn--primario btn--lg" onClick={() => startCheckout(subscription.plan.id, 'monthly')}>
                            Assinar o plano {subscription.plan.name}<ArrowRight className="ic" aria-hidden="true" />
                          </button>
                          <button type="button" className="btn btn--link" onClick={scrollToCompare}>Comparar planos</button>
                        </div>
                      </div>
                    )}
                    {canChangeCard && (
                      <div className="mt-auto flex flex-col sm:flex-row gap-2">
                        {canUpgrade && (
                          <button type="button" className="btn btn--primario flex-1" onClick={scrollToCompare}>
                            <ArrowUpCircle className="ic" aria-hidden="true" />Subir de plano
                          </button>
                        )}
                        <button type="button" className={`btn flex-1${delinquent ? ' btn--primario' : ''}`} onClick={() => setCardOpen(true)}>Trocar cartão</button>
                      </div>
                    )}
                    {canReactivate && (
                      <div className="mt-auto space-y-2" data-testid="renewal-canceled">
                        <p className="suave text-[13px]">A renovação automática está cancelada. O plano vale até {fmtDate(subscription.currentPeriodEnd)}; até lá, você pode reativá-la sem pagar nada agora.</p>
                        <button type="button" className="btn btn--sm btn--primario w-full sm:w-auto" onClick={() => setReactivateOpen(true)}>Reativar renovação</button>
                        {bsub?.withdrawal && (
                          <p className="suave text-xs" data-testid="withdrawal-offer">
                            Prefere encerrar agora? Até {fmtDateTime(bsub.withdrawal.until)} você ainda pode{' '}
                            <button type="button" className="link-texto" onClick={() => setWithdrawOpen(true)}>desistir e receber o reembolso</button>.
                          </p>
                        )}
                      </div>
                    )}
                    {!online && status !== 'active' && (
                      <p className="suave text-[13px]">Escolha um plano abaixo e use &quot;Solicitar troca&quot;: nossa equipe combina o pagamento com você.</p>
                    )}
                  </>
                ) : (
                  <p className="suave text-[13px]">Nenhuma assinatura ativa encontrada.</p>
                )}
              </div>
            </section>

            {/* Uso no mês */}
            <section className="cartao" data-tour="plans-usage" aria-labelledby="t-uso">
              <div className="cartao__cab">
                <div><h2 id="t-uso"><Sparkles className="ic verde-txt" aria-hidden="true" />Uso este mês</h2></div>
              </div>
              <div className="cartao__corpo space-y-5">
                {/* T11 · o que o plano deixou de analisar */}
                {analysis?.paused ? (
                  <p className="aviso aviso--ambar" role="status" data-testid="plans-analysis-paused">
                    {analysis.paused === 'trial_expired'
                      ? 'Seu teste grátis terminou'
                      : analysis.paused === 'payment_overdue'
                        ? 'O pagamento está em atraso há mais de 7 dias'
                        : 'Sua assinatura foi encerrada'}: a análise das conversas e os relatórios estão pausados.
                    Para proteger a sua privacidade, os números de WhatsApp são desconectados em até 2 dias e as mensagens param de chegar.
                    Seus dados continuam guardados e podem ser exportados em Configurações › Privacidade. Contrate um plano para voltar (cada número lê o QR Code de novo).
                  </p>
                ) : analysis && analysis.unanalyzed > 0 ? (
                  <p className="aviso aviso--ambar" role="status" data-testid="plans-quota-unanalyzed">
                    {analysis.unanalyzed} {analysis.unanalyzed === 1 ? 'conversa deste mês passou' : 'conversas deste mês passaram'} do limite do plano e não {analysis.unanalyzed === 1 ? 'foi analisada' : 'foram analisadas'}.
                    Elas estão guardadas e são analisadas quando o plano mudar para um limite maior ou quando o mês virar.
                  </p>
                ) : null}
                {usage && USAGE_METRICS.map((metric) => {
                  const entry = usage[metric.key]
                  if (!entry) return null
                  const pct = Math.min(100, entry.percentage)
                  const Icon = metric.icon
                  const isNear = pct > 80
                  return (
                    <div key={metric.key} className="space-y-1.5">
                      <div className="linha-flex entre">
                        <span className="linha-flex text-[13.5px] forte">
                          <span className={`dado-ic ${metric.tone} !w-7 !h-7 !text-[15px]`} aria-hidden="true"><Icon className="ic" /></span>
                          {metric.label}
                        </span>
                        <span className={`text-xs forte ${isNear ? 'laranja-txt' : 'suave'}`}>
                          {entry.current.toLocaleString('pt-BR')} / {entry.limit.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div
                        className={`barra ${isNear ? 'barra--laranja' : ''}`}
                        role="progressbar"
                        aria-label={`Uso de ${metric.label}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(pct)}
                      >
                        <i style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          {/* Comparativo de planos */}
          <section aria-labelledby="t-compare" className="scroll-mt-20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 id="t-compare" className="text-lg font-bold">Compare os planos</h2>
              {online && (
                <div className="ciclo-seg" role="radiogroup" aria-label="Ciclo de cobrança" data-testid="plans-cycle">
                  {(['monthly', 'annual'] as const).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)}>
                      {c === 'monthly' ? 'Mensal' : 'Anual'}
                      {c === 'annual' && <span className="ciclo-seg__selo">2 meses grátis</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div data-tour="plans-compare" className="grade grade-3 items-stretch">
              {plans.map((plan) => {
                const showCycle: Cycle = online ? cycle : 'monthly'
                const isCurrent = subscription?.plan.id === plan.id
                // no anual, o mensal do mesmo plano seria rebaixar: fica como "Plano atual"
                const isPaidCurrent = paidPlanId === plan.id && (!recurring || currentCycle === showCycle || showCycle === 'monthly')
                // assinante: plano abaixo do atual não é oferecido (só subir de plano)
                const isBelow = paying && plan.id !== subscription?.plan.id && plan.monthlyPrice <= currentMonthly
                const isHighlight = plan.highlight
                const includedFeatures = [
                  `Até ${plan.limits.maxConversationsMonthly.toLocaleString('pt-BR')} conversas/mês`,
                  `${plan.limits.maxAgents} agentes`,
                  `${plan.limits.maxConnections} conexão(ões) WhatsApp`,
                  `${plan.limits.maxAlertRules} regras de alerta`,
                ]
                const actionLabel = !online
                  ? 'Solicitar troca'
                  : paying
                    ? isCurrent ? 'Mudar para anual' : 'Subir para este plano'
                    : 'Assinar'
                return (
                  <article
                    key={plan.id}
                    data-testid={`plan-${plan.code}`}
                    aria-labelledby={`plano-${plan.code}`}
                    className={`cartao cartao--pad flex flex-col gap-4 ${isHighlight ? 'border-[var(--verde-500)] border-2' : ''} ${isCurrent ? 'ring-2 ring-[var(--verde-600)]' : ''}`}
                  >
                    <div className="linha-flex entre">
                      {isHighlight ? (
                        <span className="tag tag--verde"><Rocket className="ic" aria-hidden="true" />Mais popular</span>
                      ) : <span />}
                      {isCurrent && <span className="tag tag--azul">Seu plano</span>}
                    </div>
                    <div className="resumo-plano__nome">
                      <span className="coroa coroa--sm" aria-hidden="true"><PlanIcon code={plan.code} /></span>
                      <div>
                        <b id={`plano-${plan.code}`}>{plan.name}</b>
                        <span className="preco text-xl">
                          {formatCurrency(priceOf(plan, showCycle))}
                          <small className="inline">{showCycle === 'annual' ? '/ano' : '/mês'}</small>
                        </span>
                        {showCycle === 'annual' && <small>equivale a {formatCurrency(plan.annualPrice / 12)}/mês</small>}
                      </div>
                    </div>
                    {plan.description && <p className="suave text-[13px]">{plan.description}</p>}
                    <ul className="lista-ok">
                      {includedFeatures.map((f) => (
                        <li key={f}><Check className="ic" aria-hidden="true" /><span>{f}</span></li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-2">
                      {isPaidCurrent ? (
                        <button type="button" className="btn w-full" disabled>
                          Plano atual
                        </button>
                      ) : isBelow ? (
                        <p className="suave text-center text-[13px]" data-testid="plan-below">Seu plano atual já inclui mais que este.</p>
                      ) : (
                        <button
                          type="button"
                          className={`btn w-full ${isHighlight ? 'btn--primario' : 'btn--contorno-verde'}`}
                          disabled={changingPlanId === plan.id || !!bsub?.pending}
                          onClick={() => (online ? startCheckout(plan.id, showCycle) : handleRequest(plan.id, plan.name))}
                        >
                          {changingPlanId === plan.id ? 'Enviando...' : actionLabel}
                          <ArrowRight className="ic" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {/* Faturas */}
          {online && (
            <section className="cartao" data-testid="invoices" aria-labelledby="t-faturas">
              <div className="cartao__cab">
                <div>
                  <h2 id="t-faturas"><Receipt className="ic verde-txt" aria-hidden="true" />Faturas</h2>
                  <p>Cobranças feitas no cartão pelo Pagar.me.</p>
                </div>
              </div>
              <div className="cartao__corpo">
                {(billing?.invoices ?? []).length === 0 ? (
                  <p className="suave text-[13px]">Nenhuma fatura ainda.</p>
                ) : (
                  <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Faturas">
                    <table className="tabela tabela--cab-cinza">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Plano</th>
                          <th>Período</th>
                          <th className="direita">Valor</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(billing?.invoices ?? []).map((inv) => {
                          const st = INVOICE_STATUS[inv.status] ?? { label: inv.status, tag: 'tag--cinza' }
                          return (
                            <tr key={inv.id}>
                              <td className="whitespace-nowrap">{fmtDate(inv.paidAt ?? inv.dueAt ?? inv.createdAt)}</td>
                              <td>{inv.planName ?? '—'}{inv.billingCycle === 'annual' ? ' (anual)' : ''}</td>
                              <td className="whitespace-nowrap">{inv.periodStart ? `${fmtDate(inv.periodStart)} a ${fmtDate(inv.periodEnd)}` : '—'}</td>
                              <td className="direita forte">{formatCurrency(inv.amount)}</td>
                              <td>
                                <span className={`tag ${st.tag}`}>{st.label}</span>
                                {inv.failureMessage && inv.status === 'failed' && <p className="suave text-xs mt-1">{inv.failureMessage}</p>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {recurring && active && !bsub?.cancelAtPeriodEnd && !bsub?.pending && (
                  <p className="suave text-xs mt-4" data-testid="cancel-subscription-hint">
                    Precisa parar a assinatura?{' '}
                    <button type="button" className="link-texto" onClick={() => setCancelOpen(true)}>Cancelar assinatura</button>
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Comparação detalhada */}
          <section className="cartao" aria-labelledby="t-recursos">
            <div className="cartao__cab">
              <div>
                <h2 id="t-recursos">Comparação detalhada de recursos</h2>
                <p>Veja o que cada plano oferece em detalhes.</p>
              </div>
            </div>
            <div className="cartao__corpo">
              <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Comparação detalhada de recursos">
                <table className="tabela tabela--cab-cinza">
                  <thead>
                    <tr>
                      <th className="w-1/3">Recurso</th>
                      {plans.map((plan) => (
                        <th key={plan.id} className="centro">{plan.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARE_ROWS.map((row) => (
                      <tr key={row.label}>
                        <td className="forte">{row.label}</td>
                        {plans.map((plan) => (
                          <td key={plan.id} className="centro">{row.value(plan)}</td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-[var(--superficie-2)]">
                      <td className="forte">Preço</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="centro forte">
                          {formatCurrency(plan.monthlyPrice)}/mês
                          <span className="block text-xs font-normal suave">ou {formatCurrency(plan.annualPrice)}/ano</span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {billing?.publicKey && (
        <ReplaceCardDialog open={cardOpen} onOpenChange={setCardOpen} publicKey={billing.publicKey} onDone={() => { setCardOpen(false); incrementRefresh() }} />
      )}

      <AlertDialog open={reactivateOpen} onOpenChange={(o) => !reactivating && setReactivateOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar a renovação automática?</AlertDialogTitle>
            <AlertDialogDescription>
              Nada é cobrado agora. No fim do período já pago ({fmtDate(subscription?.currentPeriodEnd ?? null)}), o plano {subscription?.plan.name} volta a ser cobrado
              {bsub?.renewalAmount != null ? ` (${formatCurrency(bsub.renewalAmount)} ${currentCycle === 'annual' ? 'por ano' : 'por mês'})` : ''}
              {bsub?.cardLast4 ? ` no cartão ${bsub.cardBrand ?? ''} final ${bsub.cardLast4}` : ' no mesmo cartão'} e segue renovando até você cancelar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reactivating}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); reactivateRenewal() }} disabled={reactivating}>
              {reactivating ? 'Reativando…' : 'Reativar renovação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancelar: nos 7 dias do arrependimento a pessoa escolhe entre usar até o fim do período ou encerrar com reembolso;
          depois disso, cancelar só para a renovação (nada é cobrado no ciclo seguinte e o plano vale até o fim do atual). */}
      <Dialog open={cancelOpen} onOpenChange={(o) => !canceling && setCancelOpen(o)}>
        <DialogContent className="sm:max-w-lg" data-testid="cancel-dialog">
          <DialogHeader>
            <DialogTitle>Cancelar a assinatura</DialogTitle>
            <DialogDescription>
              {bsub?.withdrawal
                ? `A contratação foi há menos de 7 dias, então você escolhe como encerrar o plano ${subscription?.plan.name ?? ''}:`
                : `Nada é cobrado no próximo ${currentCycle === 'annual' ? 'ano' : 'mês'}. O plano ${subscription?.plan.name ?? ''} continua ativo até ${fmtDate(subscription?.currentPeriodEnd ?? null)}; depois disso, o cadastro de novos itens fica bloqueado até você assinar de novo. Se mudar de ideia antes, é só reativar a renovação aqui em Planos.`}
            </DialogDescription>
          </DialogHeader>
          {bsub?.withdrawal && (
            <div className="grid gap-2">
              <button type="button" className="opcao-cancelar" disabled={canceling} onClick={cancelRenewal}>
                <CalendarCheck className="ic" aria-hidden="true" />
                <span>
                  <b>{canceling ? 'Cancelando…' : `Usar até ${fmtDate(subscription?.currentPeriodEnd ?? null)} e não renovar`}</b>
                  <span>Nada mais é cobrado. O plano segue ativo até o fim do período já pago, sem reembolso.</span>
                </span>
              </button>
              <button type="button" className="opcao-cancelar" disabled={canceling} onClick={() => { setCancelOpen(false); setWithdrawOpen(true) }}>
                <Undo2 className="ic" aria-hidden="true" />
                <span>
                  <b>Encerrar agora e receber o reembolso</b>
                  <span>Devolvemos {formatCurrency(bsub.withdrawal.amount)}{bsub.cardLast4 ? ` no cartão final ${bsub.cardLast4}` : ' no cartão'} e o plano termina hoje. Possível até {fmtDateTime(bsub.withdrawal.until)}.</span>
                </span>
              </button>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={canceling}>Manter assinatura</Button>
            {!bsub?.withdrawal && (
              <Button type="button" variant="destructive" onClick={cancelRenewal} disabled={canceling}>
                {canceling ? 'Cancelando…' : 'Cancelar renovação'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={withdrawOpen} onOpenChange={(o) => !withdrawing && setWithdrawOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desistir da contratação e receber o reembolso?</AlertDialogTitle>
            <AlertDialogDescription>
              O plano {subscription?.plan.name} termina agora, a renovação automática é cancelada e o valor integral
              {bsub?.withdrawal ? ` (${formatCurrency(bsub.withdrawal.amount)})` : ''} é estornado
              {bsub?.cardLast4 ? ` no cartão final ${bsub.cardLast4}` : ' no mesmo cartão'}. O crédito aparece na fatura do cartão conforme o prazo do banco emissor.
              Seus dados continuam guardados; para voltar a usar, é só contratar de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawing}>Manter o plano</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); withdrawNow() }} disabled={withdrawing} className="bg-destructive text-white hover:bg-destructive/90">
              {withdrawing ? 'Processando…' : 'Desistir e estornar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ReplaceCardDialog({ open, onOpenChange, publicKey, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; publicKey: string; onDone: () => void }) {
  const [card, setCard] = useState<CardValue>(EMPTY_CARD)
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setCard(EMPTY_CARD); setErr(null) }
  }, [open])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = cardProblem(card) || addressProblem(address)
    if (problem) { setErr(problem); return }
    setErr(null)
    setSaving(true)
    try {
      const cardToken = await tokenizeCard(publicKey, card)
      const res = await fetch('/api/billing/card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardToken, address }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Não foi possível trocar o cartão.')
      toast.success('Cartão trocado.', { description: data.cardLast4 ? `As próximas cobranças vão no cartão final ${data.cardLast4}.` : undefined })
      onDone()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Não foi possível trocar o cartão.')
      setCard((c) => ({ ...c, cvv: '' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={save} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Trocar cartão</DialogTitle>
            <DialogDescription>As próximas cobranças automáticas vão neste cartão. Os dados vão direto ao Pagar.me.</DialogDescription>
          </DialogHeader>
          <CardFields value={card} onChange={setCard} disabled={saving} />
          <div className="space-y-2">
            <p className="text-sm font-medium">Endereço de cobrança</p>
            <AddressFields value={address} onChange={setAddress} disabled={saving} idPrefix="card-addr" />
          </div>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Voltar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar cartão'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
