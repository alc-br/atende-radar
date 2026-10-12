import type { ReactNode } from 'react'
import { dataPorExtenso } from '@/content/artigos'

/** Página legal (privacidade, termos) com a tipografia dos artigos. */
export function LegalPage({ titulo, atualizado, children }: { titulo: string; atualizado: string; children: ReactNode }) {
  return (
    <main className="container">
      <article className="legal">
        <nav className="trilha" aria-label="Você está em">
          <a href="/">Início</a>/<span>{titulo}</span>
        </nav>
        <header className="artigo-cab">
          <h1>{titulo}</h1>
          <p className="linha-fina">
            Última atualização: <time dateTime={atualizado}>{dataPorExtenso(atualizado)}</time>
          </p>
        </header>
        <div className="corpo-artigo">{children}</div>
      </article>
    </main>
  )
}
