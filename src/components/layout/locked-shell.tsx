'use client'

import { signOut } from 'next-auth/react'
import { Lock, LogOut, UserRound, CircleHelp, Crown } from 'lucide-react'
import { useAppStore, type View } from '@/lib/store'
import PlansView from '@/components/plans/plans-view'
import CheckoutView from '@/components/plans/checkout-view'
import ProfileView from '@/components/profile/profile-view'
import HelpView from '@/components/help/help-view'

// T11 · Empresa sem plano (teste grátis vencido ou assinatura encerrada): o painel inteiro fica fechado. O admin vê só
// Planos/Pagamento (e o Perfil e a Ajuda); os demais papéis veem o aviso para falar com o administrador. O servidor
// recusa as outras rotas (402 subscription_locked), então nada aqui depende de esconder botões.
const OPEN_VIEWS = new Set<View>(['plans', 'checkout', 'profile', 'help'])

export function LockedShell() {
  const me = useAppStore((s) => s.me)
  const currentView = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setView)
  const lock = me?.subscriptionLock
  if (!me || !lock) return null
  const admin = me.role === 'admin'
  const view: View = OPEN_VIEWS.has(currentView) ? currentView : admin ? 'plans' : 'profile'
  const trial = lock.reason === 'trial_expired'
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
            <b>{trial ? 'Seu teste grátis terminou' : 'Sua assinatura foi encerrada'}{since ? ` (${since})` : ''}.</b>
            <span>
              {admin
                ? 'O acesso ao painel está suspenso: nada é analisado e nenhum alerta ou relatório é enviado. Seus dados e configurações continuam guardados e as mensagens do WhatsApp seguem chegando. Contrate um plano e tudo volta na hora, como estava.'
                : 'O acesso ao painel está suspenso até o administrador da empresa contratar um plano. Seus dados continuam guardados. Fale com o administrador da sua empresa.'}
            </span>
          </span>
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
