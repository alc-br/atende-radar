'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react'
import { signIn } from 'next-auth/react'
import { appLink, splitHosts } from '@/lib/hosts'
import type { PublicPlan } from '@/lib/public-plans'
import { PLAN_FEATURES } from '@/lib/plan-catalog'
import { FAQ } from '@/lib/faq'
import { useAppStore } from '@/lib/store'
import { LANDING_SPRITE } from '@/components/site/assets'
import { Ic, SiteFooter, Sprite, atraso, useEscFecha, useRevelar } from '@/components/site/site-ui'

// O cadastro sempre começa com 14 dias de teste, sem cartão (api/auth/signup).
const TESTE_DIAS = 14

// Nome de cada recurso do plano (chaves do campo features no banco), na ordem em que aparecem.
const RECURSOS = PLAN_FEATURES

const brl = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/** Itens do plano a partir do que está no banco: recursos novos em relação ao plano anterior e os limites. */
function itensDoPlano(plan: PublicPlan, anterior?: PublicPlan): string[] {
  const temNoAnterior = (k: string) => !!anterior?.features[k]
  const novos = RECURSOS.filter(([k]) => plan.features[k] && !temNoAnterior(k)).map(([, nome]) => nome)
  const l = plan.limits
  return [
    `${TESTE_DIAS} dias grátis`,
    ...(anterior ? [`Tudo do ${anterior.name}`] : []),
    ...novos,
    `${l.maxConnections} ${l.maxConnections === 1 ? 'número' : 'números'} de WhatsApp · até ${l.maxAgents} atendentes`,
    `${l.maxConversationsMonthly.toLocaleString('pt-BR')} conversas/mês`,
  ]
}

const PROBLEMAS = [
  { ic: 'msg2', cor: 't-vermelho', t: 'Cliente sem retorno', p: 'Interesse que se perde e vira receita para o concorrente.' },
  { ic: 'calendario', cor: 't-laranja', t: 'Promessa não cumprida', p: 'Cliente aguarda o contato e acaba desistindo.' },
  { ic: 'arquivo', cor: 't-roxo', t: 'Proposta esquecida', p: 'Orçamentos enviados que nunca mais são mencionados.' },
  { ic: 'repetir', cor: 't-rosa', t: 'Falhas que se repetem', p: 'Os mesmos problemas acontecem várias vezes e ninguém percebe.' },
]

const RECURSOS_LP = [
  { ic: 'lupa', cor: 't-verde', t: 'Audita conversas continuamente', p: 'Analisa as conversas do seu WhatsApp conectado, sem esforço manual.' },
  { ic: 'alerta', cor: 't-ambar', t: 'Encontra oportunidades em risco', p: 'Identifica clientes com intenção de compra que ficaram sem retorno.' },
  { ic: 'estrela', cor: 't-verde', t: 'Analisa a qualidade do atendimento', p: 'Avalia prazos de resposta, promessas feitas e perguntas sem resposta.' },
  { ic: 'barras', cor: 't-verde', t: 'Detecta padrões e recorrências', p: 'Mostra os problemas que mais se repetem no seu atendimento.' },
  { ic: 'alvo', cor: 't-roxo', t: 'Prioriza o que merece intervenção', p: 'Destaca o que realmente precisa da sua atenção agora.' },
  { ic: 'pessoas', cor: 't-verde', t: 'Ajuda a orientar a equipe', p: 'Mostra o desempenho por atendente para orientar o time.' },
]

const PASSOS = [
  { ic: 'whats', mod: '', t: 'Conectar o WhatsApp', p: 'Conecte seu número atual lendo um QR Code, como no WhatsApp Web.' },
  { ic: 'doc-cheio', mod: ' passo__icone--doc', t: 'Auditar conversas', p: 'O AtendeRadar analisa as conversas continuamente.' },
  { ic: 'alerta-cheio', mod: ' passo__icone--alerta', t: 'Priorizar oportunidades', p: 'Você vê o que merece atenção, com alertas e insights claros.' },
  { ic: 'barras', mod: '', t: 'Agir e acompanhar a evolução', p: 'Sua equipe executa as ações e você acompanha os resultados.' },
]

const SEGMENTOS = [
  { ic: 'estetoscopio', cor: 't-azul', t: 'Clínicas', p: 'Mais agendamentos e menos oportunidades perdidas.' },
  { ic: 'engrenagem', cor: 't-azul', t: 'Serviços', p: 'Mais conversões e organização no atendimento.' },
  { ic: 'casa', cor: 't-verde', t: 'Imobiliárias', p: 'Mais visitas, propostas e fechamentos no radar.' },
  { ic: 'capelo', cor: 't-roxo', t: 'Escolas', p: 'Mais matrículas e melhor gestão de oportunidades.' },
  { ic: 'megafone', cor: 't-rosa', t: 'Agências', p: 'Mais clientes e acompanhamento do funil comercial.' },
]


/** initialPlans: planos lidos no servidor (página /inicio); sem eles, carrega pela API no navegador. */
export default function LandingPage({ initialPlans = null }: { initialPlans?: PublicPlan[] | null } = {}) {
  const { setView, setShowLanding, setShowLogin, openAuth } = useAppStore()
  const [plans, setPlans] = useState<PublicPlan[] | null>(initialPlans)
  const [plansError, setPlansError] = useState(false)
  const [anual, setAnual] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [pronto, setPronto] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Com domínios separados, entrar/cadastro/demonstração abrem no app (a sessão é do domínio do app)
  const handleStart = (e?: MouseEvent) => {
    e?.preventDefault()
    setMenuAberto(false)
    if (splitHosts) window.location.assign(appLink('/?modo=cadastro'))
    else openAuth('signup')
  }
  const handleLogin = (e?: MouseEvent) => {
    e?.preventDefault()
    setMenuAberto(false)
    if (splitHosts) window.location.assign(appLink('/?modo=entrar'))
    else openAuth('login')
  }

  // Demonstração: entra na conta pública de demonstração (somente leitura).
  const handleDemo = async () => {
    setDemoLoading(true)
    if (splitHosts) {
      window.location.assign(appLink('/?demo=1'))
      return
    }
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
    if (!initialPlans) void fetchPlans()
  }, [initialPlans])

  // I7 · visita à página de vendas: só soma 1 no contador do dia (sem cookie, sem IP gravado, mesmo domínio).
  const visitaContada = useRef(false)
  useEffect(() => {
    if (visitaContada.current) return
    visitaContada.current = true
    fetch('/api/public/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'landing' }),
      keepalive: true,
    }).catch(() => {})
  }, [])

  const fecharMenu = useCallback(() => setMenuAberto(false), [])
  useEscFecha(fecharMenu)
  // Roda de novo quando os planos chegam (cartões novos para revelar).
  useRevelar(rootRef, () => setPronto(true), [plans, plansError])

  // FAQ: um item aberto por vez, como no pacote.
  const onToggleFaq = (e: SyntheticEvent<HTMLDetailsElement>) => {
    const d = e.currentTarget
    if (!d.open) return
    d.parentElement?.querySelectorAll('details').forEach((o) => {
      if (o !== d) o.open = false
    })
  }

  // Meses grátis no anual, pelo preço real do banco (ex.: 10 mensalidades no ano = 2 meses grátis).
  const comAnual = plans?.filter((p) => p.annualPrice > 0 && p.monthlyPrice > 0) ?? []
  const mesesGratis = comAnual.length ? Math.round(12 - comAnual[0].annualPrice / comAnual[0].monthlyPrice) : 0

  return (
    <div ref={rootRef} className={'lp' + (pronto ? ' js' : '') + (menuAberto ? ' menu-aberto' : '')}>
      <Sprite defs={LANDING_SPRITE} />

      <header className="topo">
        <div className="container topo__inner">
          <a href="#inicio" className="logo" aria-label="AtendeRadar — início">
            <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
          </a>
          <nav className="nav" id="menu" aria-label="Principal">
            <a href="#como-funciona" onClick={fecharMenu}>Como funciona</a>
            <a href="#recursos" onClick={fecharMenu}>Recursos</a>
            <a href="#segmentos" onClick={fecharMenu}>Segmentos</a>
            <a href="#planos" onClick={fecharMenu}>Planos</a>
            <a href="#duvidas" onClick={fecharMenu}>Dúvidas</a>
            <a href={appLink('/?modo=entrar')} className="nav-entrar" onClick={handleLogin}>Entrar</a>
          </nav>
          <div className="topo__acoes">
            <a href={appLink('/?modo=entrar')} className="link-entrar" onClick={handleLogin}>Entrar</a>
            <a href={appLink('/?modo=cadastro')} className="btn btn--primario btn--sm" onClick={handleStart}>
              Começar teste grátis <Ic n="seta" className="ic-seta" />
            </a>
            <button
              className="menu-btn"
              type="button"
              aria-controls="menu"
              aria-expanded={menuAberto}
              aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMenuAberto((v) => !v)}
            >
              <Ic n="menu" className="ic-abrir" />
              <Ic n="fechar" className="ic-fechar" />
            </button>
          </div>
        </div>
      </header>

      <main id="inicio">
        {/* HERO */}
        <section className="hero">
          <div className="container hero__grid">
            <div className="hero__texto">
              <span className="selo" data-revelar>Inteligência comercial para WhatsApp</span>
              <h1 data-revelar style={atraso('.05s')}>
                Quantas vendas sua empresa perde <span className="verde">depois que o cliente chama</span> no WhatsApp?
              </h1>
              <p data-revelar style={atraso('.1s')}>
                Sua equipe recebe mensagens, responde dúvidas e envia orçamentos. Mas quem acompanha as oportunidades que ficam pelo caminho? O{' '}
                <strong>AtendeRadar</strong> analisa as conversas do seu atendimento, identifica clientes sem retorno, propostas esquecidas, promessas
                não cumpridas e falhas que prejudicam as vendas.
              </p>
              <p data-revelar style={atraso('.12s')}>
                Você descobre o que está acontecendo, quais oportunidades precisam de atenção e onde sua equipe pode melhorar. Sem precisar ler
                conversa por conversa.
              </p>
              <div className="hero__acoes" data-revelar style={atraso('.16s')}>
                <a href={appLink('/?modo=cadastro')} className="btn btn--primario" onClick={handleStart}>
                  Descobrir o que estou perdendo <Ic n="seta" className="ic-seta" />
                </a>
                <a href="#demonstracao" className="btn btn--contorno">
                  <span className="play"><Ic n="play" /></span>Ver uma auditoria de exemplo
                </a>
              </div>
              <ul className="hero__provas" data-revelar style={atraso('.2s')}>
                <li><Ic n="barras" />Auditoria contínua</li>
                <li><Ic n="sino" />Alertas inteligentes</li>
                <li><Ic n="alvo" />Oportunidades priorizadas</li>
              </ul>
            </div>

            <div className="vitrine" data-revelar style={atraso('.1s')} aria-label="Exemplo ilustrativo do painel do AtendeRadar detectando uma oportunidade em risco" role="img">
              <div className="dash" aria-hidden="true">
                <div className="dash__lado">
                  <img src="/brand/logo-atenderadar.webp" alt="" width={560} height={109} />
                  <ul>
                    <li className="ativo"><Ic n="grade" />Visão geral</li>
                    <li><Ic n="balao" />Conversas</li>
                    <li><Ic n="alvo" />Oportunidades</li>
                    <li><Ic n="pessoas" />Equipe</li>
                    <li><Ic n="relatorio" />Relatórios</li>
                    <li><Ic n="engrenagem" />Configurações</li>
                  </ul>
                </div>
                <div className="dash__corpo">
                  <div className="dash__cab"><b>Visão geral</b><span>Últimos 7 dias ▾</span></div>
                  <div className="dash__kpis">
                    <div className="dash__kpi"><span className="ic-caixa t-verde"><Ic n="balao" /></span><span><b>523</b><small>Conversas analisadas</small></span></div>
                    <div className="dash__kpi"><span className="ic-caixa t-vermelho"><Ic n="alerta" /></span><span><b>37</b><small>Oportunidades em risco</small></span></div>
                    <div className="dash__kpi"><span className="ic-caixa t-azul"><Ic n="arquivo" /></span><span><b>28</b><small>Propostas identificadas</small></span></div>
                    <div className="dash__kpi"><span className="ic-caixa t-verde"><Ic n="barras" /></span><span><b>R$ 48.750</b><small>Potencial em risco</small></span></div>
                  </div>
                  <div className="dash__grafico">
                    <header>
                      Conversas e oportunidades{' '}
                      <span>
                        <span><i style={{ background: '#0c8f51' }} />Conversas</span>
                        <span><i style={{ background: '#7fe0ae' }} />Oportunidades</span>
                      </span>
                    </header>
                    <svg viewBox="0 0 300 70" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="gh" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#2ccb7c" stopOpacity=".3" />
                          <stop offset="1" stopColor="#2ccb7c" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d="M0 52 C30 48 45 40 70 42 S110 30 140 34 S190 18 220 24 S270 10 300 14 V70 H0Z" fill="url(#gh)" />
                      <path d="M0 52 C30 48 45 40 70 42 S110 30 140 34 S190 18 220 24 S270 10 300 14" fill="none" stroke="#0c8f51" strokeWidth="2" />
                      <path d="M0 60 C40 58 70 54 100 55 S160 46 200 48 S260 38 300 40" fill="none" stroke="#7fe0ae" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="chat flutua" aria-hidden="true">
                <ChatTopo />
                <div className="chat__corpo">
                  <div className="bolha">Olá, gostaria de saber quanto custa o tratamento e quais horários vocês têm.<time>10:24</time></div>
                  <div className="bolha bolha--eu">Claro! Vou verificar os horários e já te retorno.<time>10:25</time></div>
                  <div className="digitando"><i /><i /><i /></div>
                  <div className="pendente"><Ic n="relogio" />Mensagem não respondida há 2 dias</div>
                </div>
              </div>

              <div className="alerta" aria-hidden="true">
                <svg className="seta-curva" viewBox="0 0 40 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M30 4C10 12 6 40 26 56" />
                  <path d="m18 54 8 3 1-8" />
                </svg>
                <div className="alerta__cab"><span className="alerta__ic"><Ic n="alerta" /></span><span className="tag-atencao">Atenção</span></div>
                <h3>Oportunidade comercial em risco</h3>
                <p>Cliente demonstrou intenção de compra, mas ficou sem retorno.</p>
                <span className="btn btn--primario btn--sm">Ver análise completa <Ic n="seta" className="ic-seta" /></span>
              </div>
            </div>
          </div>
        </section>

        {/* PROBLEMA REAL */}
        <section className="secao secao--verde" aria-labelledby="t-problema">
          <div className="container">
            <div className="cab-centro" data-revelar>
              <span className="rotulo">Problema real</span>
              <h2 className="titulo" id="t-problema">Enquanto você cuida da empresa,<br /> quantas oportunidades passam despercebidas?</h2>
              <p className="sub">Muitas empresas perdem vendas todos os dias porque não conseguem acompanhar manualmente todas as conversas do WhatsApp.</p>
            </div>
            <div className="grade-4">
              {PROBLEMAS.map((x, i) => (
                <article key={x.t} className="cartao problema" data-revelar style={atraso(`${i * 0.06}s`)}>
                  <span className={`ic-caixa ${x.cor}`}><Ic n={x.ic} /></span>
                  <h3>{x.t}</h3>
                  <p>{x.p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* DEMONSTRAÇÃO */}
        <section className="secao" id="demonstracao" aria-labelledby="t-demo">
          <div className="container">
            <div className="cab-centro" data-revelar>
              <span className="rotulo">Demonstração na prática</span>
              <h2 className="titulo" id="t-demo">Veja uma oportunidade sendo identificada</h2>
              <p className="sub">Exemplo ilustrativo de auditoria — representação didática.</p>
            </div>
            <div className="demo">
              <div className="chat" data-revelar>
                <ChatTopo />
                <div className="chat__corpo">
                  <div className="bolha">Olá, gostaria de saber quanto custa o tratamento e quais horários vocês têm.<time>10:24</time></div>
                  <div className="bolha bolha--eu">Claro! Vou verificar os horários e já te retorno.<time>10:25</time></div>
                  <div className="pendente"><Ic n="relogio" />Mensagem não respondida<br />há 2 dias</div>
                </div>
              </div>
              <div className="cartao analise" data-revelar style={atraso('.1s')}>
                <div className="alerta__cab"><span className="alerta__ic"><Ic n="alerta" /></span><span className="tag-atencao">Atenção</span></div>
                <h3>Oportunidade comercial em risco</h3>
                <p>Cliente demonstrou intenção de compra, mas ficou sem retorno.</p>
                <ul>
                  <li>
                    <span className="ic-caixa ic-ok"><Ic n="check" /></span>
                    <span><b>Ação sugerida</b><span>Priorizar contato, confirmar disponibilidade e registrar o resultado.</span></span>
                  </li>
                  <li>
                    <span className="ic-caixa t-verde"><Ic n="barras" /></span>
                    <span><b>Aprendizado para a gestão</b><span>Investigar recorrência de promessas sem retorno entre os atendentes.</span></span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="demo__acao" data-revelar>
              <button type="button" className="btn btn--contorno" onClick={handleDemo} disabled={demoLoading}>
                {demoLoading ? 'Abrindo a demonstração…' : 'Explorar o painel de demonstração'} <Ic n="seta" className="ic-seta" />
              </button>
            </div>
          </div>
        </section>

        {/* RECURSOS */}
        <section className="secao secao--verde" id="recursos" aria-labelledby="t-recursos">
          <div className="container">
            <div className="cab-centro" data-revelar>
              <span className="rotulo">O que ele faz por você</span>
              <h2 className="titulo" id="t-recursos">O que o AtendeRadar observa por você</h2>
            </div>
            <div className="grade-3">
              {RECURSOS_LP.map((x, i) => (
                <article key={x.t} className="cartao recurso" data-revelar style={atraso(`${(i % 3) * 0.06}s`)}>
                  <span className={`ic-caixa ${x.cor}`}><Ic n={x.ic} /></span>
                  <div><h3>{x.t}</h3><p>{x.p}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="secao" id="como-funciona" aria-labelledby="t-como">
          <div className="container">
            <div className="cab-centro" data-revelar>
              <span className="rotulo">Como funciona</span>
              <h2 className="titulo" id="t-como">Da conversa ao resultado</h2>
            </div>
            <ol className="passos">
              {PASSOS.flatMap((x, i) => [
                ...(i > 0 ? [<li key={`s${i}`} className="passo__seta" aria-hidden="true"><Ic n="direita" /></li>] : []),
                <li key={x.t} className="passo" data-revelar style={atraso(`${i * 0.08}s`)}>
                  <span className={`passo__icone${x.mod}`}><Ic n={x.ic} /></span>
                  <div className="passo__titulo"><span className="passo__num">{i + 1}</span><h3>{x.t}</h3></div>
                  <p>{x.p}</p>
                </li>,
              ])}
            </ol>
          </div>
        </section>

        {/* SEGMENTOS */}
        <section className="secao secao--verde" id="segmentos" aria-labelledby="t-seg">
          <div className="container">
            <div className="cab-centro" data-revelar>
              <span className="rotulo">Feito para o seu negócio</span>
              <h2 className="titulo" id="t-seg">Feito para operações que dependem do atendimento</h2>
              <p className="sub">O AtendeRadar ajuda a extrair mais resultados do atendimento e da operação comercial de quem vende pelo WhatsApp.</p>
            </div>
            <div className="grade-5">
              {SEGMENTOS.map((x, i) => (
                <article key={x.t} className="cartao segmento" data-revelar style={atraso(`${i * 0.05}s`)}>
                  <span className={`ic-caixa ${x.cor}`}><Ic n={x.ic} /></span>
                  <h3>{x.t}</h3>
                  <p>{x.p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* COMECE SEM COMPLICAÇÃO */}
        <section className="secao" aria-labelledby="t-comece">
          <div className="container comece">
            <div data-revelar>
              <span className="rotulo">Comece sem complicação</span>
              <h2 className="titulo" id="t-comece">Comece com seu WhatsApp atual</h2>
              <p className="sub">
                Você não precisa trocar de número nem mudar sua operação. Conecte seu WhatsApp atual e comece a auditar seu atendimento de forma
                simples, segura e guiada.
              </p>
            </div>
            <div className="mini-cartoes">
              <article className="cartao mini" data-revelar>
                <span className="ic-caixa t-verde"><Ic n="raio" /></span>
                <h3>Implantação guiada</h3>
                <p>Um passo a passo dentro do sistema conduz a configuração.</p>
              </article>
              <article className="cartao mini" data-revelar style={atraso('.06s')}>
                <span className="ic-caixa t-azul"><Ic n="engrenagem" /></span>
                <h3>Integração com a operação atual</h3>
                <p>Sem mudança na sua rotina de atendimento.</p>
              </article>
              <article className="cartao mini" data-revelar style={atraso('.12s')}>
                <span className="ic-caixa t-verde"><Ic n="relogio" /></span>
                <h3>Primeiras descobertas em pouco tempo</h3>
                <p>As análises começam assim que as conversas chegam.</p>
              </article>
            </div>
          </div>
        </section>

        {/* SEGURANÇA E DÚVIDAS */}
        <section className="secao secao--verde" id="duvidas" aria-labelledby="t-seg2">
          <div className="container seguranca">
            <div data-revelar>
              <span className="rotulo">Segurança e dúvidas</span>
              <h2 className="titulo" id="t-seg2">Seu atendimento merece mais controle</h2>
              <p className="sub">
                O AtendeRadar analisa as conversas, identifica oportunidades, gera insights e recomenda ações. A sua equipe executa o atendimento.
              </p>
              <ul className="selos">
                <li><Ic n="escudo" />Conexão protegida<br />por HTTPS</li>
                <li><Ic n="cadeado" />Recursos para<br />a LGPD</li>
                <li><Ic n="banco" />Acesso restrito<br />por função</li>
                <li><Ic n="check-bola" />Registro de<br />auditoria</li>
              </ul>
              <p className="nota-ilustrativa">Os números do painel e os exemplos de conversas desta página são ilustrativos.</p>
            </div>
            <div className="cartao faq" data-revelar style={atraso('.08s')}>
              {FAQ.map((x) => (
                <details key={x.q} onToggle={onToggleFaq}>
                  <summary>{x.q}<Ic n="mais" /></summary>
                  <p>{x.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* PLANOS */}
        <section className="secao" id="planos" aria-labelledby="t-planos">
          <div className="container">
            <div className="planos__cab" data-revelar>
              <div>
                <span className="rotulo">Planos</span>
                <h2 className="titulo" id="t-planos">Planos e teste gratuito</h2>
                <p className="sub">Escolha o plano ideal para o seu momento. Comece com {TESTE_DIAS} dias grátis para testar na prática.</p>
              </div>
              {comAnual.length > 0 && (
                <div className="ciclo" role="group" aria-label="Ciclo de cobrança">
                  <button type="button" aria-pressed={!anual} onClick={() => setAnual(false)}>Mensal</button>
                  <button type="button" aria-pressed={anual} onClick={() => setAnual(true)}>
                    Anual{mesesGratis > 0 && <small>({mesesGratis} {mesesGratis === 1 ? 'mês grátis' : 'meses grátis'})</small>}
                  </button>
                </div>
              )}
            </div>

            {plansError && (
              <div className="cab-centro">
                <p className="sub">Não foi possível carregar os planos agora.</p>
                <button type="button" className="btn btn--contorno" onClick={loadPlans}>Tentar novamente</button>
              </div>
            )}
            {!plansError && !plans && (
              <div className="planos__grade" role="status" aria-busy="true" aria-label="Carregando planos">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="cartao plano animate-pulse" style={{ minHeight: 420 }} aria-hidden="true" />
                ))}
              </div>
            )}
            {plans && (
              <div className="planos__grade">
                {plans.map((plan, i) => {
                  const usaAnual = anual && plan.annualPrice > 0
                  const preco = usaAnual ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice
                  return (
                    <article
                      key={plan.code}
                      className={plan.highlight ? 'cartao plano plano--destaque' : 'cartao plano'}
                      data-revelar
                      style={atraso(`${i * 0.08}s`)}
                    >
                      {plan.highlight && <span className="plano__selo">Mais escolhido</span>}
                      <h3>{plan.name}</h3>
                      {plan.description && <p className="plano__desc">{plan.description}</p>}
                      <p className="plano__preco"><small>R$</small><strong>{brl(preco)}</strong><span>/mês</span></p>
                      <p className="plano__anual">{usaAnual ? `R$ ${brl(plan.annualPrice)} cobrados por ano` : ''}</p>
                      <ul>
                        {itensDoPlano(plan, plans[i - 1]).map((b) => (
                          <li key={b}><Ic n="check" />{b}</li>
                        ))}
                      </ul>
                      <a
                        className={plan.highlight ? 'btn btn--primario btn--bloco btn--sm' : 'btn btn--contorno-verde btn--bloco btn--sm'}
                        href={appLink('/?modo=cadastro')}
                        onClick={handleStart}
                      >
                        Começar teste grátis
                      </a>
                    </article>
                  )
                })}
              </div>
            )}
            <p className="planos__nota">
              O teste grátis de {TESTE_DIAS} dias não pede cartão de crédito. Você só informa os dados de pagamento se decidir assinar.
            </p>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="cta" aria-labelledby="t-cta">
          <div className="container">
            <div className="cta__caixa" data-revelar>
              <span className="cta__icone" aria-hidden="true">
                <img src="/brand/icone-atenderadar.webp" alt="" width={109} height={108} />
              </span>
              <div>
                <h2 id="t-cta">Descubra o que seu atendimento<br /> está deixando escapar.</h2>
                <p>Mais visibilidade. Mais inteligência. Mais resultados para o seu negócio.</p>
              </div>
              <div className="cta__acao">
                <a href={appLink('/?modo=cadastro')} className="btn" onClick={handleStart}>
                  Começar teste grátis <Ic n="seta" className="ic-seta" />
                </a>
                <small>{TESTE_DIAS} dias grátis • Sem cartão de crédito</small>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function ChatTopo() {
  return (
    <div className="chat__topo">
      <Ic n="voltar" style={{ fontSize: 16 }} />
      <span className="av"><Ic n="pessoa" /></span>
      <span><b>Cliente</b><small>online</small></span>
      <span className="acoes"><Ic n="telefone" /><Ic n="celular" /></span>
    </div>
  )
}
