'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Shield, Zap, BarChart3, MessageSquare, DollarSign, Clock,
  Users, ArrowRight, CheckCircle2, Star, Bot, FileText,
  Radio, Sparkles, Target, TrendingUp, Eye, Phone, ChevronRight, Menu,
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const painPoints = [
  {
    icon: Eye,
    title: 'Falta de visibilidade',
    description: 'Sem saber o que acontece nas conversas do WhatsApp, sua equipe opera no escuro e perde oportunidades diariamente.',
  },
  {
    icon: DollarSign,
    title: 'Receita escorrendo',
    description: 'Clientes com intenção de compra são esquecidos, agendamentos não confirmados e vendas fechadas desperdiçadas.',
  },
  {
    icon: Clock,
    title: 'Tempo de resposta lento',
    description: 'Cada minuto de atraso na primeira resposta reduz drasticamente a chance de conversão.',
  },
  {
    icon: BarChart3,
    title: 'Sem métricas de qualidade',
    description: 'Impossível melhorar o que não se mede. Sem scores de qualidade, não há como treinar a equipe de forma objetiva.',
  },
]

const features = [
  {
    icon: Bot,
    title: 'Análise Automática',
    description: 'Identifica intenções, oportunidades e falhas de atendimento nas conversas, com regras claras e explicáveis.',
  },
  {
    icon: Target,
    title: 'Notas de Qualidade',
    description: 'Score composto por 5 dimensões: velocidade, oportunidades, pendências, qualidade e recuperação.',
  },
  {
    icon: Zap,
    title: 'Alertas Inteligentes',
    description: 'Regras configuráveis com severidade e cooldown para notificar sua equipe no momento certo.',
  },
  {
    icon: TrendingUp,
    title: 'Recuperação de Receita',
    description: 'Fila priorizada de oportunidades perdidas, prontas para serem recuperadas por sua equipe.',
  },
  {
    icon: FileText,
    title: 'Relatórios Automáticos',
    description: '8 tipos de relatório com agendamento para manter gestores sempre informados.',
  },
  {
    icon: Radio,
    title: 'Conexões Multi-WhatsApp',
    description: 'Conecte mais de um número de WhatsApp, conforme o seu plano.',
  },
]

const steps = [
  {
    number: '01',
    icon: Phone,
    title: 'Conecte seu WhatsApp',
    description: 'Integre em minutos com QR Code. Sem alteração na operação atual da sua equipe.',
  },
  {
    number: '02',
    icon: Sparkles,
    title: 'AtendeRadar analisa',
    description: 'O AtendeRadar analisa cada conversa e detecta oportunidades, falhas e riscos automaticamente.',
  },
  {
    number: '03',
    icon: ArrowRight,
    title: 'Aja com dados',
    description: 'Receba alertas, acesse relatórios e recupere receita que antes era invisível.',
  },
]

interface PublicPlan {
  code: string
  name: string
  description: string | null
  monthlyPrice: number
  highlight: boolean
  trialDays: number
  limits: { maxConnections: number; maxAgents: number; maxConversationsMonthly: number; retentionDays: number; maxAlertRules: number }
  features: Record<string, boolean>
}

// Só lista o que o produto de fato entrega hoje (sem "API" nem "relatórios personalizados", que ainda não existem).
function planBullets(p: PublicPlan): string[] {
  const l = p.limits
  const list = [
    `${l.maxConnections} ${l.maxConnections === 1 ? 'conexão' : 'conexões'} de WhatsApp`,
    `Até ${l.maxAgents} atendentes`,
    `${l.maxConversationsMonthly.toLocaleString('pt-BR')} conversas por mês`,
    `${l.maxAlertRules} regras de alerta`,
    `Histórico de ${l.retentionDays} dias`,
  ]
  return list
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function LandingPage() {
  const { setView, setShowLanding, setShowLogin, openAuth } = useAppStore()
  const [plans, setPlans] = useState<PublicPlan[] | null>(null)
  const [plansError, setPlansError] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

  const handleStart = () => openAuth('signup')
  const handleLogin = () => openAuth('login')

  // Demonstração: entra na conta pública de demonstração (ver B7: virá um ambiente demo separado).
  const handleDemo = async () => {
    setDemoLoading(true)
    const result = await signIn('credentials', { email: 'demo@atenderadar.com', password: 'demo123', redirect: false })
    setDemoLoading(false)
    if (result?.error) {
      openAuth('login')
      return
    }
    setShowLanding(false)
    setShowLogin(false)
    setView('dashboard')
  }

  const loadPlans = () => {
    setPlansError(false)
    fetch('/api/public/plans')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPlans(d.plans))
      .catch(() => setPlansError(true))
  }
  useEffect(loadPlans, [])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ========== HERO SECTION ========== */}
      <section className="relative overflow-hidden">
        {/* Background gradient pattern */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-background to-teal-50 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/20" />
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-400/5 rounded-full blur-3xl" />
          {/* Dot pattern overlay */}
          <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 sm:pt-20 sm:pb-28">
          {/* Nav bar */}
          <nav className="flex items-center justify-between mb-16 sm:mb-20">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-700 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">
                Atende<span className="text-emerald-700 dark:text-emerald-400">Radar</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
              <button onClick={() => scrollTo('funcionalidades')} className="hover:text-foreground transition-colors">Funcionalidades</button>
              <button onClick={() => scrollTo('precos')} className="hover:text-foreground transition-colors">Preços</button>
              <Button variant="ghost" size="sm" onClick={handleLogin}>
                Entrar
              </Button>
            </div>
            <div className="flex sm:hidden items-center gap-1">
              <Button size="sm" onClick={handleLogin}>
                Entrar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Seções da página">
                    <Menu className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => scrollTo('funcionalidades')}>Funcionalidades</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => scrollTo('precos')}>Preços</DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleLogin}>Entrar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </nav>

          {/* Hero content */}
          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Auditoria de receita e qualidade no WhatsApp
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
              Auditoria Inteligente de{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                Receita e Qualidade
              </span>{' '}
              no WhatsApp
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Detecte receita perdida, audite a qualidade do atendimento e monitore sua operação em tempo real.{' '}
              <span className="text-foreground font-medium">Transforme cada conversa em oportunidade.</span>
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white px-8 h-12 text-base font-semibold shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 transition-all duration-300"
                onClick={handleStart}
              >
                Começar Agora
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto h-12 text-base font-medium border-foreground/20"
                onClick={handleDemo}
                disabled={demoLoading}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Ver Demonstração
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ========== PROBLEM SECTION ========== */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="outline" className="mb-4 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              O Problema
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
              Você sabe quanto dinheiro seu time perde no WhatsApp?
            </h2>
            <p className="text-muted-foreground text-lg">
              Sem uma ferramenta de auditoria, esses problemas passam despercebidos todos os dias.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {painPoints.map((point) => (
              <Card key={point.title} className="border-border/60 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors duration-300">
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
                    <point.icon className="w-5 h-5 text-destructive" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-2">{point.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{point.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FEATURES GRID ========== */}
      <section id="funcionalidades" className="py-20 sm:py-28 bg-muted/30 scroll-mt-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="outline" className="mb-4 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Funcionalidades
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
              Como o AtendeRadar funciona
            </h2>
            <p className="text-muted-foreground text-lg">
              Uma suíte completa de ferramentas para auditar, monitorar e otimizar seu atendimento no WhatsApp.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="group border-border/60 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="outline" className="mb-4 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
              <ChevronRight className="w-3.5 h-3.5 mr-1.5" />
              Passo a Passo
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
              Comece em minutos, não em semanas
            </h2>
            <p className="text-muted-foreground text-lg">
              Sem instalação complexa. Sem mudança na operação da sua equipe.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={step.number} className="relative text-center">
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[calc(100%-20%)] h-px border-t-2 border-dashed border-emerald-300 dark:border-emerald-700" />
                )}
                <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 mb-6 shadow-lg shadow-emerald-500/20">
                  <step.icon className="w-10 h-10 text-white" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-background border-2 border-emerald-500 text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PRICING PREVIEW ========== */}
      <section id="precos" className="py-20 sm:py-28 bg-muted/30 scroll-mt-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="outline" className="mb-4 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
              <Star className="w-3.5 h-3.5 mr-1.5" />
              Preços
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
              Planos para cada tamanho de operação
            </h2>
            <p className="text-muted-foreground text-lg">
              Comece grátis por 14 dias. Sem cartão de crédito.
            </p>
          </div>
          {plansError && (
            <div className="text-center text-muted-foreground">
              <p className="mb-4">Não foi possível carregar os planos agora.</p>
              <Button variant="outline" onClick={loadPlans}>Tentar novamente</Button>
            </div>
          )}
          {!plansError && !plans && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-96 rounded-xl border border-border/60 bg-card/50 animate-pulse" />
              ))}
            </div>
          )}
          {plans && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
              {plans.map((plan) => (
                <Card
                  key={plan.code}
                  className={
                    plan.highlight
                      ? 'relative h-full border-emerald-500 dark:border-emerald-500 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-500/40'
                      : 'h-full border-border/60'
                  }
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-emerald-700 text-white px-4 py-1 text-xs font-semibold shadow-md">
                        Mais Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-4 pt-8 px-6">
                    <CardTitle className="text-lg font-semibold text-foreground">
                      <h3>{plan.name}</h3>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 flex-1 flex flex-col">
                    <div className="mb-6">
                      <span className="text-4xl font-bold text-foreground">R$ {plan.monthlyPrice}</span>
                      <span className="text-muted-foreground ml-1">/mês</span>
                    </div>
                    <Separator className="mb-6" />
                    <ul className="space-y-3 mb-8 flex-1">
                      {planBullets(plan).map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className={
                        plan.highlight
                          ? 'w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold shadow-md shadow-emerald-600/20'
                          : 'w-full'
                      }
                      variant={plan.highlight ? 'default' : 'outline'}
                      onClick={handleStart}
                    >
                      Testar grátis por 14 dias
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========== CTA FINAL SECTION ========== */}
      <section className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 px-6 py-16 sm:px-16 sm:py-20 text-center">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }} />

            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
                Pronto para parar de perder receita?
              </h2>
              <p className="text-emerald-100 text-lg max-w-xl mx-auto mb-8 leading-relaxed">
                Comece a enxergar a receita que hoje passa despercebida nas conversas do seu WhatsApp.
              </p>
              <Button
                size="lg"
                className="bg-white text-emerald-700 hover:bg-emerald-50 px-8 h-12 text-base font-semibold shadow-xl shadow-black/10 transition-all duration-300 hover:scale-105"
                onClick={handleStart}
              >
                Começar Gratuitamente
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <p className="text-emerald-200 text-sm mt-4">
                14 dias grátis · Sem cartão de crédito
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="border-t border-border bg-card/50 backdrop-blur-sm py-10 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-emerald-700 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold text-foreground">
                Atende<span className="text-emerald-700 dark:text-emerald-400">Radar</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} AtendeRadar. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
