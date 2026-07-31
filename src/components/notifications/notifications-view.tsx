'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertTriangle, Bell, BellOff, CheckCheck, MessageSquare, Wifi,
  FileBarChart, Users, Clock, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface Notification {
  id: string
  icon: 'alert' | 'message' | 'connection' | 'report' | 'team'
  title: string
  message: string
  time: string
  read: boolean
}

const ICON_MAP: Record<string, React.ElementType> = {
  alert: AlertTriangle,
  message: MessageSquare,
  connection: Wifi,
  report: FileBarChart,
  team: Users,
}

const ICON_COLORS: Record<string, string> = {
  alert: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  message: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  connection: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  report: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  team: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
}

const mockNotifications: Notification[] = [
  { id: '1', icon: 'alert', title: 'Alerta crítico: Cliente irritado', message: 'Maria Santos aguarda há 15 min com tom agressivo. Risco de perda estimado: R$ 1.200,00.', time: 'Há 5 min', read: false },
  { id: '2', icon: 'alert', title: 'Promessa vencida', message: 'Carlos prometeu retorno em 2h mas passou de 4h. Cliente: João Mendes #4521.', time: 'Há 12 min', read: false },
  { id: '3', icon: 'connection', title: 'Conexão desconectada', message: 'A conexão WhatsApp da unidade Centro foi interrompida. Verifique o dispositivo.', time: 'Há 45 min', read: false },
  { id: '4', icon: 'report', title: 'Relatório diário disponível', message: 'O relatório de hoje está pronto. 127 conversas, 8 alertas, 43 oportunidades.', time: 'Há 1h', read: false },
  { id: '5', icon: 'team', title: 'Novo membro adicionado', message: 'Pedro Rocha foi adicionado à equipe Vendas e está aguardando primeiro acesso.', time: 'Há 2h', read: false },
  { id: '6', icon: 'message', title: 'Conversa sem resposta há 30 min', message: 'O cliente Fernanda Almeida #3890 não recebeu resposta. Intenção: Orçamento.', time: 'Há 30 min', read: true },
  { id: '7', icon: 'alert', title: 'Taxa de conversão abaixo da meta', message: 'A taxa de conversão da equipe Suporte caiu para 12% (meta: 20%).', time: 'Há 3h', read: true },
  { id: '8', icon: 'connection', title: 'Nova conexão estabelecida', message: 'WhatsApp Business conectado com sucesso na unidade Filial Norte.', time: 'Há 5h', read: true },
  { id: '9', icon: 'report', title: 'Relatório semanal enviado', message: 'Resumo semanal enviado para ana@empresa.com com 847 conversas analisadas.', time: 'Há 1 dia', read: true },
  { id: '10', icon: 'team', title: 'Agente offline inesperado', message: 'Fernanda Costa ficou offline durante o horário comercial sem aviso prévio.', time: 'Há 1 dia', read: true },
]

export default function NotificationsView() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setNotifications(mockNotifications)
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    toast.success('Todas as notificações foram marcadas como lidas.')
  }

  const toggleRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="text-muted-foreground mt-1">
            {unreadCount > 0
              ? `Você tem ${unreadCount} ${unreadCount > 1 ? 'notificações não lidas' : 'notificação não lida'}.`
              : 'Todas as notificações foram lidas.'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4 mr-2" />
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[calc(100vh-280px)]">
          <div className="space-y-2">
            {notifications.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <BellOff className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma notificação.</p>
                </CardContent>
              </Card>
            ) : (
              notifications.map((notif) => {
                const Icon = ICON_MAP[notif.icon] || Bell
                const colorClass = ICON_COLORS[notif.icon] || 'bg-muted text-muted-foreground'
                return (
                  <Card
                    key={notif.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${!notif.read ? 'border-l-4 border-l-primary bg-primary/[0.02]' : ''}`}
                    onClick={() => toggleRead(notif.id)}
                  >
                    <CardContent className="p-4 flex gap-3 items-start">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium ${!notif.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {notif.title}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {!notif.read && (
                              <span className="w-2 h-2 rounded-full bg-primary" />
                            )}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {notif.time}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
