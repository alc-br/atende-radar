'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Shield, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const { setShowLanding, setShowLogin, setView } = useAppStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleLogin(email, password)
  }

  const handleDemoLogin = () => {
    setEmail('demo@atenderadar.com')
    setPassword('demo123')
    handleLogin('demo@atenderadar.com', 'demo123')
  }

  const handleForgotPassword = () => {
    toast.info('Funcionalidade em desenvolvimento', {
      description: 'A recuperação de senha estará disponível em breve.',
    })
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
            <h2 className="text-xl font-semibold text-foreground">Bem-vindo de volta</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Entre na sua conta para acessar o painel
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    autoComplete="current-password"
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

              {/* Forgot password link */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors"
                >
                  Esqueceu sua senha?
                </button>
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-600/20"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>

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

            {/* Footer inside card */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              Não tem uma conta?{' '}
              <button
                type="button"
                onClick={() => {
                  setShowLanding(true)
                }}
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors"
              >
                Comece grátis
              </button>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2025 AtendeRadar · Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
