'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import {
  LayoutGrid, TriangleAlert, MessageSquare, RotateCcw, Users,
  FileChartColumn, Wifi, Settings, UserRound, Building2, CreditCard, ShieldCheck,
  ArrowRight, CircleHelp, Lightbulb, GraduationCap,
} from 'lucide-react'
import type { View } from '@/lib/store'
import { canOpenView } from '@/lib/permissions'

type NavItem = { view: View; icon: React.ElementType; label: string }

// Mesma ordem e ícones do pacote de design (painel/app.js → NAV e ADMIN)
const mainNavItems: NavItem[] = [
  { view: 'dashboard', icon: LayoutGrid, label: 'Visão Geral' },
  { view: 'alerts', icon: TriangleAlert, label: 'Alertas' },
  { view: 'conversations', icon: MessageSquare, label: 'Conversas' },
  { view: 'recovery', icon: RotateCcw, label: 'Recuperação' },
  { view: 'team', icon: Users, label: 'Equipe' },
  { view: 'reports', icon: FileChartColumn, label: 'Relatórios' },
  { view: 'connections', icon: Wifi, label: 'Conexões' },
]

const adminNavItems: NavItem[] = [
  { view: 'settings', icon: Settings, label: 'Configurações' },
  { view: 'members', icon: UserRound, label: 'Membros' },
  { view: 'teams', icon: Building2, label: 'Equipes' },
  { view: 'plans', icon: CreditCard, label: 'Planos' },
  { view: 'admin', icon: ShieldCheck, label: 'Admin' },
]

export function AppSidebar() {
  const { currentView, setView, refreshTrigger, setMobileNavOpen, openHelp, openSystemTour } = useAppStore()
  const me = useAppStore((st) => st.me)
  // Só mostra o que o papel pode abrir. Enquanto /api/me carrega, não mostra nada restrito.
  const visible = (item: { view: View }) =>
    item.view === 'admin' ? !!me?.isPlatformOperator : !!me && canOpenView(me.role, item.view)
  const [badges, setBadges] = useState<Partial<Record<View, string>>>({})

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/alerts?status=new&limit=1').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/recovery?status=new&limit=1').then((r) => (r.ok ? r.json() : null)),
    ]).then(([alertsData, recoveryData]) => {
      if (cancelled) return
      const next: Partial<Record<View, string>> = {}
      const activeAlerts = alertsData?.counts?.new
      if (activeAlerts > 0) next.alerts = String(activeAlerts)
      const openRecovery = recoveryData?.pagination?.total
      if (openRecovery > 0) next.recovery = String(openRecovery)
      setBadges(next)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [refreshTrigger])

  const isActive = (view: View) =>
    currentView === view ||
    (view === 'conversations' && currentView === 'conversation-detail') ||
    (view === 'team' && currentView === 'agent-profile') ||
    (view === 'plans' && currentView === 'checkout')

  const go = (view: View) => {
    setView(view)
    setMobileNavOpen(false) // no celular a gaveta fecha ao escolher uma tela
  }

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon
    const badge = badges[item.view]
    return (
      <a
        key={item.view}
        href={`#${item.view}`}
        data-tour={`nav-${item.view}`}
        aria-current={isActive(item.view) ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault()
          go(item.view)
        }}
      >
        <Icon className="ic" aria-hidden="true" />
        <span>{item.label}</span>
        {badge && <span className="contador" aria-label={`${badge} pendentes`}>{badge}</span>}
      </a>
    )
  }

  const admin = adminNavItems.filter(visible)
  const canSeeReports = !!me && canOpenView(me.role, 'reports')

  return (
    <>
      <aside className="lateral" id="lateral" aria-label="Menu principal" data-tour="sidebar">
        <a
          className="lateral__marca"
          href="#dashboard"
          aria-label="AtendeRadar — Visão Geral"
          onClick={(e) => {
            e.preventDefault()
            go('dashboard')
          }}
        >
          <img className="logo-escura" src="/brand/logo-atenderadar-clara.webp" alt="AtendeRadar" width={560} height={109} />
          <img className="logo-clara" src="/brand/logo-atenderadar.webp" alt="AtendeRadar" width={560} height={109} />
          <small>Auditor de WhatsApp</small>
        </a>

        <nav className="nav-lateral" aria-label="Principal">{mainNavItems.filter(visible).map(renderNavItem)}</nav>

        {admin.length > 0 && (
          <>
            <div className="lateral__secao">Administração</div>
            <nav className="nav-lateral" aria-label="Administração">{admin.map(renderNavItem)}</nav>
          </>
        )}

        {canSeeReports && (
          <div className="promo">
            <svg className="grafico" viewBox="0 0 74 40" fill="none" aria-hidden="true">
              <path d="M2 36 L16 26 L28 30 L44 16 L56 20 L70 5" stroke="#3ce08f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 36 L16 26 L28 30 L44 16 L56 20 L70 5 V40 H2Z" fill="url(#gp-lateral)" opacity=".5" />
              <circle cx="70" cy="5" r="3.4" fill="#3ce08f" />
              <circle cx="44" cy="16" r="2.4" fill="#3ce08f" />
              <defs>
                <linearGradient id="gp-lateral" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#3ce08f" stopOpacity=".55" />
                  <stop offset="1" stopColor="#3ce08f" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <strong>Mais vendas</strong>
            <p>com um atendimento de excelência.</p>
            <a
              href="#reports"
              onClick={(e) => {
                e.preventDefault()
                go('reports')
              }}
            >
              Ver relatórios <ArrowRight className="ic" aria-hidden="true" />
            </a>
          </div>
        )}

        {/* Só aparece no estilo "menu lateral claro" (troca no menu do usuário) */}
        <div className="dica-dia">
          <strong>
            <Lightbulb className="ic" aria-hidden="true" /> Dica do dia
          </strong>
          <p>Responda rápido: quanto antes o cliente recebe retorno, menor a chance de ele fechar com outro.</p>
        </div>

        {/* Manual interativo: capítulos por papel, passo a passo, com leitura em voz alta */}
        <button
          className="ajuda ajuda--tour"
          type="button"
          data-testid="abrir-tour-sistema"
          data-tour="sidebar-tour"
          aria-current={currentView === 'system-tour' ? 'page' : undefined}
          onClick={() => {
            setMobileNavOpen(false)
            openSystemTour()
          }}
        >
          <GraduationCap className="ic" aria-hidden="true" />
          <span>
            <strong>Tour pelo sistema</strong>
            <span>Manual passo a passo</span>
          </span>
        </button>

        {/* Abre a central de ajuda (artigos, busca, suporte); de lá dá para reabrir o guia da tela em que estava */}
        <button
          className="ajuda"
          type="button"
          data-testid="abrir-ajuda"
          data-tour="sidebar-help"
          aria-current={currentView === 'help' ? 'page' : undefined}
          onClick={() => {
            setMobileNavOpen(false)
            openHelp()
          }}
        >
          <CircleHelp className="ic" aria-hidden="true" />
          <span>
            <strong>Precisa de ajuda?</strong>
            <span>Central de ajuda e guias</span>
          </span>
        </button>
      </aside>
      {/* Celular: fundo escurecido; tocar fecha a gaveta */}
      <div className="veu" aria-hidden="true" onClick={() => setMobileNavOpen(false)} />
    </>
  )
}
