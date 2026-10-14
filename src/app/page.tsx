'use client'

import { useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { TourOverlay } from '@/components/tour/tour-overlay'
import { TOURS } from '@/lib/tours'
import { useAppStore } from '@/lib/store'
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
import { canOpenView } from '@/lib/permissions'
import { TrialBanner } from '@/components/layout/trial-banner'
import { DeletionBanner } from '@/components/layout/deletion-banner'
import { onAppHost } from '@/lib/hosts'

function MainContent() {
  const { currentView, selectedConversationId, selectedAgentId, mobileNavOpen, showLogin, setShowLanding, setShowLogin } = useAppStore()
  const { status } = useSession()
  const seenTours = useAppStore((s) => s.seenTours)
  const toursLoaded = useAppStore((s) => s.toursLoaded)
  const setSeenTours = useAppStore((s) => s.setSeenTours)
  const startTour = useAppStore((s) => s.startTour)
  const activeTour = useAppStore((s) => s.activeTour)
  const me = useAppStore((s) => s.me)
  const setMe = useAppStore((s) => s.setMe)
  const openAuth = useAppStore((s) => s.openAuth)

  // Links vindos do site (outro domínio) e do /login: ?modo=cadastro|entrar abre a tela certa; ?demo=1 entra na demonstração
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const modo = q.get('modo')
    const demo = q.get('demo') === '1'
    if (!modo && !demo) return
    window.history.replaceState(null, '', '/')
    if (demo) {
      openAuth('login')
      void signIn('credentials', { email: 'demo@atenderadar.com', password: 'demo123', redirect: false })
    } else {
      openAuth(modo === 'cadastro' ? 'signup' : 'login')
    }
  }, [openAuth])

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
  useEffect(() => {
    if (status !== 'authenticated') {
      setMe(null)
      return
    }
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d ? { ...d.member, isPlatformOperator: d.isPlatformOperator, organizationName: d.organizationName, organizationDeletion: d.organizationDeletion ?? null } : null))
      .catch(() => setMe(null))
  }, [status, setMe])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/tours')
      .then((r) => (r.ok ? r.json() : { seen: [] }))
      .then((d) => setSeenTours(d.seen || []))
      .catch(() => setSeenTours([]))
  }, [status, setSeenTours])

  useEffect(() => {
    if (!toursLoaded || activeTour || !me) return // espera saber o papel para mostrar o tour certo
    if (!seenTours.includes('welcome')) {
      const id = window.setTimeout(() => startTour('welcome'), 600)
      return () => window.clearTimeout(id)
    }
    if (TOURS[currentView] && !seenTours.includes(currentView)) {
      const id = window.setTimeout(() => startTour(currentView), 600)
      return () => window.clearTimeout(id)
    }
  }, [toursLoaded, seenTours, currentView, activeTour, startTour, me])

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

  // Mesma estrutura do pacote de design (painel/app.js): menu lateral fixo, véu do celular e coluna principal
  return (
    <div className={cn('ar app', mobileNavOpen && 'menu-aberto')}>
      <TourOverlay />
      <AppSidebar />
      <div className="principal">
        <AppHeader />
        <DeletionBanner />
        <TrialBanner />
        <main className="conteudo">{renderView()}</main>
        <footer className="rodape-app">
          <span>© {new Date().getFullYear()} AtendeRadar. Auditor de Receita e Qualidade no WhatsApp.</span>
          <span className="rodape-app__status">
            <span><i />Sistema operacional</span>
            <span>v1.0.0 MVP</span>
          </span>
        </footer>
      </div>
    </div>
  )
}

export default function Home() {
  return <MainContent />
}
