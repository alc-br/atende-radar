'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
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
import NotificationsView from '@/components/notifications/notifications-view'
import LandingPage from '@/components/landing/landing-page'
import LoginPage from '@/components/login/login-page'
import AdminView from '@/components/admin/admin-view'

function MainContent() {
  const { currentView, selectedConversationId, selectedAgentId, sidebarOpen, showLogin, setShowLanding, setShowLogin } = useAppStore()
  const { status } = useSession()

  // O Zustand store e efemero: qualquer refresh da arvore RSC (ex.: apos o
  // signIn) reinicia showLanding para o default (true). Sincroniza com a
  // sessao real do NextAuth para nao devolver um usuario autenticado pra landing.
  useEffect(() => {
    if (status === 'authenticated') {
      setShowLanding(false)
      setShowLogin(false)
    }
  }, [status, setShowLanding, setShowLogin])

  const renderView = () => {
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
      case 'notifications':
        return <NotificationsView />
      case 'admin':
        return <AdminView />
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
    return showLogin ? <LoginPage /> : <LandingPage />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppSidebar />
      <div
        className={cn(
          'flex-1 flex flex-col transition-all duration-300',
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-[68px]'
        )}
      >
        <AppHeader />
        <main className="flex-1 p-4 lg:p-6">
          {renderView()}
        </main>
        <footer className="border-t border-border bg-card/50 backdrop-blur-sm px-4 lg:px-6 py-3 mt-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>© 2025 AtendeRadar. Auditor de Receita e Qualidade no WhatsApp.</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Sistema operacional
              </span>
              <span>v1.0.0 MVP</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default function Home() {
  return <MainContent />
}
