'use client'

import { Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { TermsCheckbox } from './terms-checkbox'
import { Loader2, ShieldCheck, AlertCircle, ArrowLeft, ArrowRight, KeyRound, UserPlus, MailCheck, Lock, type LucideIcon } from 'lucide-react'

type Kind = 'reset' | 'invite' | 'verify'

const COPY: Record<Kind, { title: string; subtitle: string; endpoint: string; button: string; done: string; needsPassword: boolean; icon: LucideIcon }> = {
  reset: {
    title: 'Criar nova senha',
    subtitle: 'Escolha uma senha nova para a sua conta.',
    endpoint: '/api/auth/reset',
    button: 'Salvar nova senha',
    done: 'Senha alterada! Já pode entrar com a senha nova.',
    needsPassword: true,
    icon: KeyRound,
  },
  invite: {
    title: 'Aceitar convite',
    subtitle: 'Crie a sua senha para entrar no AtendeRadar.',
    endpoint: '/api/auth/accept-invite',
    button: 'Criar senha e entrar',
    done: 'Tudo certo! Sua conta está ativa. Já pode entrar.',
    needsPassword: true,
    icon: UserPlus,
  },
  verify: {
    title: 'Confirmando o seu e-mail',
    subtitle: 'Só um instante...',
    endpoint: '/api/auth/verify-email',
    button: '',
    done: 'E-mail confirmado! Obrigado.',
    needsPassword: false,
    icon: MailCheck,
  },
}

const ERROR_BOX = 'flex items-start gap-3 rounded-xl border border-[var(--vermelho-borda)] bg-[var(--vermelho-fundo)] px-4 py-3 text-sm text-[var(--vermelho)]'

const semAssinatura = () => () => {}

function Inner({ kind }: { kind: Kind }) {
  const copy = COPY[kind]
  const Icon = copy.icon
  const token = useSearchParams().get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>(copy.needsPassword ? 'idle' : 'loading')
  const [error, setError] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false) // só no convite: quem entra pela 1ª vez aceita os termos
  // Campos só liberam depois da hidratação: o que fosse digitado antes seria apagado pelo React (visto no Safari)
  const pronto = useSyncExternalStore(semAssinatura, () => true, () => false)

  const submit = async (body: Record<string, unknown>) => {
    setState('loading')
    try {
      const res = await fetch(copy.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) {
        setState('done')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Algo deu errado. Tente novamente.')
        setState('error')
      }
    } catch {
      setError('Não foi possível conectar ao servidor. Tente novamente.')
      setState('error')
    }
  }

  // Confirmação de e-mail não pede nada: usa o link direto.
  useEffect(() => {
    if (copy.needsPassword) return
    const id = window.setTimeout(() => void submit({ token }), 0)
    return () => window.clearTimeout(id)
  }, [])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('As senhas não são iguais.')
      setState('error')
      return
    }
    submit(kind === 'invite' ? { token, password, acceptTerms } : { token, password })
  }

  // Mesmo desenho de recuperar-senha.html do pacote (a raiz `.ar.conta` é o `<body class="conta">` de lá).
  return (
    <div className="ar conta">
      <div className="conta">
        <main className="acesso">
          <Link className="conta-logo conta-logo--grande" href="/" aria-label="AtendeRadar — página inicial">
            <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
          </Link>

          <section className="conta-cartao acesso__cartao" aria-labelledby="t-token">
            <div className="icone-email" aria-hidden="true">
              <Icon className="ic" />
              <span className="mini"><Lock className="ic" /></span>
            </div>
            <h1 id="t-token">{copy.title}</h1>
            <p>{copy.subtitle}</p>

            <div className="mt-[30px] grid gap-4 text-left">
              {!token && (
                <p role="alert" className={ERROR_BOX}>
                  <AlertCircle className="ic mt-0.5 text-lg" aria-hidden="true" /> Link incompleto. Abra o link do e-mail novamente.
                </p>
              )}

              {token && state === 'done' && (
                <div role="status" className="confirmacao">
                  <span className="bola"><ShieldCheck className="ic" aria-hidden="true" /></span>
                  <span>{copy.done}</span>
                </div>
              )}

              {token && state === 'error' && (
                <p role="alert" className={ERROR_BOX}>
                  <AlertCircle className="ic mt-0.5 text-lg" aria-hidden="true" /> {error}
                </p>
              )}

              {token && copy.needsPassword && state !== 'done' && (
                <form onSubmit={onSubmit} className="mt-0">
                  <div className="campo">
                    <label htmlFor="new-password">Nova senha</label>
                    <div className="campo-ic">
                      <Lock className="ic" aria-hidden="true" />
                      <input className="entrada entrada--grande" id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" aria-describedby="new-password-hint" disabled={!pronto || state === 'loading'} />
                    </div>
                    <p id="new-password-hint" className="text-xs text-[var(--suave)]">Mínimo de 10 caracteres, com letras e números.</p>
                  </div>
                  <div className="campo">
                    <label htmlFor="confirm-password">Repita a senha</label>
                    <div className="campo-ic">
                      <Lock className="ic" aria-hidden="true" />
                      <input className="entrada entrada--grande" id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" disabled={!pronto || state === 'loading'} />
                    </div>
                  </div>
                  {kind === 'invite' && (
                    <TermsCheckbox id="invite-terms" checked={acceptTerms} onChange={setAcceptTerms} disabled={!pronto || state === 'loading'} />
                  )}
                  <button type="submit" disabled={!pronto || state === 'loading'} className="btn btn--verde btn--xl btn--bloco">
                    {state === 'loading'
                      ? <><Loader2 className="ic animate-spin" aria-hidden="true" />Salvando...</>
                      : <>{copy.button} <ArrowRight className="ic" aria-hidden="true" /></>}
                  </button>
                </form>
              )}

              {token && !copy.needsPassword && state === 'loading' && (
                <div className="flex justify-center py-2" role="status" aria-label="Confirmando">
                  <Loader2 className="ic animate-spin text-xl text-[var(--suave)]" aria-hidden="true" />
                </div>
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

export default function TokenPage({ kind }: { kind: Kind }) {
  return (
    <Suspense fallback={null}>
      <Inner kind={kind} />
    </Suspense>
  )
}
