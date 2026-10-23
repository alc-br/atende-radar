import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { appLink, SITE_URL } from '@/lib/hosts'
import { SEGMENTS, segmentBySlug, signupQuery } from '@/lib/segments'
import { LANDING_SPRITE } from '@/components/site/assets'
import { Ic, Sprite } from '@/components/site/site-ui'
import { CookieSettingsLink } from '@/components/consent/cookie-consent'
import { EMPRESA } from '@/lib/legal'

// Página de anúncio por segmento (src/lib/segments.ts): renderizada no servidor, sem JavaScript próprio, fora do Google
// e sem menu que leve para outra página. O botão abre o cadastro no app com a campanha do anúncio (utm_*, gclid...).

const TESTE_DIAS = 14 // o cadastro sempre começa com 14 dias de teste, sem cartão (api/auth/signup)

type Params = { segmento: string }
type Search = Record<string, string | string[] | undefined>

export function generateStaticParams(): Params[] {
  return SEGMENTS.map((s) => ({ segmento: s.slug }))
}
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const s = segmentBySlug((await params).segmento)
  if (!s) return {}
  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title: `AtendeRadar para ${s.nome.toLowerCase()}: ${s.titulo.toLowerCase()} ${s.destaque}`,
    description: s.texto,
    robots: { index: false, follow: false },
  }
}

export default async function SegmentoPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const s = segmentBySlug((await params).segmento)
  if (!s) notFound()
  const cadastro = appLink(`/?${signupQuery(await searchParams)}`)

  return (
    <div className="lp lp--segmento" data-segmento={s.slug}>
      <Sprite defs={LANDING_SPRITE} />

      <header className="topo">
        <div className="container topo__inner">
          <span className="logo">
            <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} fetchPriority="high" />
          </span>
          <div className="topo__acoes">
            <a href={cadastro} className="btn btn--primario btn--sm" data-cta="cadastro">
              Teste grátis <Ic n="seta" className="ic-seta" />
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container hero__grid">
            <div className="hero__texto">
              <span className="selo">AtendeRadar para {s.nome.toLowerCase()}</span>
              <h1>
                {s.titulo} <span className="verde">{s.destaque}</span>
              </h1>
              <p>{s.texto}</p>
              <div className="hero__acoes">
                <a href={cadastro} className="btn btn--primario" data-cta="cadastro">
                  Testar grátis por {TESTE_DIAS} dias <Ic n="seta" className="ic-seta" />
                </a>
              </div>
              <ul className="hero__provas">
                <li><Ic n="check" />{TESTE_DIAS} dias grátis</li>
                <li><Ic n="check" />Sem cartão de crédito</li>
                <li><Ic n="check" />Seu número atual de WhatsApp</li>
              </ul>
            </div>

            <div className="demo demo--segmento" role="img" aria-label="Exemplo ilustrativo de uma conversa sem retorno apontada pelo AtendeRadar">
              <div className="chat" aria-hidden="true">
                <div className="chat__topo">
                  <span className="av"><Ic n="pessoa" /></span>
                  <span><b>Cliente</b><small>online</small></span>
                </div>
                <div className="chat__corpo">
                  <div className="bolha">{s.conversa.cliente}<time>10:24</time></div>
                  <div className="bolha bolha--eu">{s.conversa.equipe}<time>10:25</time></div>
                  <div className="pendente"><Ic n="relogio" />{s.conversa.pendente}</div>
                </div>
              </div>
              <div className="cartao analise" aria-hidden="true">
                <div className="alerta__cab"><span className="alerta__ic"><Ic n="alerta" /></span><span className="tag-atencao">Atenção</span></div>
                <h3>Oportunidade em risco</h3>
                <p>{s.alerta}</p>
                <ul>
                  <li>
                    <span className="ic-caixa ic-ok"><Ic n="check" /></span>
                    <span><b>Ação sugerida</b><span>Retomar o contato hoje e registrar o resultado.</span></span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="secao secao--verde" aria-labelledby="t-dores">
          <div className="container">
            <div className="cab-centro">
              <h2 className="titulo" id="t-dores">O que o AtendeRadar aponta em {s.nome.toLowerCase()}</h2>
              <p className="sub">Exemplos ilustrativos. Ninguém precisa ler conversa por conversa.</p>
            </div>
            <div className="grade-3">
              {s.dores.map((d) => (
                <article key={d.t} className="cartao problema">
                  <span className="ic-caixa t-vermelho"><Ic n="alerta" /></span>
                  <h3>{d.t}</h3>
                  <p>{d.p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="secao" aria-labelledby="t-como">
          <div className="container">
            <div className="cab-centro">
              <h2 className="titulo" id="t-como">Como funciona</h2>
            </div>
            <ol className="grade-3 passos-segmento">
              <li className="cartao mini"><span className="ic-caixa t-verde"><Ic n="whats" /></span><h3>Conecte o WhatsApp</h3><p>Lendo um QR Code, como no WhatsApp Web. O número continua o mesmo.</p></li>
              <li className="cartao mini"><span className="ic-caixa t-verde"><Ic n="lupa" /></span><h3>As conversas são auditadas</h3><p>O AtendeRadar acompanha o atendimento o tempo todo.</p></li>
              <li className="cartao mini"><span className="ic-caixa t-verde"><Ic n="sino" /></span><h3>Você recebe o que precisa de atenção</h3><p>Alertas e relatórios com quem ficou sem retorno.</p></li>
            </ol>
          </div>
        </section>

        <section className="cta" aria-labelledby="t-cta">
          <div className="container">
            <div className="cta__caixa">
              <span className="cta__icone" aria-hidden="true">
                <img src="/brand/icone-atenderadar.webp" alt="" width={109} height={108} loading="lazy" decoding="async" />
              </span>
              <div>
                <h2 id="t-cta">Veja o que o seu atendimento está deixando escapar.</h2>
                <p>{TESTE_DIAS} dias grátis • Sem cartão de crédito • Sem prazo mínimo</p>
              </div>
              <div className="cta__acao">
                <a href={cadastro} className="btn" data-cta="cadastro">
                  Começar teste grátis <Ic n="seta" className="ic-seta" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="rodape-segmento">
        <div className="container">
          <nav aria-label="Legal">
            <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>
            <a href="/termos" target="_blank" rel="noopener">Termos de Uso</a>
            <CookieSettingsLink />
          </nav>
          <p>
            © {new Date().getFullYear()} AtendeRadar · {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj}
          </p>
          <p className="suave">WhatsApp é marca da Meta Platforms, Inc. O AtendeRadar não é afiliado à Meta nem ao WhatsApp.</p>
        </div>
      </footer>
    </div>
  )
}
