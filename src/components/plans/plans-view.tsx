'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Check, X, Crown, Zap, Rocket, MessageSquare, Users, Wifi,
  CreditCard, ArrowRight, Sparkles, AlertTriangle, Loader2, Receipt,
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

const STATUS_CLASSES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  trialing: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  past_due: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paga', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  pending: { label: 'Pendente', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  failed: { label: 'Recusada', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  canceled: { label: 'Cancelada', className: 'bg-muted text-muted-foreground' },
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

// Os planos se diferenciam pelos LIMITES (aplicados de verdade nas cotas). A lista de "recursos" do catálogo não é
// aplicada a ninguém hoje, então não é exibida (nada de comparativo decorativo).

const USAGE_METRICS: { key: 'conversations' | 'messages' | 'agents' | 'connections'; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'conversations', label: 'Conversas', icon: MessageSquare, color: 'text-primary' },
  { key: 'messages', label: 'Mensagens', icon: MessageSquare, color: 'text-emerald-700 dark:text-emerald-400' },
  { key: 'agents', label: 'Agentes', icon: Users, color: 'text-amber-700 dark:text-amber-400' },
  { key: 'connections', label: 'Conexões', icon: Wifi, color: 'text-purple-500' },
]

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

  const renderCell = (value: boolean | string | number) => {
    if (typeof value === 'boolean') {
      return value
        ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 mx-auto" />
        : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
    }
    return <span className="text-sm font-medium">{value}</span>
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={fetchData} className="text-sm text-primary underline">Tentar novamente</button>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Planos e Faturamento</h1>
        <p className="text-muted-foreground mt-1">Gerencie sua assinatura e acompanhe o uso.</p>
      </div>

      {/* Current plan + usage */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <>
          {billing?.mode === 'test' && (
            <p className="text-xs text-muted-foreground" data-testid="billing-test-mode">Pagamentos em ambiente de testes do Pagar.me: nenhuma cobrança real é feita.</p>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current plan card */}
            <Card data-testid="current-plan">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CreditCard className="w-5 h-5" />
                    Plano atual
                  </CardTitle>
                  {subscription && (
                    <Badge className={STATUS_CLASSES[status] || 'bg-muted text-muted-foreground'} data-testid="subscription-status">
                      {bsub?.cancelAtPeriodEnd && active ? 'Não renova' : STATUS_LABELS[status] || status}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {subscription ? (
                  <>
                    <div>
                      <p className="text-3xl font-bold">
                        {formatCurrency(priceOf(subscription.plan, currentCycle))}
                        <span className="text-base font-normal text-muted-foreground">{currentCycle === 'annual' ? '/ano' : '/mês'}</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Plano {subscription.plan.name}</p>
                    </div>
                    {bsub?.lastPaymentError && status === 'past_due' && (
                      <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" role="alert">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>A última cobrança foi recusada: {bsub.lastPaymentError} Troque o cartão: as próximas tentativas de cobrança usam o cartão novo.</span>
                      </div>
                    )}
                    {bsub?.pending && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Troca de plano aguardando a confirmação do pagamento.</p>
                    )}
                    <div className="border-t pt-3 space-y-2">
                      {status === 'trialing' ? (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Teste grátis até</span>
                          <span className="font-medium">{fmtDate(subscription.trialEnd)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{recurring && !bsub?.cancelAtPeriodEnd ? 'Próxima cobrança' : 'Vale até'}</span>
                          <span className="font-medium" data-testid="period-end">{fmtDate(subscription.currentPeriodEnd)}</span>
                        </div>
                      )}
                      {recurring && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Ciclo</span>
                            <span className="font-medium">{currentCycle === 'annual' ? 'Anual' : 'Mensal'}</span>
                          </div>
                          {bsub?.cardLast4 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Cartão</span>
                              <span className="font-medium" data-testid="card-on-file">{bsub.cardBrand ?? 'Cartão'} final {bsub.cardLast4}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {recurring && !bsub?.cancelAtPeriodEnd && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setCardOpen(true)}>Trocar cartão</Button>
                        <Button variant="ghost" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>Cancelar renovação</Button>
                      </div>
                    )}
                    {!recurring && online && status !== 'active' && (
                      <p className="text-sm text-muted-foreground">Escolha um plano abaixo para contratar com cartão de crédito.</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma assinatura ativa encontrada.</p>
                )}
              </CardContent>
            </Card>

            {/* Usage metrics */}
            <Card data-tour="plans-usage">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="w-5 h-5" />
                  Uso este mês
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {usage && USAGE_METRICS.map((metric) => {
                  const entry = usage[metric.key]
                  if (!entry) return null
                  const pct = Math.min(100, entry.percentage)
                  const Icon = metric.icon
                  const isNear = pct > 80
                  return (
                    <div key={metric.key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${metric.color}`} />
                          <span className="text-sm font-medium">{metric.label}</span>
                        </div>
                        <span className={`text-xs font-medium ${isNear ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                          {entry.current.toLocaleString('pt-BR')} / {entry.limit.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" aria-label={`Uso de ${metric.label}`} />
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          {/* Plan comparison cards */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold">Compare os planos</h2>
              {online && (
                <ToggleGroup type="single" variant="outline" value={cycle} onValueChange={(v) => v && setCycle(v as Cycle)} aria-label="Ciclo de cobrança">
                  <ToggleGroupItem value="monthly" className="px-4">Mensal</ToggleGroupItem>
                  <ToggleGroupItem value="annual" className="px-4">Anual <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-400">2 meses grátis</span></ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
            <div data-tour="plans-compare" className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const showCycle: Cycle = online ? cycle : 'monthly'
                const isCurrent = subscription?.plan.id === plan.id
                const isPaidCurrent = paidPlanId === plan.id && (!recurring || currentCycle === showCycle)
                const isHighlight = plan.highlight
                const Icon = PLAN_ICONS[plan.code] || Zap
                const includedFeatures = [
                  `${plan.limits.maxAlertRules} regras de alerta`,
                  `Histórico de ${plan.limits.retentionDays} dias`,
                ]
                const actionLabel = !online
                  ? 'Solicitar troca'
                  : active && recurring
                    ? isCurrent ? `Mudar para ${showCycle === 'annual' ? 'anual' : 'mensal'}` : 'Mudar para este plano'
                    : 'Assinar'
                return (
                  <Card
                    key={plan.id}
                    data-testid={`plan-${plan.code}`}
                    className={`relative ${isHighlight ? 'border-primary shadow-lg shadow-primary/5' : ''} ${isCurrent ? 'ring-2 ring-primary' : ''}`}
                  >
                    {isHighlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground shadow-sm">
                          <Rocket className="w-3 h-3 mr-1" /> Mais popular
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pt-6">
                      <div className="mx-auto w-10 h-10 rounded-lg bg-primary/10 text-foreground flex items-center justify-center mb-2">
                        <Icon className="w-5 h-5" />
                      </div>
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      {plan.description && (
                        <CardDescription>{plan.description}</CardDescription>
                      )}
                      <div className="mt-2">
                        <span className="text-3xl font-bold">{formatCurrency(priceOf(plan, showCycle))}</span>
                        <span className="text-muted-foreground">{showCycle === 'annual' ? '/ano' : '/mês'}</span>
                      </div>
                      {showCycle === 'annual' && (
                        <p className="text-xs text-muted-foreground">equivale a {formatCurrency(plan.annualPrice / 12)}/mês</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>Até {plan.limits.maxConversationsMonthly.toLocaleString('pt-BR')} conversas/mês</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>{plan.limits.maxAgents} agentes</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>{plan.limits.maxConnections} conexão(ões) WhatsApp</span>
                        </li>
                        {includedFeatures.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      {isPaidCurrent ? (
                        <Button variant="outline" className="w-full" disabled>
                          Plano atual
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant={isHighlight ? 'default' : 'outline'}
                          disabled={changingPlanId === plan.id || !!bsub?.pending}
                          onClick={() => (online ? startCheckout(plan.id, showCycle) : handleRequest(plan.id, plan.name))}
                        >
                          {changingPlanId === plan.id ? 'Enviando...' : actionLabel}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Invoices */}
          {online && (
            <Card data-testid="invoices">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Receipt className="w-5 h-5" /> Faturas</CardTitle>
                <CardDescription>Cobranças feitas no cartão pelo Pagar.me.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {(billing?.invoices ?? []).length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Plano</TableHead>
                          <TableHead>Período</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Situação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(billing?.invoices ?? []).map((inv) => {
                          const st = INVOICE_STATUS[inv.status] ?? { label: inv.status, className: 'bg-muted text-muted-foreground' }
                          return (
                            <TableRow key={inv.id}>
                              <TableCell className="text-sm whitespace-nowrap">{fmtDate(inv.paidAt ?? inv.dueAt ?? inv.createdAt)}</TableCell>
                              <TableCell className="text-sm">{inv.planName ?? '—'}{inv.billingCycle === 'annual' ? ' (anual)' : ''}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{inv.periodStart ? `${fmtDate(inv.periodStart)} a ${fmtDate(inv.periodEnd)}` : '—'}</TableCell>
                              <TableCell className="text-sm text-right font-medium">{formatCurrency(inv.amount)}</TableCell>
                              <TableCell>
                                <Badge className={st.className}>{st.label}</Badge>
                                {inv.failureMessage && inv.status === 'failed' && <p className="text-xs text-muted-foreground mt-1">{inv.failureMessage}</p>}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Feature comparison table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Comparação detalhada de recursos</CardTitle>
              <CardDescription>Veja o que cada plano oferece em detalhes.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">Recurso</TableHead>
                      {plans.map((plan) => (
                        <TableHead key={plan.id} className="text-center">{plan.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium text-sm">Conversas/mês</TableCell>
                      {plans.map((plan) => (
                        <TableCell key={plan.id} className="text-center">
                          {renderCell(plan.limits.maxConversationsMonthly.toLocaleString('pt-BR'))}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-sm">Agentes</TableCell>
                      {plans.map((plan) => (
                        <TableCell key={plan.id} className="text-center">
                          {renderCell(plan.limits.maxAgents)}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-sm">Conexões WhatsApp</TableCell>
                      {plans.map((plan) => (
                        <TableCell key={plan.id} className="text-center">
                          {renderCell(plan.limits.maxConnections)}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-sm">Mensagens/mês</TableCell>
                      {plans.map((plan) => (
                        <TableCell key={plan.id} className="text-center">{renderCell(plan.limits.maxMessagesMonthly.toLocaleString('pt-BR'))}</TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-sm">Regras de alerta</TableCell>
                      {plans.map((plan) => (
                        <TableCell key={plan.id} className="text-center">{renderCell(plan.limits.maxAlertRules)}</TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-sm">Histórico (dias)</TableCell>
                      {plans.map((plan) => (
                        <TableCell key={plan.id} className="text-center">{renderCell(plan.limits.retentionDays)}</TableCell>
                      ))}
                    </TableRow>
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-bold">Preço</TableCell>
                      {plans.map((plan) => (
                        <TableCell key={plan.id} className="text-center font-bold">
                          {formatCurrency(plan.monthlyPrice)}/mês
                          <span className="block text-xs font-normal text-muted-foreground">ou {formatCurrency(plan.annualPrice)}/ano</span>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {billing?.publicKey && (
        <ReplaceCardDialog open={cardOpen} onOpenChange={setCardOpen} publicKey={billing.publicKey} onDone={() => { setCardOpen(false); incrementRefresh() }} />
      )}

      <AlertDialog open={cancelOpen} onOpenChange={(o) => !canceling && setCancelOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a renovação automática?</AlertDialogTitle>
            <AlertDialogDescription>
              Nenhuma nova cobrança será feita. O plano {subscription?.plan.name} continua valendo até {fmtDate(subscription?.currentPeriodEnd ?? null)}; depois disso, o cadastro de novos itens fica bloqueado até você contratar de novo. Não há reembolso do período já pago.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Manter assinatura</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); cancelRenewal() }} disabled={canceling} className="bg-destructive text-white hover:bg-destructive/90">
              {canceling ? 'Cancelando…' : 'Cancelar renovação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
