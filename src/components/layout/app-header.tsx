'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { useSession, signOut } from 'next-auth/react'
import {
  Moon, Sun, Menu, Search, ChevronDown, LogOut, CircleHelp, Crown, Settings, PanelLeft, Palette,
  Bell, CalendarDays, ArrowRight, TriangleAlert, Home, UserRound, LifeBuoy, GraduationCap,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from 'next-themes'
import { canOpenView } from '@/lib/permissions'
import { SITE_URL, splitHosts } from '@/lib/hosts'

// Mesmas opções do pacote de design; o valor é o que a API do painel entende
export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '14d', label: 'Últimos 14 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
]

type Notice = { id: string; title: string; message: string; read: boolean }

/** Estilo do menu lateral (escuro, padrão, ou claro), guardado neste navegador como no pacote de design. */
function useSidebarStyle() {
  // O rótulo só aparece com o menu aberto, então ler o navegador já na criação não causa diferença de hidratação
  const [style, setStyle] = useState<'escuro' | 'claro'>(() => {
    if (typeof window === 'undefined') return 'escuro'
    try { return localStorage.getItem('ar-estilo') === 'claro' ? 'claro' : 'escuro' } catch { return 'escuro' }
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-estilo', style)
  }, [style])
  const toggle = () => {
    const next = style === 'claro' ? 'escuro' : 'claro'
    setStyle(next)
    try { localStorage.setItem('ar-estilo', next) } catch {}
  }
  return { style, toggle }
}

export function AppHeader() {
  const { setMobileNavOpen, mobileNavOpen, setView, setPendingSearch, currentView, startTour, openHelp, openSystemTour, period, setPeriod, refreshTrigger, setShowLanding } = useAppStore()
  const me = useAppStore((s) => s.me)
  const { data: session } = useSession()
  const orgName = me?.organizationName || 'AtendeRadar'
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const { style, toggle: toggleStyle } = useSidebarStyle()
  const [headerSearch, setHeaderSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [unread, setUnread] = useState(0)

  const userName: string = me?.name || (session?.user as { name?: string } | undefined)?.name || 'Usuário'
  const firstName = userName.split(' ')[0]
  const initial = userName.trim().charAt(0).toUpperCase() || 'U'
  const can = (v: Parameters<typeof canOpenView>[1]) => !!me && canOpenView(me.role, v)

  // ⌘K / Ctrl+K leva à busca, como no pacote
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!me) return
    let cancelled = false
    fetch('/api/notifications?limit=4')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        setNotices(d.notifications || [])
        setUnread(d.unreadCount || 0)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [me, refreshTrigger, currentView])

  const showPeriod = currentView === 'dashboard'

  return (
    <header className="topo">
      <button
        className="icone-btn topo__menu"
        type="button"
        aria-label="Abrir menu"
        aria-controls="lateral"
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen(!mobileNavOpen)}
      >
        <Menu className="ic" aria-hidden="true" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="org" type="button">
            <span className="ponto" />
            {orgName}
            <ChevronDown className="ic" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value="atual">
            <DropdownMenuRadioItem value="atual">{orgName}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <label className="busca">
        <span className="sr-only">Buscar</span>
        <Search className="ic ic-lupa" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          data-tour="header-search"
          placeholder="Buscar conversas, contatos, alertas..."
          autoComplete="off"
          value={headerSearch}
          onChange={(e) => setHeaderSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && headerSearch.trim()) {
              setPendingSearch(headerSearch.trim())
              setView('conversations')
            }
          }}
        />
        <kbd>⌘ K</kbd>
      </label>

      {showPeriod && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="seletor periodo-topo" type="button" aria-label="Período" data-tour="dashboard-period">
              <CalendarDays className="ic" aria-hidden="true" />
              <span className="rotulo-periodo">{PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? 'Últimos 7 dias'}</span>
              <ChevronDown className="ic" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={period} onValueChange={setPeriod}>
              {PERIOD_OPTIONS.map((p) => (
                <DropdownMenuRadioItem key={p.value} value={p.value}>{p.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <button className="icone-btn tema-btn" type="button" aria-label="Alternar tema" onClick={() => setTheme(dark ? 'light' : 'dark')}>
        {dark ? <Sun className="ic" aria-hidden="true" /> : <Moon className="ic" aria-hidden="true" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="icone-btn" type="button" aria-label="Notificações" data-tour="header-notifications">
            <Bell className="ic" aria-hidden="true" />
            {unread > 0 && <span className="bolinha" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[340px] max-w-[calc(100vw-32px)]">
          <DropdownMenuLabel className="text-[13px]">Notificações</DropdownMenuLabel>
          {notices.length === 0 && <p className="px-2 pb-2 text-[12.5px] text-muted-foreground">Nenhuma notificação por enquanto.</p>}
          {notices.map((n) => (
            <DropdownMenuItem key={n.id} className="items-start" onClick={() => setView('notifications')}>
              <TriangleAlert className="mt-0.5" aria-hidden="true" />
              <span className="min-w-0">
                <span className={n.read ? '' : 'font-semibold'}>{n.title}</span>
                <small className="block truncate text-xs text-muted-foreground">{n.message}</small>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setView('notifications')}>
            <ArrowRight aria-hidden="true" />
            Ver todas as notificações
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="usuario" type="button" data-tour="header-help" aria-label="Menu do usuário">
            <span className="avatar-u">{initial}</span>
            <span className="nome-u">{firstName}</span>
            <ChevronDown className="ic" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuItem onClick={() => setView('profile')}><UserRound aria-hidden="true" />Meu perfil</DropdownMenuItem>
          {can('plans') && (
            <DropdownMenuItem onClick={() => setView('plans')}><Crown aria-hidden="true" />Meu plano e teste grátis</DropdownMenuItem>
          )}
          {can('settings') && (
            <DropdownMenuItem onClick={() => setView('settings')}><Settings aria-hidden="true" />Configurações</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={openHelp}><LifeBuoy aria-hidden="true" />Central de ajuda e suporte</DropdownMenuItem>
          <DropdownMenuItem onClick={openSystemTour}><GraduationCap aria-hidden="true" />Tour pelo sistema</DropdownMenuItem>
          <DropdownMenuItem onClick={() => startTour(currentView)}><CircleHelp aria-hidden="true" />Tour desta tela</DropdownMenuItem>
          <DropdownMenuItem onClick={() => startTour('welcome')}><CircleHelp aria-hidden="true" />Tour de boas-vindas</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleStyle}><PanelLeft aria-hidden="true" />{style === 'claro' ? 'Menu lateral escuro' : 'Menu lateral claro'}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme(dark ? 'light' : 'dark')}><Palette aria-hidden="true" />{dark ? 'Tema claro' : 'Tema escuro'}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => (splitHosts ? window.location.assign(SITE_URL) : setShowLanding(true))}><Home aria-hidden="true" />Página inicial do site</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => signOut({ callbackUrl: '/login' })}>
            <LogOut aria-hidden="true" />Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
