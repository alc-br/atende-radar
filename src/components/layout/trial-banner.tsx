'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'

interface Sub {
  status: string
  trialDaysLeft: number | null
  planName: string
  conversations: { current: number; limit: number } | null
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
      .then((d) =>
        setSub(
          d?.subscription
            ? { status: d.subscription.status, trialDaysLeft: d.subscription.trialDaysLeft, planName: d.subscription.plan?.name ?? 'atual', conversations: d.usage?.conversations ?? null }
            : null
        )
      )
      .catch(() => setSub(null))
  }, [me?.role])

  if (!sub) return null
  const trialing = sub.status === 'trialing'
  const inactive = !['active', 'trialing'].includes(sub.status) || (trialing && (sub.trialDaysLeft ?? 0) <= 0)
  // B8 · cota de conversas do mês: aviso em 80 %, 95 % e 100 %. Limite "suave": as mensagens continuam chegando; o aviso pede a troca de plano.
  const conv = sub.conversations && sub.conversations.limit > 0 ? sub.conversations : null
  const pct = conv ? Math.round((conv.current / conv.limit) * 100) : 0
  const quotaLevel: 'none' | 'warn' | 'critical' | 'exceeded' = !conv ? 'none' : pct >= 100 ? 'exceeded' : pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : 'none'
  if (!trialing && !inactive && quotaLevel === 'none') return null

  const quotaText =
    quotaLevel === 'exceeded'
      ? `Limite do plano ${sub.planName} atingido: ${conv!.current} de ${conv!.limit} conversas neste mês. As mensagens continuam sendo recebidas; peça a troca de plano.`
      : quotaLevel !== 'none'
        ? `Você já usou ${conv!.current} de ${conv!.limit} conversas do plano ${sub.planName} neste mês (${pct}%).`
        : null

  return (
    <div
      data-testid="trial-banner"
      className={`flex flex-col sm:flex-row sm:items-center gap-2 px-4 lg:px-6 py-2 text-sm border-b ${
        inactive || quotaLevel === 'exceeded' ? 'bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
      }`}
    >
      <span className="flex flex-col gap-1 flex-1">
        {(trialing || inactive) && (
          <span className="flex items-center gap-2">
            {inactive ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
            {inactive
              ? 'Seu teste grátis terminou ou a assinatura não está ativa. Peça um plano para continuar cadastrando.'
              : `Teste grátis: ${sub.trialDaysLeft} ${sub.trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}.`}
          </span>
        )}
        {quotaText && (
          <span data-testid="quota-warning" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {quotaText}
          </span>
        )}
      </span>
      <Button size="sm" variant="outline" className="self-start sm:self-auto bg-background" onClick={() => setView('plans')}>
        Ver planos
      </Button>
    </div>
  )
}
