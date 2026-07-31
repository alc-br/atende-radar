'use client'

import { useAppStore } from '@/lib/store'
import { useSession, signOut } from 'next-auth/react'
import { Moon, Sun, Menu, Search, ChevronDown, User, LogOut, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from 'next-themes'

export function AppHeader() {
  const { sidebarOpen, setSidebarOpen, currentOrganization, setView } = useAppStore()
  const { data: session } = useSession()
  const orgName = currentOrganization?.displayName || 'AtendeRadar'
  const { theme, setTheme } = useTheme()

  const userName = (session?.user as any)?.name || 'Demo User'
  const userInitials = userName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <header className='sticky top-0 z-30 h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-6'>
      <div className='flex items-center gap-3'>
        <Button
          variant='ghost'
          size='icon'
          className='lg:hidden'
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu className='w-5 h-5' />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' className='gap-2 font-medium'>
              <div className='w-2 h-2 rounded-full bg-emerald-500' />
              {orgName}
              <ChevronDown className='w-4 h-4 text-muted-foreground' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuLabel>Organizações</DropdownMenuLabel>
            <DropdownMenuItem className='font-medium'>
              <div className='w-2 h-2 rounded-full bg-emerald-500 mr-2' />
              {orgName}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <div className='w-2 h-2 rounded-full bg-muted-foreground/40 mr-2' />
              Criar organização...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className='hidden md:flex items-center gap-2 flex-1 max-w-md mx-8'>
        <div className='relative w-full'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
          <Input
            placeholder='Buscar conversas, contatos, alertas...'
            className='pl-9 bg-muted/50 border-0 focus-visible:ring-1'
          />
        </div>
      </div>

      <div className='flex items-center gap-2'>
        <Button variant='ghost' size='icon' onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className='w-4 h-4' /> : <Moon className='w-4 h-4' />}
        </Button>
        <Button variant='ghost' size='icon' className='relative' onClick={() => setView('notifications')}>
          <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='w-4 h-4'><path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'/><path d='M10.3 21a1.94 1.94 0 0 0 3.4 0'/></svg>
          <span className='absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive' />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' className='gap-2 h-9'>
              <Avatar className='h-7 w-7'>
                <AvatarFallback className='bg-primary text-primary-foreground text-xs'>{userInitials}</AvatarFallback>
              </Avatar>
              <span className='hidden lg:inline text-sm font-medium'>{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem><User className='mr-2 h-4 w-4' />Perfil</DropdownMenuItem>
            <DropdownMenuItem><HelpCircle className='mr-2 h-4 w-4' />Ajuda</DropdownMenuItem>
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
