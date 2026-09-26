'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { useSession, signOut } from 'next-auth/react'
import { Moon, Sun, Menu, Search, ChevronDown, User, LogOut, HelpCircle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

export function AppHeader() {
  const { setSidebarOpen, setMobileNavOpen, currentOrganization, setView, setShowLanding, setPendingSearch, currentView, startTour } = useAppStore()
  const { data: session } = useSession()
  const orgName = currentOrganization?.displayName || 'AtendeRadar'
  const { theme, setTheme } = useTheme()
  const [headerSearch, setHeaderSearch] = useState('')

  const userName = (session?.user as any)?.name || 'Demo User'
  const userInitials = userName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <header className='sticky top-0 z-30 h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between gap-1 px-2 sm:px-4 lg:px-6'>
      <div className='flex items-center gap-1 sm:gap-3 min-w-0'>
        <Button
          variant='ghost'
          size='icon'
          className='lg:hidden'
          aria-label='Abrir menu'
          onClick={() => {
            setSidebarOpen(true) // na gaveta do celular o menu sempre aparece com os textos
            setMobileNavOpen(true)
          }}
        >
          <Menu className='w-5 h-5' />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' className='gap-2 font-medium min-w-0 px-2 sm:px-3'>
              <div className='w-2 h-2 rounded-full bg-emerald-500 shrink-0' />
              <span className='truncate max-w-[30vw] sm:max-w-[40vw] lg:max-w-none'>{orgName}</span>
              <ChevronDown className='w-4 h-4 text-muted-foreground shrink-0' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuLabel>Organizações</DropdownMenuLabel>
            <DropdownMenuItem className='font-medium'>
              <div className='w-2 h-2 rounded-full bg-emerald-500 mr-2' />
              {orgName}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className='hidden md:flex items-center gap-2 flex-1 max-w-md mx-8'>
        <div className='relative w-full'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
          <Input
            data-tour='header-search'
            placeholder='Buscar conversas, contatos, alertas...'
            className='pl-9 bg-muted/50 border-0 focus-visible:ring-1'
            value={headerSearch}
            onChange={(e) => setHeaderSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && headerSearch.trim()) {
                setPendingSearch(headerSearch.trim())
                setView('conversations')
              }
            }}
          />
        </div>
      </div>

      <div className='flex items-center gap-0 sm:gap-2 shrink-0'>
        <Button aria-label="Alternar tema" variant='ghost' size='icon' onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className='w-4 h-4' /> : <Moon className='w-4 h-4' />}
        </Button>
        <Button aria-label='Notificações' variant='ghost' size='icon' className='relative' onClick={() => setView('notifications')}>
          <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='w-4 h-4'><path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'/><path d='M10.3 21a1.94 1.94 0 0 0 3.4 0'/></svg>
          <span className='absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive' />
        </Button>
        <Button aria-label="Voltar"
          variant='ghost'
          size='icon'
          className='text-muted-foreground hover:text-foreground'
          title='Voltar para início'
          onClick={() => setShowLanding(true)}
        >
          <ArrowLeft className='w-4 h-4' />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-tour='header-help' aria-label='Menu do usuário' variant='ghost' className='gap-2 h-9'>
              <Avatar className='h-7 w-7'>
                <AvatarFallback className='bg-primary text-primary-foreground text-xs'>{userInitials}</AvatarFallback>
              </Avatar>
              <span className='hidden lg:inline text-sm font-medium'>{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView('settings')}><User className='mr-2 h-4 w-4' />Perfil</DropdownMenuItem>
            <DropdownMenuItem onClick={() => startTour(currentView)}><HelpCircle className='mr-2 h-4 w-4' />Tour desta tela</DropdownMenuItem>
            <DropdownMenuItem onClick={() => startTour('welcome')}><HelpCircle className='mr-2 h-4 w-4' />Tour de boas-vindas</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='text-destructive' onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className='mr-2 h-4 w-4' />Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
