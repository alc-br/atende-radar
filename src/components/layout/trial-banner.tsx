'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface Sub {
  status: string
  trialDaysLeft: number | null
  trialEnd: string | null
  planName: string
  conversations: { current: number; limit: number } | null
  unanalyzed: number
  paused: boolean
  graceEndsAt: string | null
}

const TZ = 'America/Sao_Paulo'
const dayKey = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ })

/** Último dia do teste: "em 8 minutos (às 14:30)", "hoje às 14:30" ou "amanhã às 09:00" (horário de Brasília). */
export function trialEndsText(end: Date, now: Date): string {
  const ms = end.getTime() - now.getTime()
  const time = end.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  if (ms < 3600_000) {
    const min = Math.max(1, Math.ceil(ms / 60_000))
    return `em ${min} ${min === 1 ? 'minuto' : 'minutos'} (às ${time})`
  }
  if (dayKey(end) === dayKey(now)) return `hoje às ${time}`
  if (dayKey(end) === dayKey(new Date(now.getTime() + 86400_000))) return `amanhã às ${time}`
  return `em ${end.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' })} às ${time}`
}

// Faixa sobre o conteúdo: mostra quanto falta do teste grátis (ou que a assinatura não está ativa). Só para quem administra a assinatura.
export function TrialBanner() {
  const setView = useAppStore((s) => s.setView)
  const me = useAppStore((s) => s.me)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  const [sub, setSub] = useState<Sub | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (me?.role !== 'admin') return
    fetch('/api/subscription')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setSub(
          d?.subscription
            ? { status: d.subscription.status, trialDaysLeft: d.subscription.trialDaysLeft, trialEnd: d.subscription.trialEnd ?? null, planName: d.subscription.plan?.name ?? 'atual', conversations: d.usage?.conversations ?? null, unanalyzed: d.analysis?.unanalyzed ?? 0, paused: !!d.analysis?.paused, graceEndsAt: d.subscription.graceEndsAt ?? null }
            : null
        )
      )
      .catch(() => setSub(null))
  }, [me?.role, refreshTrigger])

  // no último dia o texto conta os minutos; quando o teste acaba com a tela aberta, recarrega (o painel fica bloqueado
  // e só Planos responde)
  const endMs = sub?.status === 'trialing' && sub.trialEnd ? new Date(sub.trialEnd).getTime() : null
  useEffect(() => {
    if (endMs === null) return
    const left = endMs - Date.now()
    if (left > 86400_000 || left <= 0) return
    const tick = window.setInterval(() => setNow(new Date()), 30_000)
    const reload = window.setTimeout(() => window.location.reload(), left + 1500)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(reload)
    }
  }, [endMs])

  if (!sub) return null
  const trialing = sub.status === 'trialing'
  // inadimplência dentro dos 7 dias de tolerância: tudo funciona; a faixa pede a troca do cartão e mostra o prazo
  const pastDue = sub.status === 'past_due'
  const graceEnd = pastDue && sub.graceEndsAt ? new Date(sub.graceEndsAt) : null
  const inactive = !['active', 'trialing', 'past_due'].includes(sub.status) || (trialing && (sub.trialDaysLeft ?? 0) <= 0)
  // B8 · cota de conversas do mês: aviso em 80 %, 95 % e 100 %. Limite "suave": as mensagens continuam chegando; o aviso pede a troca de plano.
  const conv = sub.conversations && sub.conversations.limit > 0 ? sub.conversations : null
  const pct = conv ? Math.round((conv.current / conv.limit) * 100) : 0
  const quotaLevel: 'none' | 'warn' | 'critical' | 'exceeded' = !conv ? 'none' : pct >= 100 ? 'exceeded' : pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : 'none'
  if (!trialing && !inactive && !pastDue && quotaLevel === 'none') return null

  const quotaText =
    quotaLevel === 'exceeded'
      ? `Limite do plano ${sub.planName} atingido: ${conv!.current} de ${conv!.limit} conversas neste mês. As mensagens continuam sendo recebidas, mas as conversas novas acima do limite não são analisadas${sub.unanalyzed > 0 ? ` (${sub.unanalyzed} sem análise)` : ''}; troque de plano em Planos.`
      : quotaLevel !== 'none'
        ? `Você já usou ${conv!.current} de ${conv!.limit} conversas do plano ${sub.planName} neste mês (${pct}%).`
        : null

  // T11 · reta final do teste: 3 dias ou menos (âmbar reforçado) e o último dia (vermelho)
  const daysLeft = sub.trialDaysLeft ?? 0
  const ending = trialing && !inactive && daysLeft <= 3
  const lastDay = ending && (endMs !== null ? endMs - now.getTime() <= 86400_000 : daysLeft <= 1)
  const graceLastDay = !!graceEnd && graceEnd.getTime() - now.getTime() <= 86400_000
  const danger = inactive || quotaLevel === 'exceeded' || lastDay || graceLastDay
  // Mesmo componente "aviso" do pacote de design (painel/configuracoes.html); vermelho quando bloqueia
  return (
    <div className="px-4 pt-4 sm:px-7">
      <div
        data-testid="trial-banner"
        data-state={inactive ? 'inactive' : pastDue ? 'past-due' : lastDay ? 'last-day' : ending ? 'ending' : trialing ? 'trial' : 'quota'}
        className={
          danger
            ? 'aviso flex-col sm:flex-row sm:items-center border border-[var(--vermelho-borda)] bg-[var(--vermelho-fundo)] text-[var(--vermelho)]'
            : 'aviso aviso--ambar flex-col sm:flex-row sm:items-center'
        }
      >
        <span className={danger ? 'aviso__ic grid size-7 shrink-0 place-items-center rounded-full bg-[var(--vermelho)] text-white' : 'aviso__ic'}>
          {inactive || pastDue || ending || quotaLevel !== 'none' ? <AlertTriangle className="ic" aria-hidden="true" /> : <Clock className="ic" aria-hidden="true" />}
        </span>
        <span className="flex flex-1 flex-col gap-1">
          {pastDue && !inactive && (
            <span data-testid="past-due-warning">
              <b>O pagamento da renovação do plano {sub.planName} não foi confirmado.</b>{' '}
              {graceEnd
                ? <>Tudo continua funcionando até <b data-testid="grace-ends">{graceEnd.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')}</b>. </>
                : 'Tudo continua funcionando por enquanto. '}
              Troque o cartão em Planos: a fatura em aberto é cobrada na hora no cartão novo. Sem o pagamento, o painel é bloqueado no fim do prazo.
            </span>
          )}
          {(trialing || inactive) && (
            <span>
              {inactive
                ? sub.paused
                  ? <span data-testid="analysis-paused">Seu teste grátis terminou ou a assinatura não está ativa. A análise das conversas está pausada e, para proteger a sua privacidade, os números de WhatsApp são desconectados em até 2 dias. Contrate um plano para retomar.</span>
                  : 'Seu teste grátis terminou ou a assinatura não está ativa. Contrate um plano para continuar usando o AtendeRadar.'
                : ending
                  ? <>Seu teste grátis termina <b data-testid="trial-days-left">{lastDay ? (endMs !== null ? trialEndsText(new Date(endMs), now) : 'hoje') : `em ${daysLeft} dias`}</b>. Contrate um plano para não perder o acesso.</>
                  : <>Teste grátis: <b data-testid="trial-days-left">{sub.trialDaysLeft} {sub.trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}</b>.</>}
            </span>
          )}
          {quotaText && <span data-testid="quota-warning">{quotaText}</span>}
        </span>
        <button type="button" className="btn btn--sm self-start sm:self-auto" onClick={() => setView('plans')}>
          {pastDue && !inactive ? 'Trocar cartão' : 'Ver planos'}
        </button>
      </div>
    </div>
  )
}
