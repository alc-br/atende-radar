'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Check, X, Crown, Zap, Rocket, MessageSquare, Users, Wifi,
  CreditCard, ArrowRight, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

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
  cancelAtPeriodEnd: boolean
}

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
}

const FEATURE_LABELS: Record<string, string> = {
  basic_dashboard: 'Dashboard básico',
  conversation_audit: 'Auditoria de conversas',
  daily_report: 'Relatórios diários',
  alert_rules: 'Alertas configuráveis',
  team_management: 'Gestão de equipes',
  advanced_dashboard: 'Dashboard avançado',
  custom_reports: 'Relatórios personalizados',
  api_access: 'Acesso à API',
}

const USAGE_METRICS: { key: 'conversations' | 'messages' | 'agents' | 'connections'; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'conversations', label: 'Conversas', icon: MessageSquare, color: 'text-primary' },
  { key: 'messages', label: 'Mensagens', icon: MessageSquare, color: 'text-emerald-500' },
  { key: 'agents', label: 'Agentes', icon: Users, color: 'text-amber-500' },
  { key: 'connections', label: 'Conexões', icon: Wifi, color: 'text-purple-500' },
]

export default function PlansView() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plans, setPlans] = useState<ApiPlan[]>([])
  const [featureKeys, setFeatureKeys] = useState<string[]>([])
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [usage, setUsage] = useState<Record<string, UsageEntry> | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [plansRes, subRes] = await Promise.all([
        fetch('/api/plans'),
        fetch('/api/subscription'),
      ])
      if (!plansRes.ok || !subRes.ok) throw new Error('Erro ao carregar planos')
      const plansData = await plansRes.json()
      const subData = await subRes.json()
      setPlans(plansData.plans || [])
      setFeatureKeys(plansData.featureKeys || [])
      setSubscription(subData.subscription || null)
      setUsage(subData.usage || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const [changingPlanId, setChangingPlanId] = useState<string | null>(null)

  const handleUpgrade = async (planId: string, planName: string) => {
    setChangingPlanId(planId)
    try {
      const res = await fetch('/api/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao mudar de plano')
      }
      toast.success(`Plano alterado para ${planName}.`)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao mudar de plano')
    } finally {
      setChangingPlanId(null)
    }
  }

  const renderCell = (value: boolean | string | number) => {
    if (typeof value === 'boolean') {
      return value
        ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current plan card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CreditCard className="w-5 h-5" />
                    Plano atual
                  </CardTitle>
                  {subscription && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      {STATUS_LABELS[subscription.status] || subscription.status}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {subscription ? (
                  <>
                    <div>
                      <p className="text-3xl font-bold">
                        {formatCurrency(subscription.plan.monthlyPrice)}
                        <span className="text-base font-normal text-muted-foreground">/mês</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Plano {subscription.plan.name}</p>
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Próxima cobrança</span>
                        <span className="font-medium">
                          {new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ciclo</span>
                        <span className="font-medium">Mensal</span>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full" size="sm">
                      Gerenciar assinatura
                    </Button>
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
                        <span className={`text-xs font-medium ${isNear ? 'text-amber-500' : 'text-muted-foreground'}`}>
                          {entry.current.toLocaleString('pt-BR')} / {entry.limit.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          {/* Plan comparison cards */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Compare os planos</h2>
            <div data-tour="plans-compare" className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const isCurrent = subscription?.plan.id === plan.id
                const isHighlight = plan.highlight
                const Icon = PLAN_ICONS[plan.code] || Zap
                const includedFeatures = Object.entries(plan.features)
                  .filter(([, v]) => v === true)
                  .map(([key]) => FEATURE_LABELS[key] || key)
                return (
                  <Card
                    key={plan.id}
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
                      <div className="mx-auto w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                        <Icon className="w-5 h-5" />
                      </div>
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      {plan.description && (
                        <CardDescription>{plan.description}</CardDescription>
                      )}
                      <div className="mt-2">
                        <span className="text-3xl font-bold">{formatCurrency(plan.monthlyPrice)}</span>
                        <span className="text-muted-foreground">/mês</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Até {plan.limits.maxConversationsMonthly.toLocaleString('pt-BR')} conversas/mês</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{plan.limits.maxAgents} agentes</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{plan.limits.maxConnections} conexão(ões) WhatsApp</span>
                        </li>
                        {includedFeatures.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      {isCurrent ? (
                        <Button variant="outline" className="w-full" disabled>
                          Plano atual
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant={isHighlight ? 'default' : 'outline'}
                          disabled={changingPlanId === plan.id}
                          onClick={() => handleUpgrade(plan.id, plan.name)}
                        >
                          {changingPlanId === plan.id ? 'Alterando...' : 'Fazer upgrade'}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          </div>

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
                    {featureKeys.map((key) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium text-sm">{FEATURE_LABELS[key] || key}</TableCell>
                        {plans.map((plan) => (
                          <TableCell key={plan.id} className="text-center">
                            {renderCell(Boolean(plan.features[key]))}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-bold">Preço</TableCell>
                      {plans.map((plan) => (
                        <TableCell key={plan.id} className="text-center font-bold">
                          {formatCurrency(plan.monthlyPrice)}/mês
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
    </div>
  )
}
