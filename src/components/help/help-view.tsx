'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, BookOpen, CircleHelp, LifeBuoy, Search, Send, Compass, Activity, GraduationCap } from 'lucide-react'
import { useAppStore, type View } from '@/lib/store'
import { TOURS } from '@/lib/tours'
import { fetchMutation } from '@/lib/mutation'
import { APP_VERSION } from '@/lib/app-version'
import { supportStatusLabel, supportStatusTone } from '@/lib/support'
import { SITE_URL, splitHosts } from '@/lib/hosts'
import { ARTIGOS_AJUDA, CATEGORIAS_AJUDA, buscarAjuda, type ArtigoAjuda, type BlocoAjuda } from '@/content/ajuda'
import { Rico } from '@/components/site/rico'

// Central de ajuda (P8): artigos do manual com busca, atalhos para os guias (tours) e "Falar com o suporte".

/** Nome de cada tela, para o botão "Ver o guia da tela ...". */
const VIEW_LABEL: Partial<Record<View, string>> = {
  dashboard: 'Visão Geral',
  alerts: 'Alertas',
  conversations: 'Conversas',
  'conversation-detail': 'Conversas',
  recovery: 'Recuperação',
  team: 'Equipe',
  'agent-profile': 'Equipe',
  reports: 'Relatórios',
  connections: 'Conexões',
  settings: 'Configurações',
  members: 'Membros',
  teams: 'Equipes',
  plans: 'Planos',
  admin: 'Admin',
  'crm-deals': 'Negócios',
  'crm-deal': 'Negócios',
}

/** Tour de cada tela (as telas de detalhe usam o tour da lista). */
const TOUR_OF: Partial<Record<View, string>> = { 'conversation-detail': 'conversations', 'agent-profile': 'team', checkout: 'plans', 'crm-deal': 'crm-deals' }

const MAX_SCREENSHOT = 2 * 1024 * 1024
const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp']

interface MeuChamado {
  id: string
  subject: string
  status: string
  createdAt: string
  hasScreenshot: boolean
}

function BlocoAjudaView({ b }: { b: BlocoAjuda }) {
  switch (b.t) {
    case 'p':
      return <p className="leading-relaxed"><Rico x={b.x} /></p>
    case 'h2':
      return <h3 className="mt-2 text-[15px] font-bold">{b.x}</h3>
    case 'exemplo':
      return <p className="rounded-lg border border-[var(--borda)] bg-[var(--superficie-3)] px-3 py-2 text-sm italic"><Rico x={b.x} /></p>
    case 'check':
      return <ul className="list-disc space-y-1.5 pl-5">{b.itens.map((x) => <li key={x}><Rico x={x} /></li>)}</ul>
    case 'passos':
      return <ol className="space-y-1.5 pl-1">{b.itens.map(([n, x]) => <li key={n}><strong>{n}</strong> <Rico x={x} /></li>)}</ol>
  }
}

function ArtigoView({ artigo, onVoltar }: { artigo: ArtigoAjuda; onVoltar: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => titulo.current?.focus(), [artigo.slug])
  return (
    <article className="cartao cartao--pad grid gap-3" aria-labelledby="ajuda-artigo-titulo">
      <button type="button" className="btn btn--link btn--sm justify-self-start" onClick={onVoltar}>
        <ArrowLeft className="ic" aria-hidden="true" />Voltar para os artigos
      </button>
      <h2 id="ajuda-artigo-titulo" ref={titulo} tabIndex={-1} className="text-lg font-bold outline-none">{artigo.titulo}</h2>
      <p className="suave">{artigo.resumo}</p>
      <div className="grid gap-3 text-[14px]">{artigo.corpo.map((b, i) => <BlocoAjudaView key={i} b={b} />)}</div>
    </article>
  )
}

function ListaArtigos({ artigos, onAbrir }: { artigos: ArtigoAjuda[]; onAbrir: (slug: string) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {artigos.map((a) => (
        <li key={a.slug}>
          <button type="button" className="cartao cartao--pad h-full w-full text-left hover:border-[var(--verde,#12a862)]" onClick={() => onAbrir(a.slug)}>
            <strong className="block text-[14px]">{a.titulo}</strong>
            <span className="suave mt-1 block text-[13px]">{a.resumo}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function FalarComSuporte({ tela }: { tela: string | null }) {
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [chamados, setChamados] = useState<MeuChamado[] | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const carregar = useCallback(() => {
    fetch('/api/support')
      .then((r) => (r.ok ? r.json() : { tickets: [] }))
      .then((d: { tickets?: MeuChamado[] }) => setChamados(d.tickets ?? []))
      .catch(() => setChamados([]))
  }, [])
  useEffect(carregar, [carregar])

  const escolherArquivo = (f: File | null) => {
    setErro('')
    if (f && !TIPOS_IMAGEM.includes(f.type)) {
      setErro('Envie a captura em PNG, JPG ou WEBP.')
      if (inputArquivo.current) inputArquivo.current.value = ''
      return setArquivo(null)
    }
    if (f && f.size > MAX_SCREENSHOT) {
      setErro('A imagem passa de 2 MB. Envie uma captura menor.')
      if (inputArquivo.current) inputArquivo.current.value = ''
      return setArquivo(null)
    }
    setArquivo(f)
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    const form = new FormData()
    form.set('subject', assunto.trim())
    form.set('message', mensagem.trim())
    form.set('appVersion', APP_VERSION)
    if (tela) form.set('screen', tela)
    if (arquivo) form.set('screenshot', arquivo)
    setEnviando(true)
    try {
      await fetchMutation('/api/support', { method: 'POST', body: form })
      toast.success('Recebemos o seu chamado. A resposta chega no seu e-mail.')
      setAssunto('')
      setMensagem('')
      setArquivo(null)
      if (inputArquivo.current) inputArquivo.current.value = ''
      carregar()
    } catch (err) {
      setErro(err instanceof Error && err.message ? err.message : 'Não foi possível enviar. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="cartao secao-config" aria-labelledby="t-suporte" data-tour="help-support">
      <header className="secao-config__cab">
        <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><LifeBuoy className="ic" /></span>
        <div>
          <h2 id="t-suporte">Falar com o suporte</h2>
          <p>Não achou a resposta? Conte o que aconteceu. A versão do sistema e a tela em que você estava vão junto, sem você precisar informar.</p>
        </div>
      </header>
      <form className="form-grade" onSubmit={enviar}>
        <div className="campo form-grade__todo">
          <label htmlFor="suporte-assunto">Assunto</label>
          <input className="entrada" id="suporte-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} required minLength={3} maxLength={150} disabled={enviando} />
        </div>
        <div className="campo form-grade__todo">
          <label htmlFor="suporte-mensagem">Mensagem</label>
          <textarea className="area" id="suporte-mensagem" rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} required minLength={10} maxLength={5000} disabled={enviando} />
        </div>
        <div className="campo form-grade__todo">
          <label htmlFor="suporte-captura">Captura de tela (opcional)</label>
          <input
            ref={inputArquivo}
            className="entrada"
            id="suporte-captura"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby="suporte-captura-ajuda"
            onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
            disabled={enviando}
          />
          <p id="suporte-captura-ajuda" className="ajuda-campo">PNG, JPG ou WEBP, até 2 MB. Evite mostrar dados pessoais de clientes na imagem.</p>
        </div>
        {erro && <p role="alert" className="form-grade__todo text-sm text-[var(--vermelho)]">{erro}</p>}
        <footer className="secao-config__rodape form-grade__todo">
          <button className="btn btn--escuro btn--lg" type="submit" disabled={enviando}>
            <Send className="ic" aria-hidden="true" />{enviando ? 'Enviando...' : 'Enviar para o suporte'}
          </button>
        </footer>
      </form>
      {chamados && chamados.length > 0 && (
        <div className="mt-4 grid gap-2">
          <h3 className="text-[14px] font-bold">Seus chamados</h3>
          <ul className="grid gap-1.5" aria-label="Seus chamados">
            {chamados.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span>{c.subject}</span>
                <span className="flex items-center gap-2">
                  <span className="suave">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</span>
                  <span className={`tag ${supportStatusTone(c.status)}`}>{supportStatusLabel(c.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default function HelpView() {
  const helpFrom = useAppStore((s) => s.helpFrom)
  const setView = useAppStore((s) => s.setView)
  const startTour = useAppStore((s) => s.startTour)
  const openSystemTour = useAppStore((s) => s.openSystemTour)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  const resultados = useMemo(() => buscarAjuda(busca), [busca])
  const artigo = aberto ? ARTIGOS_AJUDA.find((a) => a.slug === aberto) ?? null : null
  const origem: View = helpFrom && helpFrom !== 'help' ? helpFrom : 'dashboard'
  const tourDaTela = TOUR_OF[origem] ?? origem
  const temGuia = !!TOURS[tourDaTela] && !!VIEW_LABEL[origem]
  const statusUrl = splitHosts ? `${SITE_URL}/status` : '/status'

  const abrirGuia = (tourId: string) => {
    setView(origem) // o guia aponta para elementos da tela: volta para ela antes
    startTour(tourId)
  }

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><CircleHelp className="ic" /></span>
          <div>
            <h1>Central de ajuda</h1>
            <p>Respostas sobre o AtendeRadar em linguagem simples, guias das telas e contato com o suporte.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-[18px]">
        <section className="cartao cartao--pad grid gap-3" aria-labelledby="t-guias" data-tour="help-guides">
          <h2 id="t-guias" className="flex items-center gap-2 text-[15px] font-bold"><Compass className="ic" aria-hidden="true" />Guias passo a passo</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn--primario" onClick={openSystemTour}>
              <GraduationCap className="ic" aria-hidden="true" />Treinamento do sistema
            </button>
            {temGuia && (
              <button type="button" className="btn btn--contorno-verde" onClick={() => abrirGuia(tourDaTela)}>
                Ver o guia da tela {VIEW_LABEL[origem]}
              </button>
            )}
            <button type="button" className="btn btn--contorno-verde" onClick={() => abrirGuia('welcome')}>
              Tour de boas-vindas
            </button>
            <a className="btn btn--link" href={statusUrl} target="_blank" rel="noopener noreferrer">
              <Activity className="ic" aria-hidden="true" />Status do serviço
            </a>
          </div>
        </section>

        <section className="grid gap-3" aria-labelledby="t-artigos">
          <h2 id="t-artigos" className="flex items-center gap-2 text-[15px] font-bold"><BookOpen className="ic" aria-hidden="true" />Artigos</h2>
          <label className="busca" style={{ maxWidth: 'none', marginRight: 0 }} data-tour="help-search">
            <span className="sr-only">Buscar na ajuda</span>
            <Search className="ic ic-lupa" aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar na ajuda (ex.: valor em risco, QR Code, cancelar)"
              autoComplete="off"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setAberto(null)
              }}
            />
          </label>

          {artigo ? (
            <ArtigoView artigo={artigo} onVoltar={() => setAberto(null)} />
          ) : busca.trim() ? (
            resultados.length > 0 ? (
              <>
                <p className="suave text-[13px]" aria-live="polite">{resultados.length === 1 ? '1 artigo encontrado' : `${resultados.length} artigos encontrados`}</p>
                <ListaArtigos artigos={resultados} onAbrir={setAberto} />
              </>
            ) : (
              <div className="cartao vazio" aria-live="polite">
                <strong>Nenhum artigo com essas palavras.</strong>
                <p>Tente outra palavra ou fale com o suporte logo abaixo.</p>
              </div>
            )
          ) : (
            CATEGORIAS_AJUDA.map((c) => {
              const daCategoria = ARTIGOS_AJUDA.filter((a) => a.categoria === c.id)
              if (daCategoria.length === 0) return null
              return (
                <div key={c.id} className="grid gap-2">
                  <h3 className="suave text-[12px] font-bold uppercase tracking-wide">{c.nome}</h3>
                  <ListaArtigos artigos={daCategoria} onAbrir={setAberto} />
                </div>
              )
            })
          )}
        </section>

        <FalarComSuporte tela={helpFrom && helpFrom !== 'help' ? helpFrom : null} />
      </div>
    </>
  )
}
