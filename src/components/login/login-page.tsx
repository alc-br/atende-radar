'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useAppStore } from '@/lib/store'
import { SITE_URL, splitHosts } from '@/lib/hosts'
import { TermsCheckbox } from './terms-checkbox'
import { dl, eventId } from '@/lib/datalayer'
import { toast } from 'sonner'
import {
  Mail, Lock, Eye, EyeOff, Loader2, User, Building2, ArrowLeft, ArrowRight, Zap, Coins, CalendarCheck,
  ShieldCheck, KeyRound,
} from 'lucide-react'

type Mode = 'login' | 'signup' | 'forgot'

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return { ok: true, data: await res.json().catch(() => ({})) }
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error || 'Algo deu errado. Tente novamente.' }
  } catch {
    return { ok: false, error: 'Não foi possível conectar ao servidor. Tente novamente.' }
  }
}

/** "locked:15" (erro do authorize em src/lib/auth.ts) → 15; qualquer outro erro → null. */
function lockMinutes(error: string): number | null {
  const m = /^locked:(\d+)$/.exec(error)
  return m ? Number(m[1]) : null
}

// Visual das páginas de conta do pacote de design (entrar, cadastro, recuperar-senha). A raiz `.ar.conta` faz o
// papel do `<body class="conta">` do pacote; o `.conta` interno ativa as regras descendentes (`.ar .conta …`).
export default function LoginPage() {
  const { setShowLanding, setShowLogin, setView } = useAppStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>(useAppStore.getState().authMode)
  // No domínio do app esta tela já aparece antes de a página ler ?modo=cadastro: segue o openAuth que vier depois
  const authMode = useAppStore((s) => s.authMode)
  useEffect(() => setMode(authMode), [authMode])
  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)

  const handleLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      })

      const lockedMinutes = result?.error ? lockMinutes(result.error) : null
      if (lockedMinutes) {
        // conta (ou e-mail) bloqueada por tentativas: o aviso é o mesmo exista o e-mail ou não
        toast.error('Muitas tentativas', {
          description: `Muitas tentativas de entrar. Tente novamente em ${lockedMinutes} ${lockedMinutes === 1 ? 'minuto' : 'minutos'} ou use "Esqueceu sua senha?".`,
        })
      } else if (result?.error) {
        toast.error('Falha na autenticação', {
          description: 'E-mail ou senha inválidos. Tente novamente.',
        })
      } else {
        setShowLanding(false)
        setShowLogin(false)
        setView('dashboard')
        toast.success('Login realizado com sucesso!')
      }
    } catch {
      toast.error('Erro ao conectar', {
        description: 'Não foi possível conectar ao servidor. Tente novamente.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'login') {
      handleLogin(email, password)
      return
    }
    setLoading(true)
    try {
      if (mode === 'signup') {
        const r = await postJson('/api/auth/signup', { name, email, password, organizationName, acceptTerms })
        if (!r.ok) {
          toast.error('Não foi possível criar a conta', { description: r.error })
          return
        }
        // conversão "conta criada" (o servidor manda a mesma, com o mesmo event_id, para a Meta); empresa interna não conta
        const orgId = typeof r.data?.organizationId === 'string' ? r.data.organizationId : null
        if (orgId && r.data?.internal !== true) dl('sign_up', { event_id: eventId('sign_up', orgId), method: 'email' })
        toast.success('Conta criada! Entrando...')
        await handleLogin(email, password)
      } else {
        const r = await postJson('/api/auth/forgot', { email })
        if (!r.ok) {
          toast.error('Não foi possível enviar', { description: r.error })
          return
        }
        setForgotSent(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setForgotSent(false)
    setPassword('')
  }

  const goHome = () => {
    if (splitHosts) {
      window.location.assign(SITE_URL) // a página inicial fica no domínio do site
      return
    }
    setShowLogin(false)
    setShowLanding(true)
  }

  const logo = (big: boolean) => (
    <button
      type="button"
      onClick={goHome}
      className={`conta-logo${big ? ' conta-logo--grande' : ''} border-0 bg-transparent p-0`}
      aria-label="AtendeRadar — página inicial"
    >
      <img src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
    </button>
  )

  const emailField = (big: boolean) => (
    <div className="campo">
      <label htmlFor="login-email">E-mail</label>
      <div className="campo-ic">
        <Mail className="ic" aria-hidden="true" />
        <input
          className={`entrada${big ? ' entrada--grande' : ''}`}
          id="login-email"
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={loading}
        />
      </div>
    </div>
  )

  const passwordField = (big: boolean) => (
    <div className="campo">
      <label htmlFor="login-password">Senha</label>
      <div className="campo-ic">
        <Lock className="ic" aria-hidden="true" />
        <input
          className={`entrada entrada--lado${big ? ' entrada--grande' : ''}`}
          id="login-password"
          type={showPassword ? 'text' : 'password'}
          placeholder={mode === 'signup' ? 'Mínimo de 8 caracteres' : '••••••••'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          aria-describedby={mode === 'signup' ? 'signup-password-hint' : undefined}
          disabled={loading}
        />
        <button
          type="button"
          className="campo-ic__acao"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {showPassword ? <EyeOff className="ic" aria-hidden="true" /> : <Eye className="ic" aria-hidden="true" />}
        </button>
      </div>
      {mode === 'signup' && (
        <p id="signup-password-hint" className="text-xs text-[var(--suave)]">Mínimo de 8 caracteres, com letras e números.</p>
      )}
    </div>
  )

  const spinner = <Loader2 className="ic animate-spin" aria-hidden="true" />
  const year = new Date().getFullYear()

  // ---------- Cadastro (cadastro.html) ----------
  if (mode === 'signup') {
    return (
      <div className="ar conta">
        <div className="conta">
          <div className="conta-envoltorio">
            <header className="conta-topo conta-topo--centro">
              {logo(false)}
              <div className="seguro">
                <span className="seguro__ic"><Lock className="ic" aria-hidden="true" /></span>
                <span><b>Ambiente 100% seguro</b><small>Seus dados estão protegidos</small></span>
              </div>
            </header>

            <main className="conta-cartao cadastro">
              <section className="cadastro__lado" aria-label="Sobre o teste grátis">
                <span className="selo-conta justify-self-start"><Zap className="ic" aria-hidden="true" />Teste grátis por 14 dias</span>
                <div>
                  <h1 className="titulo-conta">Comece seu teste grátis de <span className="verde">14 dias</span></h1>
                  <p className="sub-conta">Crie sua conta e comece a usar o AtendeRadar em minutos. Sem cartão de crédito.</p>
                </div>
                <ul className="beneficios-conta">
                  <li>
                    <span className="ic-bola"><Coins className="ic" aria-hidden="true" /></span>
                    <span><b>Sem cartão de crédito</b><span>Teste todos os recursos por 14 dias sem pagar nada.</span></span>
                  </li>
                  <li>
                    <span className="ic-bola"><Zap className="ic" aria-hidden="true" /></span>
                    <span><b>Ativação imediata</b><span>Crie sua conta e comece a usar agora mesmo.</span></span>
                  </li>
                  <li>
                    <span className="ic-bola"><CalendarCheck className="ic" aria-hidden="true" /></span>
                    <span><b>Sem compromisso</b><span>Ao fim do teste, você decide se quer assinar um plano.</span></span>
                  </li>
                </ul>
                <div className="cartao px-5 py-4">
                  <ul className="linha-tempo">
                    <li className="feito">
                      <span className="lt-ponto" />
                      <span><b>Hoje: acesso liberado</b><span>Sua conta é criada e você já pode usar o AtendeRadar.</span></span>
                    </li>
                    <li>
                      <span className="lt-ponto" />
                      <span><b className="text-[var(--texto)]">Em 14 dias: fim do teste grátis</b><span>Para continuar, escolha um plano na tela Planos.</span></span>
                    </li>
                  </ul>
                </div>
                <div className="nota-segura">
                  <ShieldCheck className="ic" aria-hidden="true" />
                  <span><b>Nenhum dado de pagamento agora.</b>Você só informa um cartão se decidir assinar.</span>
                </div>
              </section>

              <form className="cadastro__form" onSubmit={handleSubmit}>
                <div className="passo-form">
                  <span className="passo-form__num" aria-hidden="true">1</span>
                  <div><h2>Crie sua conta</h2><p>Seus dados para acessar o AtendeRadar.</p></div>
                </div>
                <div className="grade-form grade-form--coluna">
                  <div className="campo">
                    <label htmlFor="signup-name">Nome completo</label>
                    <div className="campo-ic">
                      <User className="ic" aria-hidden="true" />
                      <input className="entrada" id="signup-name" placeholder="Seu nome completo" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" disabled={loading} />
                    </div>
                  </div>
                  {emailField(false)}
                  {passwordField(false)}
                  <div className="campo">
                    <label htmlFor="signup-org">Empresa</label>
                    <div className="campo-ic">
                      <Building2 className="ic" aria-hidden="true" />
                      <input className="entrada" id="signup-org" placeholder="Nome da sua empresa" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required minLength={2} autoComplete="organization" disabled={loading} />
                    </div>
                  </div>
                </div>
                <TermsCheckbox id="signup-terms" checked={acceptTerms} onChange={setAcceptTerms} disabled={loading} />
                <button className="btn btn--verde btn--xl btn--bloco" type="submit" disabled={loading}>
                  {loading ? <>{spinner}Criando conta...</> : <><Lock className="ic" aria-hidden="true" />Iniciar teste grátis <ArrowRight className="ic" aria-hidden="true" /></>}
                </button>
                <p className="nota-rodape">
                  Ao continuar, você cria sua conta e ativa seu período gratuito. Já tem conta?{' '}
                  <button type="button" className="link-verde border-0 bg-transparent p-0" onClick={() => switchMode('login')}>Entrar</button>
                </p>
              </form>
            </main>
          </div>
        </div>
      </div>
    )
  }

  // ---------- Recuperar acesso (recuperar-senha.html) ----------
  if (mode === 'forgot') {
    return (
      <div className="ar conta">
        <div className="conta">
          <main className="acesso">
            {logo(true)}
            <section className="conta-cartao acesso__cartao" aria-labelledby="t-rec">
              <div className="icone-email" aria-hidden="true">
                <Mail className="ic" />
                <span className="mini"><KeyRound className="ic" /></span>
              </div>
              <h1 id="t-rec">Recuperar acesso</h1>
              <p>Informe seu e-mail para receber um link de redefinição.</p>

              <form onSubmit={handleSubmit}>
                {emailField(true)}
                <button className="btn btn--verde btn--xl btn--bloco" type="submit" disabled={loading}>
                  {loading ? <>{spinner}Enviando...</> : <>{forgotSent ? 'Reenviar link' : 'Enviar link de recuperação'} <ArrowRight className="ic" aria-hidden="true" /></>}
                </button>
                {forgotSent && (
                  <div className="confirmacao" role="status">
                    <span className="bola"><ShieldCheck className="ic" aria-hidden="true" /></span>
                    <span>Se este e-mail tiver uma conta, enviamos um link para criar uma nova senha. O link vale por 1 hora. Confira também o spam.</span>
                  </div>
                )}
                <div className="voltar-login">
                  <button type="button" className="inline-flex items-center gap-2.5 border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--verde-600)]" onClick={() => switchMode('login')}>
                    <ArrowLeft className="ic" aria-hidden="true" />Voltar para o login
                  </button>
                </div>
              </form>
            </section>
          </main>
        </div>
      </div>
    )
  }

  // ---------- Entrar (entrar.html) ----------
  return (
    <div className="ar conta">
      <div className="conta">
        <main className="acesso">
          {logo(true)}
          <section className="conta-cartao acesso__cartao" aria-labelledby="t-entrar">
            <h1 id="t-entrar">Bem-vindo de volta</h1>
            <p>Entre na sua conta para acessar o painel.</p>

            <form onSubmit={handleSubmit}>
              {emailField(true)}
              {passwordField(true)}
              <button type="button" className="link-verde esqueceu border-0 bg-transparent p-0" onClick={() => switchMode('forgot')}>
                Esqueceu sua senha?
              </button>
              <button className="btn btn--verde btn--xl btn--bloco" type="submit" disabled={loading}>
                {loading ? <>{spinner}Entrando...</> : <>Entrar <ArrowRight className="ic" aria-hidden="true" /></>}
              </button>
              <div className="divisor-ou">ou</div>
              <p className="convite">
                Ainda não começou?{' '}
                <button type="button" className="link-verde inline-flex items-center gap-1.5 border-0 bg-transparent p-0" onClick={() => switchMode('signup')}>
                  Inicie seu teste grátis <ArrowRight className="ic" aria-hidden="true" />
                </button>
              </p>
            </form>
          </section>

          <footer className="rodape-conta">
            © {year} AtendeRadar. Todos os direitos reservados.
          </footer>
        </main>
      </div>
    </div>
  )
}
