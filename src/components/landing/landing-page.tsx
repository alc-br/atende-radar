'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Shield, Zap, BarChart3, MessageSquare, DollarSign, Clock,
  Users, ArrowRight, CheckCircle2, Star, Bot, FileText,
  Radio, Sparkles, Target, TrendingUp, Eye, Phone, ChevronRight,
} from 'lucide-react'

const stats = [
  { value: '+500', label: 'Empresas' },
  { value: '+2M', label: 'Conversas Auditadas' },
  { value: 'R$15M+', label: 'Receita Recuperada' },
  { value: '4.9★', label: 'Satisfação' },
]

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
    title: 'Análise Automática IA',
    description: 'Detecta intenções, oportunidades e falhas em tempo real usando inteligência artificial avançada.',
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
    description: 'Suporte a múltiplas conexões Baileys para escalar sua operação sem limites.',
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
    description: 'Nossa IA processa cada conversa, detectando oportunidades, falhas e riscos automaticamente.',
  },
  {
    number: '03',
    icon: ArrowRight,
    title: 'Aja com dados',
    description: 'Receba alertas, acesse relatórios e recupere receita que antes era invisível.',
  },
]

const plans = [
  {
    name: 'Starter',
    price: 'R$297',
    period: '/mês',
    description: 'Ideal para pequenas equipes que querem começar a auditar.',
    features: [
      '1 conexão WhatsApp',
      '5 agentes',
      '500 conversas/mês',
      'Análise IA básica',
      'Relatórios semanais',
      'Suporte por e-mail',
    ],
    cta: 'Começar Agora',
    highlighted: false,
  },
  {
    name: 'Profissional',
    price: 'R$697',
    period: '/mês',
    description: 'Para equipes que querem escalar e maximizar receita.',
    features: [
      '3 conexões WhatsApp',
      '15 agentes',
      '3.000 conversas/mês',
      'Análise IA avançada',
      '8 tipos de relatório',
      'Alertas inteligentes',
      'Recuperação de receita',
      'Suporte prioritário',
    ],
    cta: 'Assinar Profissional',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    description: 'Para grandes operações com necessidades específicas.',
    features: [
      'Conexões ilimitadas',
      'Agentes ilimitados',
      'Conversas ilimitadas',
      'IA personalizada',
      'API dedicada',
      'SLA garantido',
      'Gerente de sucesso',
      'Treinamento Incluso',
    ],
    cta: 'Falar com Vendas',
    highlighted: false,
  },
]

export default function LandingPage() {
  const { setView, setShowLanding, setShowLogin } = useAppStore()

  const handleStart = () => {
    setShowLogin(true)
  }

  const handleDemo = () => {
    setShowLanding(false)
    setView('dashboard')
  }

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

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 sm:pt-20 sm:pb-28">
          {/* Nav bar */}
          <nav className="flex items-center justify-between mb-16 sm:mb-20">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">
                Atende<span className="text-emerald-600">Radar</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
              <button className="hover:text-foreground transition-colors">Funcionalidades</button>
              <button className="hover:text-foreground transition-colors">Preços</button>
              <Button variant="ghost" size="sm" onClick={handleStart}>
                Entrar
              </Button>
            </div>
            <Button size="sm" className="sm:hidden" onClick={handleStart}>
              Entrar
            </Button>
          </nav>

          {/* Hero content */}
          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Plataforma #1 em Auditoria de WhatsApp
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
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-8 h-12 text-base font-semibold shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 transition-all duration-300"
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
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Ver Demonstração
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SOCIAL PROOF / TRUST BAR ========== */}
      <section className="border-y border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-emerald-600 mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
              </div>
            ))}
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
      <section className="py-20 sm:py-28 bg-muted/30">
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
                    <feature.icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
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
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-background border-2 border-emerald-500 text-xs font-bold text-emerald-600 flex items-center justify-center">
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
      <section className="py-20 sm:py-28 bg-muted/30">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.highlighted
                    ? 'relative border-emerald-500 dark:border-emerald-500 shadow-xl shadow-emerald-500/10 scale-[1.02]'
                    : 'border-border/60'
                }
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-emerald-600 text-white px-4 py-1 text-xs font-semibold shadow-md">
                      Mais Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4 pt-8 px-6">
                  <CardTitle className="text-lg font-semibold text-foreground">{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="mb-6">
                    {plan.price === 'Sob consulta' ? (
                      <span className="text-3xl font-bold text-foreground">Sob consulta</span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                        <span className="text-muted-foreground ml-1">{plan.period}</span>
                      </>
                    )}
                  </div>
                  <Separator className="mb-6" />
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={
                      plan.highlighted
                        ? 'w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-600/20'
                        : 'w-full'
                    }
                    variant={plan.highlighted ? 'default' : 'outline'}
                    onClick={handleStart}
                  >
                    {plan.cta}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ))
          }</div>
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
                Junte-se a mais de 500 empresas que já recuperaram milhões com o AtendeRadar.
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
                14 dias grátis · Sem cartão de crédito · Cancele quando quiser
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
              <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold text-foreground">
                Atende<span className="text-emerald-600">Radar</span>
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button className="hover:text-foreground transition-colors">Termos de Uso</button>
              <button className="hover:text-foreground transition-colors">Política de Privacidade</button>
              <button className="hover:text-foreground transition-colors">Suporte</button>
            </div>
            <p className="text-xs text-muted-foreground">
              © 2025 AtendeRadar. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
