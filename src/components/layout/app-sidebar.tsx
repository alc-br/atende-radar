'use client'

import { useAppStore } from '@/lib/store'
import {
  LayoutDashboard, AlertTriangle, MessageSquare, RotateCcw, Users,
  FileBarChart, Wifi, Settings, ChevronLeft, ChevronRight, Radar
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { View } from '@/lib/store'

const navItems: { view: View; icon: React.ElementType; label: string; badge?: string }[] = [
  { view: 'dashboard', icon: LayoutDashboard, label: 'Visão Geral' },
  { view: 'alerts', icon: AlertTriangle, label: 'Alertas', badge: '5' },
  { view: 'conversations', icon: MessageSquare, label: 'Conversas' },
  { view: 'recovery', icon: RotateCcw, label: 'Recuperação', badge: '8' },
  { view: 'team', icon: Users, label: 'Equipe' },
  { view: 'reports', icon: FileBarChart, label: 'Relatórios' },
  { view: 'connections', icon: Wifi, label: 'Conexões' },
  { view: 'settings', icon: Settings, label: 'Configurações' },
]

export function AppSidebar() {
  const { currentView, setView, sidebarOpen, setSidebarOpen } = useAppStore()

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

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const isActive = currentView === item.view ||
            (item.view === 'conversations' && currentView === 'conversation-detail') ||
            (item.view === 'team' && currentView === 'agent-profile')
          const Icon = item.icon
          const btn = (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={cn(
                'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <Icon className={cn('w-5 h-5 shrink-0', isActive && 'text-sidebar-primary')} />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
              {sidebarOpen && item.badge && (
                <span className="ml-auto flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-bold rounded-full bg-destructive text-white">
                  {item.badge}
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
                  {item.badge && <span className="ml-1.5 text-destructive">({item.badge})</span>}
                </TooltipContent>
              </Tooltip>
            )
          }
          return btn
        })}
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
