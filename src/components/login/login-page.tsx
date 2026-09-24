'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, User, Building2, ArrowLeft } from 'lucide-react'

type Mode = 'login' | 'signup' | 'forgot'

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error || 'Algo deu errado. Tente novamente.' }
  } catch {
    return { ok: false, error: 'Não foi possível conectar ao servidor. Tente novamente.' }
  }
}

export default function LoginPage() {
  const { setShowLanding, setShowLogin, setView } = useAppStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>(useAppStore.getState().authMode)
  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  const handleLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      })

      if (result?.error) {
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
        const r = await postJson('/api/auth/signup', { name, email, password, organizationName })
        if (!r.ok) {
          toast.error('Não foi possível criar a conta', { description: r.error })
          return
        }
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

  const handleDemoLogin = () => {
    setEmail('demo@atenderadar.com')
    setPassword('demo123')
    handleLogin('demo@atenderadar.com', 'demo123')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-background to-teal-50 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/20" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-400/5 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-600/25">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Atende<span className="text-emerald-600">Radar</span>
          </h1>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg border-border/50">
          <CardHeader className="text-center pb-2">
            <h2 className="text-xl font-semibold text-foreground">
              {mode === 'login' ? 'Bem-vindo de volta' : mode === 'signup' ? 'Crie a sua conta' : 'Recuperar senha'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === 'login'
                ? 'Entre na sua conta para acessar o painel'
                : mode === 'signup'
                  ? 'Teste grátis por 14 dias. Sem cartão de crédito.'
                  : 'Enviaremos um link para você criar uma nova senha'}
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Seu nome</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" disabled={loading} className="h-11 pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-org">Nome da empresa</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="signup-org" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required minLength={2} autoComplete="organization" disabled={loading} className="h-11 pl-10" />
                    </div>
                  </div>
                </>
              )}
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="login-email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              {/* Password */}
              {mode !== 'forgot' && (
              <div className="space-y-2">
                <Label htmlFor="login-password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    disabled={loading}
                    className="h-11 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              )}

              {mode === 'signup' && (
                <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres, com letras e números.</p>
              )}

              {/* Forgot password link */}
              {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors"
                >
                  Esqueceu sua senha?
                </button>
              </div>
              )}

              {mode === 'forgot' && forgotSent && (
                <p role="status" className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                  Se este e-mail tiver uma conta, enviamos um link para criar uma nova senha. O link vale por 1 hora.
                </p>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-600/20"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {mode === 'login' ? 'Entrando...' : mode === 'signup' ? 'Criando conta...' : 'Enviando...'}
                  </>
                ) : mode === 'login' ? (
                  'Entrar'
                ) : mode === 'signup' ? (
                  'Criar conta grátis'
                ) : (
                  'Enviar link de recuperação'
                )}
              </Button>
            </form>

            {mode === 'login' && (<>
            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            {/* Demo login button */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-dashed"
              onClick={handleDemoLogin}
              disabled={loading}
            >
              <Shield className="w-4 h-4 mr-2 text-emerald-600" />
              Entrar como demonstração
            </Button>
            </>)}

            {/* Footer inside card */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              {mode === 'login' ? (
                <>
                  Não tem uma conta?{' '}
                  <button type="button" onClick={() => switchMode('signup')} className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors">
                    Criar conta grátis
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => switchMode('login')} className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o login
                </button>
              )}
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 AtendeRadar · Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
