'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { appLink } from '@/lib/hosts'
import { BLOG_SPRITE } from './assets'
import { Ic, SiteFooter, Sprite, useEscFecha, useRevelar } from './site-ui'

const AvisoCtx = createContext<(msg: string) => void>(() => {})
/** Aviso rápido no rodapé da tela (ex.: "Link do artigo copiado."). */
export const useAviso = () => useContext(AvisoCtx)

/** Casca das páginas de conteúdo (lista de artigos, artigo, páginas legais): topo, rodapé, ícones e avisos. */
export function BlogShell({ children }: { children: ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [aviso, setAviso] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const fechar = useCallback(() => setMenuAberto(false), [])
  useEscFecha(fechar)
  useRevelar(rootRef, () => setPronto(true))

  const avisar = useCallback((msg: string) => {
    setAviso(msg)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setAviso(''), 2600)
  }, [])

  return (
    <AvisoCtx.Provider value={avisar}>
      <div ref={rootRef} className={'blog' + (pronto ? ' js' : '') + (menuAberto ? ' menu-aberto' : '')}>
        <Sprite defs={BLOG_SPRITE} />
        <header className="topo">
          <div className="container topo__inner">
            <a href="/" className="logo" aria-label="AtendeRadar — página inicial">
              <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
            </a>
            <nav className="nav" id="menu" aria-label="Principal">
              <a href="/#recursos" onClick={fechar}>Produto</a>
              <a href="/#como-funciona" onClick={fechar}>Como funciona</a>
              <a href="/#planos" onClick={fechar}>Planos</a>
              <a href={appLink('/?modo=entrar')} onClick={fechar}>Login</a>
            </nav>
            <div className="topo__acoes">
              <a href={appLink('/?modo=cadastro')} className="btn btn--primario">
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
        {children}
      </div>
      <SiteFooter />
      <div className="blog">
        <div className={'toast' + (aviso ? ' visivel' : '')} role="status" aria-live="polite">
          {aviso}
        </div>
      </div>
    </AvisoCtx.Provider>
  )
}
