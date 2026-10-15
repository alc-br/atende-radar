'use client'

import { useEffect, type CSSProperties, type RefObject } from 'react'
import { appLink } from '@/lib/hosts'
import { EMPRESA } from '@/lib/legal'

/** Ícone do sprite da página (os símbolos ficam em <Sprite />, um por página). */
export function Ic({ n, className, style }: { n: string; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className ? `ic ${className}` : 'ic'} style={style} aria-hidden="true" focusable="false">
      <use href={`#i-${n}`} />
    </svg>
  )
}

/** Sprite SVG com os símbolos do pacote de design (conteúdo estático do projeto, ver assets.ts). */
export function Sprite({ defs }: { defs: string }) {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<defs>${defs}</defs>` }} />
}

export const atraso = (s: string) => ({ '--atraso': s }) as CSSProperties

/** Contato público (só aparece quando existe uma caixa de e-mail de verdade configurada no build). */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''

/**
 * Entrada ao rolar, como o script do pacote. O que já está na tela aparece na hora (sem piscar);
 * o resto aparece quando chega perto. Chame de novo (deps) quando entrar conteúdo novo.
 */
export function useRevelar(root: RefObject<HTMLElement | null>, onReady: () => void, deps: unknown[] = []) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const itens = Array.from(el.querySelectorAll<HTMLElement>('[data-revelar]:not(.visivel)'))
    const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!('IntersectionObserver' in window) || semMovimento) {
      itens.forEach((i) => i.classList.add('visivel'))
      onReady()
      return
    }
    const fora: HTMLElement[] = []
    for (const i of itens) {
      if (i.getBoundingClientRect().top < window.innerHeight) i.classList.add('visivel')
      else fora.push(i)
    }
    onReady()
    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('visivel')
            obs.unobserve(en.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    )
    fora.forEach((i) => obs.observe(i))
    return () => obs.disconnect()
  }, deps)
}

/** Fecha o menu móvel com Esc. */
export function useEscFecha(fechar: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fechar])
}

/**
 * Rodapé do site (página de vendas, artigos e páginas legais). Usa o CSS do blog (escopo .blog).
 * Só leva a páginas que existem: nada de "em breve".
 */
export function SiteFooter() {
  return (
    <div className="blog site-rodape">
      <footer className="rodape">
        <div className="container">
          <div className="rodape__grade">
            <div className="rodape__marca">
              <a href="/" className="logo" aria-label="AtendeRadar — página inicial">
                <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} loading="lazy" decoding="async" />
              </a>
              <p>Mais vendas. Nenhum cliente esquecido.</p>
            </div>
            <nav className="rodape__col" aria-label="Produto">
              <h4>Produto</h4>
              <a href="/#recursos">Funcionalidades</a>
              <a href="/#como-funciona">Como funciona</a>
              <a href="/#planos">Planos</a>
            </nav>
            <nav className="rodape__col" aria-label="Conteúdos">
              <h4>Conteúdos</h4>
              <a href="/conteudos">Artigos</a>
              <a href="/#duvidas">Dúvidas frequentes</a>
            </nav>
            <nav className="rodape__col" aria-label="Acesso">
              <h4>Acesso</h4>
              <a href={appLink('/?modo=entrar')}>Entrar</a>
              <a href={appLink('/?modo=cadastro')}>Criar conta grátis</a>
              {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>Contato</a>}
            </nav>
          </div>
          <div className="rodape__base">
            <span>© {new Date().getFullYear()} AtendeRadar. Todos os direitos reservados.</span>
            <nav aria-label="Legal">
              <a href="/privacidade">Política de Privacidade</a>
              <a href="/termos">Termos de Uso</a>
              <a href="/status">Status do serviço</a>
            </nav>
          </div>
          <p className="rodape__empresa">
            {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj} · {EMPRESA.endereco}
          </p>
        </div>
      </footer>
    </div>
  )
}
