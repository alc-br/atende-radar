'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertTriangle, Bell, BellOff, CheckCheck, FileBarChart, Clock,
  AlertCircle, RotateCcw, Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/utils'

interface Notification {
  id: string
  type: string
  title: string
  message: string | null
  read: boolean
  createdAt: string
}

const ICON_MAP: Record<string, React.ElementType> = {
  alert: AlertTriangle,
  promise_overdue: Clock,
  report_ready: FileBarChart,
  report_failed: AlertCircle,
  recovery: RotateCcw,
  system: Settings,
}

const ICON_COLORS: Record<string, string> = {
  alert: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  promise_overdue: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  report_ready: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  report_failed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  recovery: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  system: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
}

export default function NotificationsView() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error('Erro ao carregar notificações')
      const data = await res.json()
      setNotifications(data.notifications || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'PATCH' })
      if (!res.ok) throw new Error('Erro ao marcar notificações')
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      toast.success('Todas as notificações foram marcadas como lidas.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao marcar notificações')
    }
  }

  const toggleRead = async (notif: Notification) => {
    const nextRead = !notif.read
    setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: nextRead } : n)))
    try {
      const res = await fetch(`/api/notifications/${notif.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: nextRead }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: !nextRead } : n)))
      toast.error('Erro ao atualizar notificação')
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={fetchNotifications} className="text-sm text-primary underline">Tentar novamente</button>
      </div>
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
                const Icon = ICON_MAP[notif.type] || Bell
                const colorClass = ICON_COLORS[notif.type] || 'bg-muted text-muted-foreground'
                return (
                  <Card
                    key={notif.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${!notif.read ? 'border-l-4 border-l-primary bg-primary/[0.02]' : ''}`}
                    onClick={() => toggleRead(notif)}
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
                              {timeAgo(notif.createdAt)}
                            </span>
                          </div>
                        </div>
                        {notif.message && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                        )}
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
