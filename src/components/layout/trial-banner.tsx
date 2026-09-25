'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'

interface Sub {
  status: string
  trialDaysLeft: number | null
}

// Faixa sobre o conteúdo: mostra quanto falta do teste grátis (ou que a assinatura não está ativa). Só para quem administra a assinatura.
export function TrialBanner() {
  const setView = useAppStore((s) => s.setView)
  const me = useAppStore((s) => s.me)
  const [sub, setSub] = useState<Sub | null>(null)

  useEffect(() => {
    if (me?.role !== 'admin') return
    fetch('/api/subscription')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSub(d?.subscription ? { status: d.subscription.status, trialDaysLeft: d.subscription.trialDaysLeft } : null))
      .catch(() => setSub(null))
  }, [me?.role])

  if (!sub) return null
  const trialing = sub.status === 'trialing'
  const inactive = !['active', 'trialing'].includes(sub.status) || (trialing && (sub.trialDaysLeft ?? 0) <= 0)
  if (!trialing && !inactive) return null

  return (
    <div
      data-testid="trial-banner"
      className={`flex flex-col sm:flex-row sm:items-center gap-2 px-4 lg:px-6 py-2 text-sm border-b ${
        inactive ? 'bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
      }`}
    >
      <span className="flex items-center gap-2 flex-1">
        {inactive ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
        {inactive
          ? 'Seu teste grátis terminou ou a assinatura não está ativa. Peça um plano para continuar cadastrando.'
          : `Teste grátis: ${sub.trialDaysLeft} ${sub.trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}.`}
      </span>
      <Button size="sm" variant="outline" className="self-start sm:self-auto bg-background" onClick={() => setView('plans')}>
        Ver planos
      </Button>
    </div>
  )
}
