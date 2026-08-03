'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import {
  LayoutDashboard, AlertTriangle, MessageSquare, RotateCcw, Users,
  FileBarChart, Wifi, Settings, ChevronLeft, ChevronRight, Radar,
  UserCog, CreditCard, ShieldCheck, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { View } from '@/lib/store'

const mainNavItems: { view: View; icon: React.ElementType; label: string }[] = [
  { view: 'dashboard', icon: LayoutDashboard, label: 'Visão Geral' },
  { view: 'alerts', icon: AlertTriangle, label: 'Alertas' },
  { view: 'conversations', icon: MessageSquare, label: 'Conversas' },
  { view: 'recovery', icon: RotateCcw, label: 'Recuperação' },
  { view: 'team', icon: Users, label: 'Equipe' },
  { view: 'reports', icon: FileBarChart, label: 'Relatórios' },
  { view: 'connections', icon: Wifi, label: 'Conexões' },
]

const secondaryNavItems: { view: View; icon: React.ElementType; label: string }[] = [
  { view: 'settings', icon: Settings, label: 'Configurações' },
  { view: 'members', icon: UserCog, label: 'Membros' },
  { view: 'teams', icon: Building2, label: 'Equipes' },
  { view: 'plans', icon: CreditCard, label: 'Planos' },
  { view: 'admin', icon: ShieldCheck, label: 'Admin' },
]

export function AppSidebar() {
  const { currentView, setView, sidebarOpen, setSidebarOpen, refreshTrigger } = useAppStore()
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
    (view === 'team' && currentView === 'agent-profile')

  const renderNavItem = (item: { view: View; icon: React.ElementType; label: string }) => {
    const active = isActive(item.view)
    const badge = badges[item.view]
    const Icon = item.icon
    const btn = (
      <button
        key={item.view}
        data-tour={`nav-${item.view}`}
        onClick={() => setView(item.view)}
        className={cn(
          'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        )}
      >
        <Icon className={cn('w-5 h-5 shrink-0', active && 'text-sidebar-primary')} />
        {sidebarOpen && <span className="truncate">{item.label}</span>}
        {sidebarOpen && badge && (
          <span className="ml-auto flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-bold rounded-full bg-destructive text-white">
            {badge}
          </span>
        )}
      </button>
    )
    if (!sidebarOpen) {
      return (
        <Tooltip key={item.view} delayDuration={0}>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.label}
            {badge && <span className="ml-1.5 text-destructive">({badge})</span>}
          </TooltipContent>
        </Tooltip>
      )
    }
    return btn
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-[68px]'
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Radar className="w-5 h-5" />
        </div>
        {sidebarOpen && (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-base tracking-tight truncate">AtendeRadar</span>
            <span className="text-[11px] text-sidebar-foreground/60 truncate">Auditor de WhatsApp</span>
          </div>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        {mainNavItems.map(renderNavItem)}

        {/* Separator + Secondary items */}
        <div className="pt-4 mt-4 border-t border-sidebar-border">
          {sidebarOpen && (
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              Administração
            </p>
          )}
          {secondaryNavItems.map(renderNavItem)}
        </div>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>
    </aside>
  )
}
