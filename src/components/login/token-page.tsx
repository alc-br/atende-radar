'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Shield, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

type Kind = 'reset' | 'invite' | 'verify'

const COPY: Record<Kind, { title: string; subtitle: string; endpoint: string; button: string; done: string; needsPassword: boolean }> = {
  reset: {
    title: 'Criar nova senha',
    subtitle: 'Escolha uma senha nova para a sua conta.',
    endpoint: '/api/auth/reset',
    button: 'Salvar nova senha',
    done: 'Senha alterada! Já pode entrar com a senha nova.',
    needsPassword: true,
  },
  invite: {
    title: 'Aceitar convite',
    subtitle: 'Crie a sua senha para entrar no AtendeRadar.',
    endpoint: '/api/auth/accept-invite',
    button: 'Criar senha e entrar',
    done: 'Tudo certo! Sua conta está ativa. Já pode entrar.',
    needsPassword: true,
  },
  verify: {
    title: 'Confirmando o seu e-mail',
    subtitle: 'Só um instante...',
    endpoint: '/api/auth/verify-email',
    button: '',
    done: 'E-mail confirmado! Obrigado.',
    needsPassword: false,
  },
}

function Inner({ kind }: { kind: Kind }) {
  const copy = COPY[kind]
  const token = useSearchParams().get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>(copy.needsPassword ? 'idle' : 'loading')
  const [error, setError] = useState('')

  const submit = async (body: Record<string, string>) => {
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
    submit({ token, password })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-700 flex items-center justify-center mb-4 shadow-lg shadow-emerald-600/25">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Atende<span className="text-emerald-700 dark:text-emerald-400">Radar</span>
          </h1>
        </div>
        <Card className="shadow-lg border-border/50">
          <CardHeader className="text-center pb-2">
            <h2 className="text-xl font-semibold text-foreground">{copy.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{copy.subtitle}</p>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {!token && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> Link incompleto. Abra o link do e-mail novamente.
              </p>
            )}

            {token && state === 'done' && (
              <p role="status" className="flex items-start gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {copy.done}
              </p>
            )}

            {token && state === 'error' && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </p>
            )}

            {token && copy.needsPassword && state !== 'done' && (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" disabled={state === 'loading'} className="h-11" />
                  <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres, com letras e números.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Repita a senha</Label>
                  <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" disabled={state === 'loading'} className="h-11" />
                </div>
                <Button type="submit" disabled={state === 'loading'} className="w-full h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold">
                  {state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : copy.button}
                </Button>
              </form>
            )}

            {token && !copy.needsPassword && state === 'loading' && (
              <div className="flex justify-center py-2"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            )}

            <p className="text-center text-sm">
              <Link href="/" className="text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 font-medium">
                Ir para o AtendeRadar
              </Link>
            </p>
          </CardContent>
        </Card>
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
