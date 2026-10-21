'use client'

import { useCallback, useEffect, useRef } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { TourOverlay } from '@/components/tour/tour-overlay'
import { TOURS } from '@/lib/tours'
import { useAppStore, type View } from '@/lib/store'
import { cn } from '@/lib/utils'
import DashboardView from '@/components/dashboard/dashboard-view'
import AlertsView from '@/components/alerts/alerts-view'
import ConversationsView from '@/components/conversations/conversations-view'
import ConversationDetail from '@/components/conversations/conversation-detail'
import RecoveryView from '@/components/recovery/recovery-view'
import TeamView from '@/components/team/team-view'
import AgentProfile from '@/components/team/agent-profile'
import ReportsView from '@/components/reports/reports-view'
import ConnectionsView from '@/components/connections/connections-view'
import SettingsView from '@/components/settings/settings-view'
import OnboardingView from '@/components/onboarding/onboarding-view'
import MembersView from '@/components/members/members-view'
import TeamsView from '@/components/teams/teams-view'
import PlansView from '@/components/plans/plans-view'
import CheckoutView from '@/components/plans/checkout-view'
import NotificationsView from '@/components/notifications/notifications-view'
import LandingPage from '@/components/landing/landing-page'
import LoginPage from '@/components/login/login-page'
import AdminView from '@/components/admin/admin-view'
import ProfileView from '@/components/profile/profile-view'
import HelpView from '@/components/help/help-view'
import SystemTourView from '@/components/system-tour/system-tour-view'
import { SystemTourPanel } from '@/components/system-tour/system-tour-panel'
import { APP_VERSION } from '@/lib/app-version'
import { canOpenView } from '@/lib/permissions'
import { TrialBanner } from '@/components/layout/trial-banner'
import { DeletionBanner } from '@/components/layout/deletion-banner'
import { EmailVerifyBanner } from '@/components/layout/email-verify-banner'
import { LockedShell } from '@/components/layout/locked-shell'
import { onAppHost } from '@/lib/hosts'

// Telas sem guia automático na primeira visita (o guia continua em "Tour desta tela"). A Visão Geral é a tela de entrada:
// o guia dela abrindo sozinho logo depois do boas-vindas era tour demais.
const NO_AUTO_TOUR = new Set(['dashboard', 'plans', 'checkout'])
// Telas que abrem com a empresa bloqueada (sem plano) e telas que um link (#tela) pode abrir.
const LOCK_OPEN_VIEWS = new Set<string>(['plans', 'checkout', 'profile', 'help'])
const HASH_VIEWS = new Set<View>(['dashboard', 'alerts', 'conversations', 'recovery', 'team', 'reports', 'connections', 'settings', 'members', 'teams', 'plans', 'notifications', 'profile', 'help', 'system-tour', 'admin'])

function MainContent() {
  const { currentView, selectedConversationId, selectedAgentId, mobileNavOpen, showLogin, setShowLanding, setShowLogin } = useAppStore()
  const { status } = useSession()
  const seenTours = useAppStore((s) => s.seenTours)
  const toursLoaded = useAppStore((s) => s.toursLoaded)
  const setSeenTours = useAppStore((s) => s.setSeenTours)
  const startTour = useAppStore((s) => s.startTour)
  const activeTour = useAppStore((s) => s.activeTour)
  const systemTourOpen = useAppStore((s) => s.systemTour !== null || s.currentView === 'system-tour')
  const me = useAppStore((s) => s.me)
  const setMe = useAppStore((s) => s.setMe)
  const openAuth = useAppStore((s) => s.openAuth)

  // Links vindos do site (outro domínio) e do /login: ?modo=cadastro|entrar abre a tela certa. "Começar teste grátis"
  // (?modo=cadastro) com alguém já logado neste navegador sai da conta antes: o cadastro é sempre de uma conta nova.
  const pendingModo = useRef<string | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const modo = q.get('modo')
    if (!modo && !q.has('demo')) return
    window.history.replaceState(null, '', '/')
    pendingModo.current = modo
  }, [])
  useEffect(() => {
    if (status === 'loading' || !pendingModo.current) return
    const modo = pendingModo.current
    pendingModo.current = null
    if (modo === 'cadastro' && status === 'authenticated') {
      void signOut({ redirect: false }).then(() => openAuth('signup'))
      return
    }
    if (status !== 'authenticated') openAuth(modo === 'cadastro' ? 'signup' : 'login')
  }, [status, openAuth])

  // O Zustand store e efemero: qualquer refresh da arvore RSC (ex.: apos o
  // signIn) reinicia showLanding para o default (true). Sincroniza com a
  // sessao real do NextAuth para nao devolver um usuario autenticado pra landing.
  useEffect(() => {
    if (status === 'authenticated') {
      setShowLanding(false)
      setShowLogin(false)
    }
  }, [status, setShowLanding, setShowLogin])

  // Papel real (vem do banco) para montar o menu e bloquear telas que o papel não pode abrir.
  const loadMe = useCallback(() => {
    fetch('/api/me')
      .then((r) => {
        // sessão que o servidor não aceita mais (conta removida, senha trocada): sai em vez de mostrar um painel vazio
        if (r.status === 401) void signOut({ redirect: false })
        return r.ok ? r.json() : null
      })
      .then((d) => setMe(d ? { ...d.member, isPlatformOperator: d.isPlatformOperator, organizationName: d.organizationName, organizationLogoUrl: d.organizationLogoUrl ?? null, organizationDeletion: d.organizationDeletion ?? null, subscriptionLock: d.subscriptionLock ?? null } : null))
      .catch(() => setMe(null))
  }, [setMe])
  useEffect(() => {
    if (status !== 'authenticated') {
      setMe(null)
      return
    }
    loadMe()
  }, [status, setMe, loadMe])

  // Empresa bloqueada (sem plano): ao sair de Planos/Pagamento (ex.: "Ir para o painel" depois de pagar) confere de novo
  // no servidor; com o plano ativo, o painel completo volta sem recarregar a página.
  const locked = !!me?.subscriptionLock
  useEffect(() => {
    if (locked && !LOCK_OPEN_VIEWS.has(currentView)) loadMe()
  }, [locked, currentView, loadMe])

  // Links dos e-mails (ex.: https://app.atenderadar.com.br/#plans): abre a tela do endereço depois de entrar.
  const setView = useAppStore((s) => s.setView)
  useEffect(() => {
    if (status !== 'authenticated') return
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash || !HASH_VIEWS.has(hash as View)) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setView(hash as View)
  }, [status, setView])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/tours')
      .then((r) => (r.ok ? r.json() : { seen: [] }))
      .then((d) => setSeenTours(d.seen || []))
      .catch(() => setSeenTours([]))
  }, [status, setSeenTours])

  // Tela onde o boas-vindas apareceu nesta visita: o guia dessa tela não abre logo em seguida (um tour emendado no
  // outro); abre na primeira visita às outras telas. Planos não tem guia automático (fica em "Guia desta tela").
  const welcomeView = useRef<string | null>(null)
  useEffect(() => {
    if (!toursLoaded || activeTour || !me) return // espera saber o papel para mostrar o tour certo
    if (me.subscriptionLock) return // empresa bloqueada: só Planos, sem guias
    if (systemTourOpen) return // com o Tour pelo sistema aberto, os guias rápidos não abrem por cima
    if (!seenTours.includes('welcome')) {
      const id = window.setTimeout(() => {
        welcomeView.current = currentView
        startTour('welcome')
      }, 600)
      return () => window.clearTimeout(id)
    }
    if (currentView === welcomeView.current || NO_AUTO_TOUR.has(currentView)) return
    if (TOURS[currentView] && !seenTours.includes(currentView)) {
      const id = window.setTimeout(() => startTour(currentView), 600)
      return () => window.clearTimeout(id)
    }
  }, [toursLoaded, seenTours, currentView, activeTour, startTour, me, systemTourOpen])

  // I7 · uso por tela: avisa o servidor da tela onde o usuário PAROU (1,5 s sem trocar). Só o nome da tela, sem dado
  // pessoal; falha é ignorada (medir nunca atrapalha o uso). A demonstração fica fora dos números do Admin.
  useEffect(() => {
    if (status !== 'authenticated' || currentView === 'landing' || currentView === 'login') return
    const id = window.setTimeout(() => {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'screen_view', view: currentView }),
        keepalive: true,
      }).catch(() => {})
    }, 1500)
    return () => window.clearTimeout(id)
  }, [status, currentView])

  const renderView = () => {
    // Tela que o papel não pode abrir (ex.: link antigo / estado persistido) volta para a Visão Geral.
    const allowed = currentView === 'admin' ? !!me?.isPlatformOperator : !me || canOpenView(me.role, currentView)
    if (!allowed) return <DashboardView />
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />
      case 'alerts':
        return <AlertsView />
      case 'conversations':
        return <ConversationsView />
      case 'conversation-detail':
        return selectedConversationId ? <ConversationDetail /> : <ConversationsView />
      case 'recovery':
        return <RecoveryView />
      case 'team':
        return <TeamView />
      case 'agent-profile':
        return selectedAgentId ? <AgentProfile /> : <TeamView />
      case 'reports':
        return <ReportsView />
      case 'connections':
        return <ConnectionsView />
      case 'settings':
        return <SettingsView />
      case 'onboarding':
        return <OnboardingView />
      case 'members':
        return <MembersView />
      case 'teams':
        return <TeamsView />
      case 'plans':
        return <PlansView />
      case 'checkout':
        return <CheckoutView />
      case 'notifications':
        return <NotificationsView />
      case 'admin':
        return <AdminView />
      case 'profile':
        return <ProfileView />
      case 'help':
        return <HelpView />
      case 'system-tour':
        return <SystemTourView />
      case 'landing':
        return <LandingPage />
      case 'login':
        return <LoginPage />
      default:
        return <DashboardView />
    }
  }

  if (status === 'loading') {
    return null
  }

  // Sem sessao valida, nunca renderiza o shell autenticado — so landing ou login.
  if (status !== 'authenticated') {
    // No domínio do app não existe página de vendas: quem não entrou vê a tela de entrar
    return showLogin || onAppHost() ? <LoginPage /> : <LandingPage />
  }

  // Sem plano (teste vencido ou assinatura encerrada): só Planos/Pagamento/Perfil/Ajuda, sem o painel
  if (me?.subscriptionLock) return <LockedShell />

  // Mesma estrutura do pacote de design (painel/app.js): menu lateral fixo, véu do celular e coluna principal
  return (
    <div className={cn('ar app', mobileNavOpen && 'menu-aberto')}>
      <TourOverlay />
      <SystemTourPanel />
      <AppSidebar />
      <div className="principal">
        <AppHeader />
        <DeletionBanner />
        <EmailVerifyBanner />
        <TrialBanner />
        <main className="conteudo">{renderView()}</main>
        <footer className="rodape-app">
          <span>© {new Date().getFullYear()} AtendeRadar. Auditor de Receita e Qualidade no WhatsApp.</span>
          <span className="rodape-app__status">
            <span><i />Sistema operacional</span>
            <span>v{APP_VERSION}</span>
          </span>
        </footer>
      </div>
    </div>
  )
}

export default function Home() {
  return <MainContent />
}
