'use client'

import { useEffect, useState } from 'react'

// Aviso de cookies (Consent Mode v2 + LGPD) e captura da campanha (docs/operacao/medicao.md). Aceitar, recusar e
// configurar têm o mesmo peso; até a pessoa escolher, medição e anúncios ficam negados (padrão no layout, antes do GTM).
// A escolha fica no cookie próprio ar_consent (180 dias), que vale para atenderadar.com.br e app.atenderadar.com.br, e
// pode ser mudada no rodapé do site e no menu do app ("Preferências de cookies").
// A campanha da visita (cookie ar_attr) é guardada pelo script do <head> (src/lib/gtm.ts), antes de a página rodar.
type Choice = { analytics: boolean; ads: boolean }

const OPEN_EVENT = 'atenderadar:cookies'

const domain = () => (location.hostname.endsWith('atenderadar.com.br') ? '; domain=.atenderadar.com.br' : '')
const setCookie = (name: string, value: string, days: number) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${days * 86400}; path=/${domain()}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`
}
const getCookie = (name: string) => {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  try {
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

function gtag(..._args: unknown[]) {
  const w = window as unknown as { dataLayer?: unknown[] }
  w.dataLayer = w.dataLayer ?? []
  // o GTM só entende o objeto arguments (como no gtag.js oficial)
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments)
}

function apply(c: Choice) {
  const a = c.analytics ? 'granted' : 'denied'
  const d = c.ads ? 'granted' : 'denied'
  gtag('consent', 'update', { analytics_storage: a, ad_storage: d, ad_user_data: d, ad_personalization: d })
  gtag('set', 'ads_data_redaction', d === 'denied')
  const w = window as unknown as { dataLayer: unknown[] }
  w.dataLayer.push({ event: 'consent_update', consent_analytics: a, consent_ads: d })
}

export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN_EVENT))

export function CookieConsent() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(false)
  const [c, setC] = useState<Choice>({ analytics: false, ads: false })

  useEffect(() => {
    let saved: Choice | null = null
    try {
      saved = JSON.parse(getCookie('ar_consent') ?? 'null')
    } catch {
      // cookie inválido: pergunta de novo
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o cookie só existe no navegador
    if (saved) setC({ analytics: saved.analytics === true, ads: saved.ads === true })
    else setOpen(true)
    const reopen = () => {
      setConfig(true)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, reopen)
    return () => window.removeEventListener(OPEN_EVENT, reopen)
  }, [])

  const choose = (x: Choice) => {
    setCookie('ar_consent', JSON.stringify({ v: 1, ...x, at: new Date().toISOString() }), 180)
    apply(x)
    setC(x)
    setOpen(false)
    setConfig(false)
  }

  if (!open) return null
  const btn = 'inline-flex h-9 items-center justify-center rounded-lg border px-3.5 text-[13.5px] font-semibold transition-colors'
  const neutral = `${btn} border-[var(--borda-forte,#cbd5d1)] bg-[var(--superficie,#fff)] text-[var(--texto,#0f1f18)] hover:bg-[var(--superficie-2,#f3f6f4)]`
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="aviso-cookies-titulo"
      data-testid="aviso-cookies"
      className="fixed inset-x-3 bottom-3 z-[1000] mx-auto max-w-[760px] rounded-2xl border border-[var(--borda,#dfe7e3)] bg-[var(--superficie,#fff)] p-4 text-[var(--texto,#0f1f18)] shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] sm:p-5"
    >
      <p id="aviso-cookies-titulo" className="m-0 text-[15px] font-bold">Cookies de medição e de anúncios</p>
      <p className="mt-1.5 mb-0 text-[13.5px] leading-relaxed text-[var(--texto-2,#43554c)]">
        Usamos cookies necessários para o sistema funcionar. Com a sua permissão, também usamos o Google Analytics para medir
        as visitas e os cookies do Google e da Meta para saber quais anúncios trazem clientes.{' '}
        <a href="/privacidade#cookies" className="font-semibold text-[var(--verde-700,#0b5a38)] underline">Saiba mais</a>.
      </p>
      {config && (
        <div className="mt-3 grid gap-2.5 text-[13px]">
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked disabled className="mt-0.5" />
            <span><b>Necessários</b> · entrar na conta, manter a sessão e proteger o pagamento. Sempre ativos.</span>
          </label>
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={c.analytics} onChange={(e) => setC({ ...c, analytics: e.target.checked })} className="mt-0.5" aria-label="Medição" />
            <span><b>Medição</b> · Google Analytics: páginas visitadas e etapas da contratação, sem o seu nome ou e-mail.</span>
          </label>
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={c.ads} onChange={(e) => setC({ ...c, ads: e.target.checked })} className="mt-0.5" aria-label="Anúncios" />
            <span><b>Anúncios</b> · Google Ads e Meta: saber se a contratação veio de um anúncio. O e-mail e o celular vão só como código (hash), nunca em texto.</span>
          </label>
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap justify-end gap-2">
        {config ? (
          <button type="button" className={neutral} onClick={() => choose(c)}>Salvar minhas escolhas</button>
        ) : (
          <button type="button" className={neutral} onClick={() => setConfig(true)}>Configurar</button>
        )}
        <button type="button" className={neutral} onClick={() => choose({ analytics: false, ads: false })}>Recusar</button>
        <button type="button" className={neutral} onClick={() => choose({ analytics: true, ads: true })}>Aceitar todos</button>
      </div>
    </div>
  )
}

/** Reabre o aviso com as opções (rodapé do site, menu do app). Um link, para herdar o estilo do lugar onde fica. */
export function CookieSettingsLink({ className, children = 'Preferências de cookies' }: { className?: string; children?: React.ReactNode }) {
  return (
    <a
      href="#preferencias-de-cookies"
      role="button"
      className={className}
      onClick={(e) => {
        e.preventDefault()
        openCookieSettings()
      }}
    >
      {children}
    </a>
  )
}
