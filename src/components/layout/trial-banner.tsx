'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
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
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
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
  }, [me?.role, refreshTrigger])

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
      ? `Limite do plano ${sub.planName} atingido: ${conv!.current} de ${conv!.limit} conversas neste mês. As mensagens continuam sendo recebidas; troque de plano em Planos.`
      : quotaLevel !== 'none'
        ? `Você já usou ${conv!.current} de ${conv!.limit} conversas do plano ${sub.planName} neste mês (${pct}%).`
        : null

  const danger = inactive || quotaLevel === 'exceeded'
  // Mesmo componente "aviso" do pacote de design (painel/configuracoes.html); vermelho quando bloqueia
  return (
    <div className="px-4 pt-4 sm:px-7">
      <div
        data-testid="trial-banner"
        className={
          danger
            ? 'aviso flex-col sm:flex-row sm:items-center border border-[var(--vermelho-borda)] bg-[var(--vermelho-fundo)] text-[var(--vermelho)]'
            : 'aviso aviso--ambar flex-col sm:flex-row sm:items-center'
        }
      >
        <span className={danger ? 'aviso__ic grid size-7 shrink-0 place-items-center rounded-full bg-[var(--vermelho)] text-white' : 'aviso__ic'}>
          {inactive || quotaLevel !== 'none' ? <AlertTriangle className="ic" aria-hidden="true" /> : <Clock className="ic" aria-hidden="true" />}
        </span>
        <span className="flex flex-1 flex-col gap-1">
          {(trialing || inactive) && (
            <span>
              {inactive
                ? 'Seu teste grátis terminou ou a assinatura não está ativa. Contrate um plano para continuar cadastrando.'
                : <>Teste grátis: <b>{sub.trialDaysLeft} {sub.trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}</b>.</>}
            </span>
          )}
          {quotaText && <span data-testid="quota-warning">{quotaText}</span>}
        </span>
        <button type="button" className="btn btn--sm self-start sm:self-auto" onClick={() => setView('plans')}>
          Ver planos
        </button>
      </div>
    </div>
  )
}
