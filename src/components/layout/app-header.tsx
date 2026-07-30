'use client'

import { useAppStore } from '@/lib/store'
import { organization } from '@/lib/mock-data'
import { Bell, Moon, Sun, Menu, Search, ChevronDown, User, LogOut, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useTheme } from 'next-themes'

export function AppHeader() {
  const { sidebarOpen, setSidebarOpen } = useAppStore()
  const { theme, setTheme } = useTheme()

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
              {organization.displayName}
              <ChevronDown className='w-4 h-4 text-muted-foreground' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuLabel>Organizações</DropdownMenuLabel>
            <DropdownMenuItem className='font-medium'>
              <div className='w-2 h-2 rounded-full bg-emerald-500 mr-2' />
              {organization.displayName}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' className='relative'>
              <Bell className='w-4 h-4' />
              <span className='absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-80'>
            <DropdownMenuLabel className='flex items-center justify-between'>
              Notificações
              <Badge variant='secondary' className='text-[10px]'>5 novas</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='flex flex-col items-start gap-1 py-3'>
              <span className='font-medium text-sm'>Alerta crítico: Cliente irritado</span>
              <span className='text-xs text-muted-foreground'>Maria Santos - há 12 min</span>
            </DropdownMenuItem>
            <DropdownMenuItem className='flex flex-col items-start gap-1 py-3'>
              <span className='font-medium text-sm'>Conexão desconectada</span>
              <span className='text-xs text-muted-foreground'>Unidade Centro - há 45 min</span>
            </DropdownMenuItem>
            <DropdownMenuItem className='flex flex-col items-start gap-1 py-3'>
              <span className='font-medium text-sm'>Relatório diário disponível</span>
              <span className='text-xs text-muted-foreground'>Hoje às 18:00</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' className='gap-2 h-9'>
              <Avatar className='h-7 w-7'>
                <AvatarFallback className='bg-primary text-primary-foreground text-xs'>AS</AvatarFallback>
              </Avatar>
              <span className='hidden lg:inline text-sm font-medium'>Ana Silva</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem><User className='mr-2 h-4 w-4' />Perfil</DropdownMenuItem>
            <DropdownMenuItem><HelpCircle className='mr-2 h-4 w-4' />Ajuda</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='text-destructive'><LogOut className='mr-2 h-4 w-4' />Sair</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
