import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, LayoutDashboard, RotateCcw } from 'lucide-react'
import { SITE_URL, appLink } from '@/lib/hosts'

// Tela de erro (página não encontrada, falha inesperada): mesmo cartão das telas de conta (.ar.conta).
// Links com <a> de propósito: recarregam a página inteira e descartam o estado que quebrou.
// Nunca mostra mensagem técnica nem pilha do erro; no máximo o código (digest) para o suporte achar no log.
export function ErrorScreen({
  icon: Icon,
  title,
  text,
  retry,
  code,
}: {
  icon: LucideIcon
  title: string
  text: string
  retry?: () => void
  code?: string
}) {
  const painel = appLink('/')
  const site = SITE_URL ? `${SITE_URL}/` : '' // só existe à parte quando os domínios são separados
  return (
    <div className="ar conta">
      <div className="conta">
        <main className="acesso">
          <a className="conta-logo conta-logo--grande" href={painel} aria-label="AtendeRadar — painel">
            <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
          </a>

          <section className="conta-cartao acesso__cartao" aria-labelledby="t-erro">
            <div className="icone-email" aria-hidden="true">
              <Icon className="ic" />
            </div>
            <h1 id="t-erro">{title}</h1>
            <p>{text}</p>

            <div className="mt-[30px] grid gap-3">
              {retry && (
                <button type="button" onClick={retry} className="btn btn--verde btn--xl btn--bloco">
                  <RotateCcw className="ic" aria-hidden="true" />
                  Tentar novamente
                </button>
              )}
              <a href={painel} className={`btn ${retry ? 'btn--contorno-verde' : 'btn--verde'} btn--xl btn--bloco`}>
                <LayoutDashboard className="ic" aria-hidden="true" />
                Ir para o painel
              </a>
              {code && <p className="text-xs text-[var(--suave)]">Código do erro: {code}</p>}
              {site && (
                <div className="voltar-login">
                  <a href={site}><ArrowLeft className="ic" aria-hidden="true" />Voltar ao site</a>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
