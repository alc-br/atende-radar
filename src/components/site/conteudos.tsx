'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { SITE_URL, appLink } from '@/lib/hosts'
import { ARTIGOS, FILTROS, dataPorExtenso, minutosDeLeitura, type Artigo, type Bloco, type Filtro } from '@/content/artigos'
import { ARTE_CARTAO, CAPAS, ILU_VENDAS_PERDIDAS } from './assets'
import { useAviso } from './blog-shell'
import { Rico } from './rico'
import { Ic, atraso } from './site-ui'

/** Capa ilustrada do artigo (desenho do pacote). */
function Capa({ i }: { i: number }) {
  const c = CAPAS[i] ?? CAPAS[0]
  return <div className={`capa ${c.variante}`.trim()} aria-hidden="true" dangerouslySetInnerHTML={{ __html: c.svg }} />
}

function Meta({ a, completo }: { a: Artigo; completo?: boolean }) {
  return (
    <>
      <span><Ic n="relogio" />{minutosDeLeitura(a)} min{completo ? ' de leitura' : ''}</span>
      <span><Ic n="calendario" /><time dateTime={a.data}>{dataPorExtenso(a.data)}</time></span>
    </>
  )
}

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function Arte() {
  return (
    <>
      <span className="arte-icone"><img src="/brand/icone-atenderadar.webp" alt="" width={109} height={108} /></span>
      <div className="arte-cartao" dangerouslySetInnerHTML={{ __html: ARTE_CARTAO }} />
    </>
  )
}

/* ------------------------------------------------------------------ Lista */

export function ConteudosLista() {
  const [filtro, setFiltro] = useState<Filtro | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  // Quem digita antes de a página ficar interativa (celular lento) não perde a busca: lê o que já está no campo
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (campo.current?.value) setBusca(campo.current.value)
  }, [])
  // Só aparecem os filtros que têm artigo
  const filtros = FILTROS.filter((f) => ARTIGOS.some((a) => a.filtros.includes(f.id)))
  const destaque = ARTIGOS.find((a) => a.destaque)
  const demais = ARTIGOS.filter((a) => a !== destaque)

  const visivel = useMemo(() => {
    const q = normal(busca.trim())
    return (a: Artigo) =>
      (filtro === 'todos' || a.filtros.includes(filtro)) && (!q || normal(`${a.tag} ${a.titulo} ${a.resumo}`).includes(q))
  }, [filtro, busca])
  const algum = ARTIGOS.some(visivel)

  return (
    <main>
      <section className="blog-hero">
        <div className="container blog-hero__grid">
          <div>
            <span className="sobretitulo">Blog AtendeRadar</span>
            <h1>Conteúdos para melhorar seu atendimento e <span className="verde">não perder oportunidades</span> no WhatsApp</h1>
            <p>Dicas práticas, estratégias e análises para você vender mais, atender melhor e ter mais controle sobre o seu atendimento no WhatsApp.</p>
          </div>
          <div className="blog-hero__arte" aria-hidden="true">
            <Arte />
            <span className="arte-selo"><Ic n="whats" /><span>Insights que geram<br />mais resultados</span></span>
            <div className="arte-pilulas">
              <span><Ic n="barras" />Vendas</span>
              <span><Ic n="balao" />Atendimento</span>
              <span><Ic n="lampada" />Estratégia</span>
              <span><Ic n="tendencia" />Crescimento</span>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="filtros" role="search">
          <label className="busca">
            <span className="sr-only">Buscar conteúdos</span>
            <Ic n="lupa" />
            <input ref={campo} type="search" placeholder="Busque por um assunto, palavra-chave ou tema..." autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <button className="pilula" type="button" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</button>
          {filtros.map((f) => (
            <button key={f.id} className="pilula" type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.nome}</button>
          ))}
        </div>

        {destaque && (
          <a className="cartao destaque" href={`/conteudos/${destaque.slug}`} hidden={!visivel(destaque)} data-revelar>
            <Capa i={destaque.capa} />
            <div>
              <span className="tag">{destaque.tag}</span>
              <h2>{destaque.titulo}</h2>
              <p>{destaque.resumo}</p>
              <div className="destaque__rodape">
                <p className="meta"><Meta a={destaque} completo /></p>
                <span className="btn btn--primario btn--sm">Ler artigo completo <Ic n="seta" className="ic-seta" /></span>
              </div>
            </div>
          </a>
        )}

        <div className="artigos">
          {demais.map((a, i) => (
            <a key={a.slug} className="cartao artigo" href={`/conteudos/${a.slug}`} hidden={!visivel(a)} data-revelar style={atraso(`${(i % 3) * 0.05}s`)}>
              <Capa i={a.capa} />
              <div>
                <span className="tag">{a.tag}</span>
                <h3>{a.titulo}</h3>
                <p>{a.resumo}</p>
                <p className="meta"><Meta a={a} /></p>
              </div>
            </a>
          ))}
        </div>
        <p className="cartao sem-resultado" hidden={algum}>Nenhum conteúdo encontrado. Tente outra palavra ou escolha “Todos”.</p>

        <section className="faixa-cta" aria-labelledby="t-faixa" data-revelar>
          <div>
            <small className="rot">Transforme seu atendimento em resultados</small>
            <h2 id="t-faixa">Tenha mais controle, mais vendas e nenhum cliente esquecido.</h2>
            <p>O AtendeRadar monitora suas conversas, identifica oportunidades e ajuda sua empresa a vender mais no WhatsApp.</p>
          </div>
          <ul>
            <li><Ic n="check-bola" />Veja as oportunidades em risco</li>
            <li><Ic n="check-bola" />Evite clientes sem resposta</li>
            <li><Ic n="check-bola" />Relatórios da sua operação</li>
          </ul>
          <div className="faixa-cta__acao">
            <a className="btn btn--primario btn--lg" href={appLink('/?modo=cadastro')}>Começar teste grátis <Ic n="seta" className="ic-seta" /></a>
            <small>14 dias grátis • Sem cartão de crédito</small>
          </div>
        </section>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ Artigo */

function CtaArtigo() {
  return (
    <section className="cta-artigo" aria-labelledby="t-cta-art" data-revelar>
      <div>
        <span className="tag">Atendimento com mais controle</span>
        <h2 id="t-cta-art">Descubra o que seu atendimento está deixando escapar</h2>
        <p>O AtendeRadar analisa conversas, encontra oportunidades em risco e mostra onde sua equipe pode melhorar.</p>
        <ul>
          <li><Ic n="check-bola" />14 dias grátis</li>
          <li><Ic n="check-bola" />Alertas inteligentes</li>
          <li><Ic n="check-bola" />Sem trocar seu WhatsApp</li>
        </ul>
      </div>
      <div className="cta-artigo__arte" aria-hidden="true"><Arte /></div>
      <div className="cta-artigo__acao">
        <a className="btn btn--primario btn--lg" href={appLink('/?modo=cadastro')}>Começar teste grátis <Ic n="seta" className="ic-seta" /></a>
        <small>Comece com seu WhatsApp atual</small>
      </div>
    </section>
  )
}

function BlocoView({ b }: { b: Bloco }) {
  switch (b.t) {
    case 'p':
      return <p><Rico x={b.x} /></p>
    case 'h2':
      return <h2>{b.x}</h2>
    case 'exemplo':
      return <div className="ilu-exemplo"><p><Rico x={b.x} /></p></div>
    case 'check':
      return <ul className="lista-check">{b.itens.map((x) => <li key={x}><Ic n="check-bola" /><span><Rico x={x} /></span></li>)}</ul>
    case 'passos':
      return <ol className="lista-num">{b.itens.map(([t, x]) => <li key={t}><span><strong>{t}</strong> {x}</span></li>)}</ol>
    case 'comCitacao':
      return (
        <div className="secao-com-citacao">
          <div>
            <h2>{b.h2}</h2>
            <p>{b.p}</p>
            <ul className="lista-check" style={{ marginTop: 14 }}>{b.itens.map((x) => <li key={x}><Ic n="check-bola" />{x}</li>)}</ul>
          </div>
          <blockquote className="citacao"><span className="aspas" aria-hidden="true">“</span><p>{b.citacao}</p><cite>Equipe AtendeRadar</cite></blockquote>
        </div>
      )
    case 'pilares':
      return (
        <div className="pilares">
          {b.itens.map((x) => (
            <div key={x.b} className="cartao pilar"><span className="bola"><Ic n={x.ic} /></span><span><b>{x.b}</b><span>{x.s}</span></span></div>
          ))}
        </div>
      )
    default:
      return null
  }
}

/** Corpo do artigo: o bloco "cta" divide o texto e põe a chamada no meio, como no pacote. */
function Corpo({ blocos }: { blocos: Bloco[] }) {
  const partes: Bloco[][] = [[]]
  for (const b of blocos) {
    if (b.t === 'cta') partes.push([])
    else partes[partes.length - 1].push(b)
  }
  return (
    <>
      {partes.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <CtaArtigo />}
          {p.length > 0 && <div className="corpo-artigo">{p.map((b, j) => <BlocoView key={j} b={b} />)}</div>}
        </Fragment>
      ))}
    </>
  )
}

const semInscricao = () => () => {}

function Compartilhar({ a }: { a: Artigo }) {
  const avisar = useAviso()
  // Endereço público do artigo: o do site em produção; no navegador, o domínio aberto.
  const origem = useSyncExternalStore(semInscricao, () => window.location.origin, () => SITE_URL)
  const url = `${origem}/conteudos/${a.slug}`
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(a.titulo)
  const redes = [
    { n: 'linkedin', nome: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { n: 'whats', nome: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}`, cls: 'whats' },
    { n: 'x', nome: 'X', href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { n: 'facebook', nome: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  ]
  const copiar = () => {
    if (!navigator.clipboard) return avisar('Copie o endereço na barra do navegador.')
    navigator.clipboard.writeText(url).then(
      () => avisar('Link do artigo copiado.'),
      () => avisar('Copie o endereço na barra do navegador.'),
    )
  }
  return (
    <div className="compartilhar">
      {redes.map((r) => (
        <a key={r.n} href={r.href} className={r.cls} target="_blank" rel="noopener noreferrer" aria-label={`Compartilhar no ${r.nome}`}><Ic n={r.n} /></a>
      ))}
      <button type="button" onClick={copiar} aria-label="Copiar link"><Ic n="link" /></button>
    </div>
  )
}

export function ArtigoView({ a }: { a: Artigo }) {
  const outros = ARTIGOS.filter((o) => o.slug !== a.slug)
  // "Leia também": primeiro os que dividem algum filtro com este, depois os demais
  const leia = [...outros.filter((o) => o.filtros.some((f) => a.filtros.includes(f))), ...outros.filter((o) => !o.filtros.some((f) => a.filtros.includes(f)))].slice(0, 3)

  return (
    <main className="container">
      <div className="artigo-pag">
        <article>
          <nav className="trilha" aria-label="Você está em">
            <a href="/" aria-label="Início"><Ic n="casa" /></a>/<a href="/conteudos">Blog</a>/<span>{a.tag}</span>
          </nav>
          <header className="artigo-cab">
            <span className="tag">{a.tag}</span>
            <h1>{a.titulo}</h1>
            <p className="linha-fina">{a.linhaFina}</p>
            <div className="autoria">
              <img src="/brand/icone-atenderadar.webp" alt="" width={109} height={108} />
              <b>Equipe AtendeRadar</b>
              <span className="sep" />
              <span><Ic n="relogio" />{minutosDeLeitura(a)} min de leitura</span>
              <span className="sep" />
              <span><Ic n="calendario" /><time dateTime={a.data}>{dataPorExtenso(a.data)}</time></span>
            </div>
          </header>

          {a.ilustracao && <figure dangerouslySetInnerHTML={{ __html: ILU_VENDAS_PERDIDAS }} />}

          <Corpo blocos={a.corpo} />
        </article>

        <aside className="lado" aria-label="Mais conteúdos">
          <section className="cartao">
            <h2>Compartilhar este artigo</h2>
            <Compartilhar a={a} />
          </section>
          {leia.length > 0 && (
            <section className="cartao">
              <h2>Leia também</h2>
              <div className="leia">
                {leia.map((o) => (
                  <a key={o.slug} href={`/conteudos/${o.slug}`}>
                    <Capa i={o.capa} />
                    <span>
                      <span className="tag">{o.tag}</span>
                      <b>{o.titulo}</b>
                      <span className="meta"><span><Ic n="relogio" />{minutosDeLeitura(o)} min de leitura</span></span>
                    </span>
                  </a>
                ))}
              </div>
              <a className="btn btn--contorno btn--sm" href="/conteudos">Ver todos os artigos <Ic n="seta" className="ic-seta" /></a>
            </section>
          )}
        </aside>
      </div>

      <section className="faixa-final" aria-labelledby="t-final" data-revelar>
        <img src="/brand/icone-atenderadar.webp" alt="" width={109} height={108} />
        <div>
          <h2 id="t-final">Tenha mais controle, mais vendas e nenhum cliente esquecido.</h2>
          <p>O AtendeRadar monitora suas conversas, identifica oportunidades e ajuda sua empresa a vender mais no WhatsApp.</p>
        </div>
        <div className="faixa-final__acao">
          <a className="btn btn--primario" href={appLink('/?modo=cadastro')}>Começar teste grátis <Ic n="seta" className="ic-seta" /></a>
          <small>14 dias grátis • Sem cartão de crédito</small>
        </div>
      </section>
    </main>
  )
}
