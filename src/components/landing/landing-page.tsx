'use client'

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useAppStore } from '@/lib/store'
import { Icon } from './icons'

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

// Textos de cada plano (pacote de design), pelo código do plano no banco. Preço e nome vêm sempre do banco.
const PLAN_COPY: Record<string, { desc: string; bullets: string[]; cta: string }> = {
  essencial: {
    desc: 'Para começar a ter visibilidade da sua operação.',
    bullets: ['1 número de WhatsApp', 'Visão operacional', 'Alertas essenciais', 'Relatórios básicos'],
    cta: 'Testar grátis por 14 dias',
  },
  gestao: {
    desc: 'Para empresas que querem mais resultados.',
    bullets: ['Até 3 números de WhatsApp', 'Alertas avançados', 'Comparativos por equipe', 'Relatórios completos'],
    cta: 'Começar agora',
  },
  performance: {
    desc: 'Para operações maiores e mais complexas.',
    bullets: ['Operação mais robusta', 'Múltiplas unidades', 'Mais volume analisado', 'Visão estratégica'],
    cta: 'Falar com especialista',
  },
}

// Plano sem texto no pacote (código desconhecido): mostra só o que o produto de fato entrega, pelos limites do banco.
function planBullets(p: PublicPlan): string[] {
  const l = p.limits
  return [
    `${l.maxConnections} ${l.maxConnections === 1 ? 'conexão' : 'conexões'} de WhatsApp`,
    `Até ${l.maxAgents} atendentes`,
    `${l.maxConversationsMonthly.toLocaleString('pt-BR')} conversas por mês`,
    `${l.maxAlertRules} regras de alerta`,
    `Histórico de ${l.retentionDays} dias`,
  ]
}

const atraso = (s: string) => ({ '--atraso': s }) as CSSProperties

const NAV = [
  { href: '#como-funciona', label: 'Como Funciona' },
  { href: '#beneficios', label: 'Benefícios' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'FAQ' },
]

export default function LandingPage() {
  const { setView, setShowLanding, setShowLogin, openAuth } = useAppStore()
  const [plans, setPlans] = useState<PublicPlan[] | null>(null)
  const [plansError, setPlansError] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const handleStart = () => openAuth('signup')
  const handleLogin = (e?: MouseEvent) => {
    e?.preventDefault()
    setMenuAberto(false)
    openAuth('login')
  }

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

  const fetchPlans = () =>
    fetch('/api/public/plans')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPlans(d.plans))
      .catch(() => setPlansError(true))
  const loadPlans = () => {
    setPlansError(false)
    void fetchPlans()
  }
  useEffect(() => {
    void fetchPlans()
  }, [])

  // Menu móvel: fecha com Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAberto(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Animação de entrada ao rolar (como o script do pacote). Roda de novo quando os planos chegam.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const itens = Array.from(root.querySelectorAll<HTMLElement>('[data-revelar]:not(.visivel)'))
    const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!('IntersectionObserver' in window) || semMovimento) {
      itens.forEach((el) => el.classList.add('visivel'))
      return
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('visivel')
            obs.unobserve(en.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    itens.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [plans, plansError])

  return (
    <div ref={rootRef} className={menuAberto ? 'lp menu-aberto' : 'lp'}>
      {/* ================= CABEÇALHO ================= */}
      <header className="topo">
        <div className="container topo__inner">
          <a href="#inicio" className="logo" aria-label="AtendeRadar — início">
            <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
          </a>

          <nav className="nav" id="menu" aria-label="Principal">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setMenuAberto(false)}>{item.label}</a>
            ))}
            <a href="#entrar" role="button" className="nav-entrar" onClick={handleLogin}>Entrar</a>
          </nav>

          <div className="topo__acoes">
            <a href="#entrar" role="button" className="link-entrar" onClick={handleLogin}>Entrar</a>
            <button type="button" className="btn btn--primario btn--sm" onClick={handleStart}>
              Teste Grátis <Icon name="seta" className="ic-seta" />
            </button>
            <button
              type="button"
              className="menu-btn"
              aria-controls="menu"
              aria-expanded={menuAberto}
              aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMenuAberto((v) => !v)}
            >
              <Icon name="menu" className="ic-abrir" />
              <Icon name="fechar" className="ic-fechar" />
            </button>
          </div>
        </div>
      </header>

      <main id="inicio" className="js">
        {/* ================= HERO ================= */}
        <section className="hero">
          <div className="container hero__grid">
            <div className="hero__texto">
              <span className="pill" data-revelar><Icon name="brilho" /> Auditoria inteligente para operações no WhatsApp</span>

              <h1 className="hero__titulo" data-revelar style={atraso('.05s')}>
                O dinheiro que sua empresa perde no WhatsApp não aparece no relatório.{' '}
                <span className="verde">Mas aparece no AtendeRadar.</span>
              </h1>

              <p className="hero__lead" data-revelar style={atraso('.1s')}>
                Descubra leads esquecidos, demora no atendimento, falhas de qualidade e oportunidades desperdiçadas.
                O AtendeRadar analisa suas conversas e mostra exatamente onde sua receita está vazando — antes que o prejuízo vire rotina.
              </p>

              <div className="hero__acoes" data-revelar style={atraso('.15s')}>
                <button type="button" className="btn btn--primario" onClick={handleStart}>
                  Quero parar de perder receita <Icon name="seta" className="ic-seta" />
                </button>
                <button type="button" className="btn btn--contorno" onClick={handleDemo} disabled={demoLoading} aria-busy={demoLoading}>
                  <Icon name="play" className="ic-play" /> Ver demonstração
                </button>
              </div>
            </div>

            <div className="hero__visual" data-revelar style={atraso('.1s')}>
              <img
                src="/brand/hero-dashboard.webp"
                width={1300}
                height={1036}
                fetchPriority="high"
                alt="Painel do AtendeRadar com receita recuperável de R$ 24.830, 317 leads ignorados, gráfico de conversas e oportunidades detectadas"
              />
            </div>

            <ul className="hero__provas" data-revelar style={atraso('.2s')}>
              <li><Icon name="check" /> Encontre receita perdida em minutos</li>
              <li><Icon name="check" /> Monitore 100% das conversas</li>
              <li><Icon name="check" /> Tome decisões com dados reais</li>
            </ul>
          </div>
        </section>

        {/* ================= O PROBLEMA ================= */}
        <section className="problema" id="problema" aria-labelledby="titulo-problema">
          <div className="container">
            <div className="problema__topo">
              <div data-revelar>
                <span className="pill">O problema</span>
                <h2 className="titulo-secao" id="titulo-problema">Se o WhatsApp faz parte da sua operação,<br /> você já está perdendo dinheiro.</h2>
                <p className="problema__pergunta">A única dúvida é: quanto?</p>
              </div>
              <div className="problema__grafico" data-revelar style={atraso('.1s')}>
                <img
                  src="/brand/problema-conversas-perdidas.webp"
                  width={640}
                  height={303}
                  loading="lazy"
                  decoding="async"
                  alt="Gráfico em queda: conversas perdidas = receita perdida"
                />
              </div>
            </div>

            <div className="problema__cards">
              <article className="card" data-revelar>
                <span className="icone-redondo"><Icon name="msg" /></span>
                <h3>Leads ignorados</h3>
                <p>Mensagens sem resposta, follow-ups esquecidos e contatos que esfriam antes da venda acontecer.</p>
              </article>
              <article className="card" data-revelar style={atraso('.06s')}>
                <span className="icone-redondo"><Icon name="relogio" /></span>
                <h3>Demora que mata conversão</h3>
                <p>Minutos de atraso viram vendas perdidas, cancelamentos e clientes que fecham com outro.</p>
              </article>
              <article className="card" data-revelar style={atraso('.12s')}>
                <span className="icone-redondo"><Icon name="pessoas" /></span>
                <h3>Qualidade inconsistente</h3>
                <p>Cada atendente responde de um jeito, sem padrão, sem controle e sem previsibilidade.</p>
              </article>
              <article className="card" data-revelar style={atraso('.18s')}>
                <span className="icone-redondo"><Icon name="olho" /></span>
                <h3>Gestão no escuro</h3>
                <p>Sem auditoria real, você descobre tarde demais onde a operação falha e a receita escapa.</p>
              </article>
            </div>
          </div>
        </section>

        {/* ================= COMO FUNCIONA ================= */}
        <section className="como" id="como-funciona" aria-labelledby="titulo-como">
          <div className="container como__grid">
            <div>
              <div data-revelar>
                <span className="pill">Como funciona</span>
                <h2 className="titulo-secao" id="titulo-como">O AtendeRadar encontra o que sua<br /> operação não consegue enxergar sozinha</h2>
                <p className="sub-secao">Ele transforma conversas em diagnósticos, alertas e oportunidades acionáveis.</p>
              </div>

              <div className="como__cards">
                <article className="card" data-revelar>
                  <span className="icone-quadrado"><Icon name="lupa" /></span>
                  <h3>Analisa 100% das conversas</h3>
                  <p>Auditoria contínua para identificar gargalos, padrões e riscos.</p>
                </article>
                <article className="card" data-revelar style={atraso('.06s')}>
                  <span className="icone-quadrado"><Icon name="cifrao" /></span>
                  <h3>Detecta receita perdida</h3>
                  <p>Mostra onde o dinheiro ficou na mesa e quais conversas merecem ação imediata.</p>
                </article>
                <article className="card" data-revelar style={atraso('.12s')}>
                  <span className="icone-quadrado"><Icon name="barras" /></span>
                  <h3>Monitora qualidade</h3>
                  <p>Acompanhe aderência, atendimento e execução com muito mais consistência.</p>
                </article>
                <article className="card" data-revelar>
                  <span className="icone-quadrado"><Icon name="sino" /></span>
                  <h3>Gera alertas claros</h3>
                  <p>Saiba rapidamente quando algo foge do padrão e ameaça resultado.</p>
                </article>
                <article className="card" data-revelar style={atraso('.06s')}>
                  <span className="icone-quadrado"><Icon name="equipe" /></span>
                  <h3>Compara equipes e unidades</h3>
                  <p>Entenda quem converte melhor, quem atrasa mais e onde agir primeiro.</p>
                </article>
                <article className="card" data-revelar style={atraso('.12s')}>
                  <span className="icone-quadrado"><Icon name="arquivo" /></span>
                  <h3>Entrega relatórios acionáveis</h3>
                  <p>Menos achismo. Mais clareza para melhorar atendimento, conversão e margem.</p>
                </article>
              </div>
            </div>

            <div className="como__visual" data-revelar style={atraso('.1s')}>
              <img
                src="/brand/como-funciona-celular.webp"
                width={780}
                height={1130}
                loading="lazy"
                decoding="async"
                alt="Conversa no WhatsApp com alerta do AtendeRadar: oportunidade de receita, lead sem retorno há mais de 24 horas, potencial de R$ 2.400"
              />
            </div>
          </div>
        </section>

        {/* ================= POR QUE ISSO IMPORTA ================= */}
        <section className="beneficios" id="beneficios" aria-labelledby="titulo-beneficios">
          <div className="container">
            <div data-revelar>
              <span className="pill"><Icon name="brilho" /> Por que isso importa</span>
              <h2 className="titulo-secao" id="titulo-beneficios">
                Você não precisa de mais conversas.<br /> Precisa <span className="verde">extrair mais dinheiro</span> das conversas que já acontecem.
              </h2>
            </div>

            <div className="beneficios__cards">
              <article className="card beneficio" data-revelar>
                <span className="icone-quadrado"><Icon name="barras" /></span>
                <div>
                  <h3>Recupere vendas que estavam escapando</h3>
                  <p>Identifique e reative oportunidades reais que já estão no seu WhatsApp.</p>
                </div>
              </article>
              <article className="card beneficio" data-revelar style={atraso('.08s')}>
                <span className="icone-quadrado"><Icon name="equipe" /></span>
                <div>
                  <h3>Aumente a qualidade sem microgerenciar a equipe</h3>
                  <p>Tenha padrões, visibilidade e consistência, com menos esforço.</p>
                </div>
              </article>
              <article className="card beneficio" data-revelar style={atraso('.16s')}>
                <span className="icone-quadrado"><Icon name="alvo" /></span>
                <div>
                  <h3>Transforme atendimento em inteligência comercial</h3>
                  <p>Use os dados das conversas para tomar decisões e acelerar o crescimento.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ================= IMPLEMENTAÇÃO ================= */}
        <section className="implementacao" aria-labelledby="titulo-implementacao">
          <div className="container">
            <div data-revelar>
              <span className="pill"><Icon name="brilho" /> Implementação</span>
              <h2 className="titulo-secao" id="titulo-implementacao">Comece em minutos, não em meses</h2>
            </div>

            <ol className="passos" style={{ listStyle: 'none', padding: 0 }}>
              <li className="passo" data-revelar>
                <span className="passo__num">1</span>
                <div>
                  <span className="passo__icone">
                    <img src="/brand/icone-whatsapp.webp" width={200} height={200} alt="" loading="lazy" decoding="async" />
                  </span>
                  <h3>Conecte seu WhatsApp</h3>
                  <p>Integração rápida com sua operação atual.</p>
                </div>
              </li>
              <li className="passo__seta" aria-hidden="true">
                <PassoSeta />
              </li>
              <li className="passo" data-revelar style={atraso('.08s')}>
                <span className="passo__num">2</span>
                <div>
                  <span className="passo__icone"><Icon name="barras" /></span>
                  <h3>O AtendeRadar analisa</h3>
                  <p>As conversas viram diagnósticos e sinais de ação.</p>
                </div>
              </li>
              <li className="passo__seta" aria-hidden="true">
                <PassoSeta />
              </li>
              <li className="passo" data-revelar style={atraso('.16s')}>
                <span className="passo__num">3</span>
                <div>
                  <span className="passo__icone passo__icone--check"><Icon name="check" /></span>
                  <h3>Aja com clareza</h3>
                  <p>Corrija falhas, recupere oportunidades e melhore receita.</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* ================= PLANOS ================= */}
        <section className="planos" id="planos" aria-labelledby="titulo-planos">
          <div className="container">
            <div data-revelar>
              <span className="pill"><Icon name="brilho" /> Planos</span>
              <h2 className="titulo-secao" id="titulo-planos">Escolha o plano ideal para o tamanho da sua operação</h2>
              <p className="sub-secao">Teste por 14 dias. Sem complicação.</p>
            </div>

            {plansError && (
              <div className="mt-10 text-center" role="alert">
                <p className="sub-secao">Não foi possível carregar os planos agora.</p>
                <button type="button" className="btn btn--contorno mt-4" onClick={loadPlans}>Tentar novamente</button>
              </div>
            )}
            {!plansError && !plans && (
              <div className="planos__cards" aria-busy="true" aria-label="Carregando planos">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="plano min-h-[420px] animate-pulse" aria-hidden="true" />
                ))}
              </div>
            )}
            {plans && (
              <div className="planos__cards">
                {plans.map((plan, i) => {
                  const copy = PLAN_COPY[plan.code]
                  const bullets = copy ? copy.bullets : planBullets(plan)
                  const desc = copy ? copy.desc : plan.description
                  const cta = copy ? copy.cta : `Testar grátis por ${plan.trialDays} dias`
                  return (
                    <article
                      key={plan.code}
                      className={plan.highlight ? 'plano plano--destaque' : 'plano'}
                      data-revelar
                      style={i > 0 ? atraso(`.${String(i * 8).padStart(2, '0')}s`) : undefined}
                    >
                      {plan.highlight && <span className="plano__selo">Mais Popular</span>}
                      <h3>{plan.name}</h3>
                      {desc && <p className="plano__desc">{desc}</p>}
                      <p className="plano__preco"><strong>R$ {plan.monthlyPrice}</strong><span>/mês</span></p>
                      <ul className="plano__lista">
                        {bullets.map((b) => (
                          <li key={b}><Icon name="check" /> {b}</li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className={plan.highlight ? 'btn btn--primario btn--bloco' : 'btn btn--contorno btn--bloco'}
                        onClick={handleStart}
                      >
                        {cta} <Icon name="seta" className="ic-seta" />
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* ================= FAQ ================= */}
        <section className="faq" id="faq" aria-label="Pergunta frequente">
          <div className="container">
            <div className="faq__faixa" data-revelar>
              <span className="faq__icone"><Icon name="chat" /></span>
              <p className="faq__pergunta">Precisa trocar sua equipe ou mudar seu processo?</p>
              <span className="faq__divisor" aria-hidden="true" />
              <p className="faq__resposta">Não. O AtendeRadar entra para mostrar onde a operação perde dinheiro hoje, usando as conversas que sua empresa já gera.</p>
            </div>
          </div>
        </section>

        {/* ================= CTA FINAL ================= */}
        <section className="cta" aria-labelledby="titulo-cta">
          <div className="container">
            <div className="cta__caixa" data-revelar>
              <div className="cta__texto-col">
                <span className="cta__selo">
                  <img src="/brand/cta-selo-resultados.webp" width={760} height={126} loading="lazy" decoding="async" alt="Resultados reais para o seu negócio" />
                </span>
                <h2 className="cta__titulo" id="titulo-cta">Pare de deixar receita escondida<br /> dentro do WhatsApp.</h2>
                <p className="cta__texto">Veja o que sua operação está perdendo, corrija o que trava conversão e transforme atendimento em crescimento previsível.</p>
                <button type="button" className="btn btn--branco" onClick={handleStart}>
                  Quero testar gratuitamente <Icon name="seta" className="ic-seta" />
                </button>
                <p className="cta__nota">14 dias grátis • Implantação simples</p>
              </div>

              <div className="cta__visual" aria-hidden="true">
                <img className="cta__seta" src="/brand/cta-seta.webp" width={520} height={388} loading="lazy" decoding="async" alt="" />
                <img className="cta__receita" src="/brand/cta-receita-recuperada.webp" width={820} height={608} loading="lazy" decoding="async" alt="" />
                <img className="cta__beneficios" src="/brand/cta-mais-receita.webp" width={460} height={354} loading="lazy" decoding="async" alt="" />
              </div>
            </div>
          </div>
        </section>

        {/* ================= SELOS DE CONFIANÇA ================= */}
        <section className="confianca" aria-label="Garantias">
          <div className="container">
            <ul>
              <li><Icon name="escudo" /> Dados seguros e confidenciais</li>
              <li><Icon name="check" /> Implantação em minutos</li>
              <li><Icon name="equipe" /> Suporte no seu idioma</li>
              <li><Icon name="barras" /> Foco em resultados reais</li>
            </ul>
          </div>
        </section>
      </main>

      {/* ================= RODAPÉ ================= */}
      <footer className="rodape">
        <div className="container rodape__inner">
          <a href="#inicio" className="logo" aria-label="AtendeRadar — voltar ao topo">
            <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} loading="lazy" decoding="async" />
          </a>
          <nav className="rodape__nav" aria-label="Rodapé">
            {NAV.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </nav>
          <p className="rodape__copy">© {new Date().getFullYear()} AtendeRadar. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  )
}

function PassoSeta() {
  return (
    <svg viewBox="0 0 120 14" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" focusable="false">
      <path d="M2 7h114M109 2l7 5-7 5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
