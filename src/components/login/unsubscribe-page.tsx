'use client'

import { Suspense, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, BellOff, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { fetchMutation, MUTATION_ERROR_MESSAGE } from '@/lib/mutation'

// Página do link "parar de receber alertas por e-mail". Não desliga sozinha ao abrir (antivírus e pré-visualização
// abrem links): a pessoa confirma no botão.

const ERROR_BOX = 'flex items-start gap-3 rounded-xl border border-[var(--vermelho-borda)] bg-[var(--vermelho-fundo)] px-4 py-3 text-sm text-[var(--vermelho)]'
const semAssinatura = () => () => {}

function Inner() {
  const token = useSearchParams().get('token') || ''
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const pronto = useSyncExternalStore(semAssinatura, () => true, () => false)

  const confirmar = async () => {
    setState('loading')
    try {
      await fetchMutation('/api/public/unsubscribe', { method: 'POST', json: { token } })
      setState('done')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : MUTATION_ERROR_MESSAGE)
      setState('error')
    }
  }

  return (
    <div className="ar conta">
      <div className="conta">
        <main className="acesso">
          <Link className="conta-logo conta-logo--grande" href="/" aria-label="AtendeRadar — página inicial">
            <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
          </Link>

          <section className="conta-cartao acesso__cartao" aria-labelledby="t-descadastrar">
            <div className="icone-email" aria-hidden="true">
              <BellOff className="ic" />
              <span className="mini"><Lock className="ic" /></span>
            </div>
            <h1 id="t-descadastrar">Parar de receber alertas por e-mail</h1>
            <p>Os alertas continuam aparecendo no painel e no sino de notificações. Você pode religar os e-mails quando quiser em Meu perfil.</p>

            <div className="mt-[30px] grid gap-4 text-left">
              {!token && (
                <p role="alert" className={ERROR_BOX}>
                  <AlertCircle className="ic mt-0.5 text-lg" aria-hidden="true" /> Link incompleto. Abra o link do e-mail novamente.
                </p>
              )}

              {token && state === 'done' && (
                <div role="status" className="confirmacao">
                  <span className="bola"><ShieldCheck className="ic" aria-hidden="true" /></span>
                  <span>Pronto. Você não vai mais receber alertas por e-mail.</span>
                </div>
              )}

              {token && state === 'error' && (
                <p role="alert" className={ERROR_BOX}>
                  <AlertCircle className="ic mt-0.5 text-lg" aria-hidden="true" /> {error}
                </p>
              )}

              {token && state !== 'done' && (
                <button type="button" onClick={confirmar} disabled={!pronto || state === 'loading'} className="btn btn--verde btn--xl btn--bloco">
                  {state === 'loading'
                    ? <><Loader2 className="ic animate-spin" aria-hidden="true" />Desligando...</>
                    : <>Parar de receber alertas por e-mail</>}
                </button>
              )}

              <div className="voltar-login">
                <Link href="/"><ArrowLeft className="ic" aria-hidden="true" />Ir para o AtendeRadar</Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
