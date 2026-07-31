'use client'

import { useState, useEffect } from 'react'
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

interface UsageMetric {
  label: string
  used: number
  limit: number
  icon: React.ElementType
  color: string
}

interface Plan {
  id: string
  name: string
  price: number
  cycle: string
  features: string[]
  highlight?: boolean
  current?: boolean
}

const CURRENT_PLAN = {
  name: 'Gestão',
  price: 299,
  cycle: 'mensal',
  status: 'Ativa',
  nextBilling: '15/02/2025',
}

const USAGE_METRICS: UsageMetric[] = [
  { label: 'Conversas', used: 847, limit: 2000, icon: MessageSquare, color: 'text-primary' },
  { label: 'Mensagens', used: 12340, limit: 30000, icon: MessageSquare, color: 'text-emerald-500' },
  { label: 'Agentes', used: 5, limit: 10, icon: Users, color: 'text-amber-500' },
  { label: 'Conexões', used: 2, limit: 5, icon: Wifi, color: 'text-purple-500' },
]

const PLANS: Plan[] = [
  {
    id: 'essencial',
    name: 'Essencial',
    price: 149,
    cycle: 'mensal',
    features: [
      'Até 500 conversas/mês',
      '2 agentes',
      '1 conexão WhatsApp',
      'Relatórios diários',
      'Alertas básicos',
      'Funil auditado',
      'Suporte por e-mail',
    ],
  },
  {
    id: 'gestao',
    name: 'Gestão',
    price: 299,
    cycle: 'mensal',
    features: [
      'Até 2.000 conversas/mês',
      '10 agentes',
      '5 conexões WhatsApp',
      'Relatórios diários e semanais',
      'Alertas avançados com IA',
      'Funil auditado + métricas',
      'Gestão de equipes',
      'Suporte prioritário',
      'API de integração',
    ],
    current: true,
  },
  {
    id: 'performance',
    name: 'Performance',
    price: 599,
    cycle: 'mensal',
    features: [
      'Conversas ilimitadas',
      'Agentes ilimitados',
      'Conexões ilimitadas',
      'Relatórios personalizados',
      'IA preditiva de risco',
      'Dashboard executivo',
      'Multi-unidades',
      'SLA garantido',
      'Gerente de sucesso dedicado',
      'API completa + Webhooks',
    ],
    highlight: true,
  },
]

const COMPARISON_FEATURES = [
  { name: 'Conversas/mês', essencial: '500', gestao: '2.000', performance: 'Ilimitado' },
  { name: 'Agentes', essencial: '2', gestao: '10', performance: 'Ilimitado' },
  { name: 'Conexões WhatsApp', essencial: '1', gestao: '5', performance: 'Ilimitado' },
  { name: 'Relatórios diários', essencial: true, gestao: true, performance: true },
  { name: 'Relatórios semanais', essencial: false, gestao: true, performance: true },
  { name: 'Alertas com IA', essencial: false, gestao: true, performance: true },
  { name: 'Gestão de equipes', essencial: false, gestao: true, performance: true },
  { name: 'IA preditiva', essencial: false, gestao: false, performance: true },
  { name: 'Dashboard executivo', essencial: false, gestao: false, performance: true },
  { name: 'Multi-unidades', essencial: false, gestao: false, performance: true },
  { name: 'API + Webhooks', essencial: false, gestao: true, performance: true },
  { name: 'Suporte prioritário', essencial: false, gestao: true, performance: true },
  { name: 'Gerente de sucesso', essencial: false, gestao: false, performance: true },
]

export default function PlansView() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  const handleUpgrade = (planName: string) => {
    toast.success(`Solicitação de upgrade para o plano ${planName} enviada!`)
  }

  const renderCell = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value
        ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
        : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
    }
    return <span className="text-sm font-medium">{value}</span>
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
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {CURRENT_PLAN.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-3xl font-bold">
                    R$ {CURRENT_PLAN.price}<span className="text-base font-normal text-muted-foreground">/{CURRENT_PLAN.cycle}</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Plano {CURRENT_PLAN.name}</p>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Próxima cobrança</span>
                    <span className="font-medium">{CURRENT_PLAN.nextBilling}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ciclo</span>
                    <span className="font-medium capitalize">{CURRENT_PLAN.cycle}</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full" size="sm">
                  Gerenciar assinatura
                </Button>
              </CardContent>
            </Card>

            {/* Usage metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="w-5 h-5" />
                  Uso este mês
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {USAGE_METRICS.map((metric) => {
                  const pct = Math.round((metric.used / metric.limit) * 100)
                  const Icon = metric.icon
                  const isNear = pct > 80
                  return (
                    <div key={metric.label} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${metric.color}`} />
                          <span className="text-sm font-medium">{metric.label}</span>
                        </div>
                        <span className={`text-xs font-medium ${isNear ? 'text-amber-500' : 'text-muted-foreground'}`}>
                          {metric.used.toLocaleString('pt-BR')} / {metric.limit.toLocaleString('pt-BR')}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLANS.map((plan) => {
                const isCurrent = plan.current
                const isHighlight = plan.highlight
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
                        {plan.id === 'essencial' ? <Zap className="w-5 h-5" />
                          : plan.id === 'gestao' ? <Crown className="w-5 h-5" />
                            : <Rocket className="w-5 h-5" />}
                      </div>
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <div className="mt-2">
                        <span className="text-3xl font-bold">R$ {plan.price}</span>
                        <span className="text-muted-foreground">/{plan.cycle}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-2">
                        {plan.features.map((f) => (
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
                          onClick={() => handleUpgrade(plan.name)}
                        >
                          {isCurrent ? 'Plano atual' : 'Fazer upgrade'}
                          {!isCurrent && <ArrowRight className="w-4 h-4 ml-2" />}
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
                      <TableHead className="text-center">Essencial</TableHead>
                      <TableHead className="text-center">Gestão</TableHead>
                      <TableHead className="text-center">Performance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {COMPARISON_FEATURES.map((f) => (
                      <TableRow key={f.name}>
                        <TableCell className="font-medium text-sm">{f.name}</TableCell>
                        <TableCell className="text-center">{renderCell(f.essencial)}</TableCell>
                        <TableCell className="text-center bg-primary/5">{renderCell(f.gestao)}</TableCell>
                        <TableCell className="text-center">{renderCell(f.performance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-bold">Preço</TableCell>
                      <TableCell className="text-center font-bold">R$ 149/mês</TableCell>
                      <TableCell className="text-center font-bold bg-primary/5">R$ 299/mês</TableCell>
                      <TableCell className="text-center font-bold">R$ 599/mês</TableCell>
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
