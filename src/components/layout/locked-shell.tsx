'use client'

import { signOut } from 'next-auth/react'
import { Lock, LogOut, UserRound, CircleHelp, Crown } from 'lucide-react'
import { useAppStore, type View } from '@/lib/store'
import PlansView from '@/components/plans/plans-view'
import CheckoutView from '@/components/plans/checkout-view'
import ProfileView from '@/components/profile/profile-view'
import HelpView from '@/components/help/help-view'
import { OrgExportButton } from '@/components/settings/org-export'

// T11 · Empresa sem plano (teste grátis vencido, assinatura encerrada ou pagamento em atraso há mais de 7 dias): o painel
// inteiro fica fechado. O admin vê só Planos/Pagamento (e o Perfil e a Ajuda) e pode exportar todos os dados (JSON);
// os demais papéis veem o aviso para falar com o administrador. O servidor recusa as outras rotas (402
// subscription_locked), então nada aqui depende de esconder botões. 2 dias depois do bloqueio, os números de WhatsApp
// são desconectados (billing/delinquency.ts).
const OPEN_VIEWS = new Set<View>(['plans', 'checkout', 'profile', 'help'])

export function LockedShell() {
  const me = useAppStore((s) => s.me)
  const currentView = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setView)
  const lock = me?.subscriptionLock
  if (!me || !lock) return null
  const admin = me.role === 'admin'
  const view: View = OPEN_VIEWS.has(currentView) ? currentView : admin ? 'plans' : 'profile'
  const title = lock.reason === 'trial_expired'
    ? 'Seu teste grátis terminou'
    : lock.reason === 'payment_overdue'
      ? 'O pagamento da assinatura está em atraso há mais de 7 dias'
      : 'Sua assinatura foi encerrada'
  const since = lock.since ? new Date(lock.since).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às') : null

  const nav = (v: View, label: string, Icon: typeof Crown) => (
    <button
      type="button"
      className={view === v ? 'btn btn--sm btn--primario' : 'btn btn--sm'}
      aria-current={view === v ? 'page' : undefined}
      onClick={() => setView(v)}
    >
      <Icon className="ic" aria-hidden="true" />
      {label}
    </button>
  )

  return (
    <div className="ar min-h-screen bg-[var(--background)]" data-testid="locked-shell" data-reason={lock.reason}>
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:px-7">
        <img className="h-7 w-auto dark:hidden" src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
        <img className="hidden h-7 w-auto dark:block" src="/brand/logo-atenderadar-clara.webp" alt="AtendeRadar" width={560} height={109} />
        {me.organizationName && <span className="suave hidden text-sm sm:inline">{me.organizationName}</span>}
        <nav className="ml-auto flex flex-wrap items-center gap-2" aria-label="Menu">
          {admin && nav('plans', 'Planos', Crown)}
          {nav('profile', 'Meu perfil', UserRound)}
          {nav('help', 'Ajuda', CircleHelp)}
          <button type="button" className="btn btn--sm" onClick={() => void signOut({ redirect: false })}>
            <LogOut className="ic" aria-hidden="true" />
            Sair
          </button>
        </nav>
      </header>

      <div className="px-4 pt-4 sm:px-7">
        <div className="aviso flex-col sm:flex-row sm:items-center border border-[var(--vermelho-borda)] bg-[var(--vermelho-fundo)] text-[var(--vermelho)]" role="alert" data-testid="locked-notice">
          <span className="aviso__ic grid size-7 shrink-0 place-items-center rounded-full bg-[var(--vermelho)] text-white">
            <Lock className="ic" aria-hidden="true" />
          </span>
          <span className="flex flex-1 flex-col gap-1">
            <b>{title}{since ? ` (${since})` : ''}.</b>
            <span data-testid="locked-text">
              {admin
                ? `O acesso ao painel está suspenso: nada é analisado e nenhum alerta ou relatório é enviado. Para proteger a sua privacidade e a da sua empresa, os números de WhatsApp são desconectados automaticamente em até 2 dias depois do bloqueio e as mensagens param de chegar. Seus dados e configurações continuam guardados e você pode exportar tudo agora. ${lock.reason === 'payment_overdue' ? 'Troque o cartão ou contrate um plano' : 'Contrate um plano'} e o painel volta na hora; depois, leia o QR Code de cada número em Conexões para reconectar.`
                : 'O acesso ao painel está suspenso até o administrador da empresa contratar um plano. Para proteger a privacidade da empresa, os números de WhatsApp são desconectados automaticamente em até 2 dias e as mensagens param de chegar. Os dados continuam guardados. Fale com o administrador da sua empresa.'}
            </span>
          </span>
          {admin && <OrgExportButton className="btn btn--sm self-start sm:self-center" />}
        </div>
      </div>

      <main className="conteudo">
        {view === 'plans' && admin && <PlansView />}
        {view === 'checkout' && admin && <CheckoutView />}
        {view === 'profile' && <ProfileView />}
        {view === 'help' && <HelpView />}
      </main>
    </div>
  )
}
