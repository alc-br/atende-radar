'use client'

import { useState, useEffect, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle, Bell, BellOff, CheckCheck, FileBarChart, Clock,
  AlertCircle, RotateCcw, Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo, cn } from '@/lib/utils'

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
  email_failed: AlertCircle,
  recovery: RotateCcw,
  system: Settings,
}

// Tons do pacote de design (classes tom-* de painel.css)
const ICON_TONES: Record<string, string> = {
  alert: 'tom-vermelho',
  promise_overdue: 'tom-ambar',
  report_ready: 'tom-verde',
  report_failed: 'tom-vermelho',
  email_failed: 'tom-vermelho',
  recovery: 'tom-teal',
  system: 'tom-roxo',
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

  const subtitle = unreadCount > 0
    ? `Você tem ${unreadCount} ${unreadCount > 1 ? 'notificações não lidas' : 'notificação não lida'}.`
    : 'Todas as notificações foram lidas.'

  const header = (
    <div className="cab-pagina">
      <div className="cab-pagina__titulo">
        <span className="cab-pagina__icone cab-pagina__icone--caixa">
          <Bell className="ic" aria-hidden="true" />
        </span>
        <div>
          <h1>Notificações</h1>
          <p>{error ? 'Não foi possível carregar as notificações.' : subtitle}</p>
        </div>
      </div>
      {!error && unreadCount > 0 && (
        <div className="cab-pagina__acoes">
          <button type="button" className="btn" onClick={markAllRead}>
            <CheckCheck className="ic" aria-hidden="true" />
            Marcar todas como lidas
          </button>
        </div>
      )}
    </div>
  )

  if (error) {
    return (
      <>
        {header}
        <div className="cartao vazio" role="alert">
          <AlertCircle className="ic mx-auto block" aria-hidden="true" />
          <strong>{error}</strong>
          <button type="button" onClick={fetchNotifications} className="btn btn--contorno-verde mt-3">
            Tentar novamente
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {header}

      <section className="cartao" aria-labelledby="t-notificacoes">
        <div className="cartao__cab">
          <div>
            <h2 id="t-notificacoes">
              <Bell className="ic verde-txt" aria-hidden="true" />
              Todas as notificações
              {!loading && unreadCount > 0 && <span className="contador-pill">{unreadCount}</span>}
            </h2>
            <p>Clique em uma notificação para marcá-la como lida ou não lida.</p>
          </div>
        </div>
        <div className="cartao__corpo">
          {loading ? (
            <div className="grid gap-4 py-2" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-[11px]" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="vazio">
              <BellOff className="ic mx-auto block" aria-hidden="true" />
              <strong>Nenhuma notificação.</strong>
              Avisos de alertas, promessas vencidas e relatórios aparecem aqui.
            </div>
          ) : (
            <ul className="grid gap-2">
              {notifications.map((notif) => {
                const Icon = ICON_MAP[notif.type] || Bell
                const tone = ICON_TONES[notif.type] || 'tom-cinza'
                return (
                  <li key={notif.id}>
                    <button
                      type="button"
                      onClick={() => toggleRead(notif)}
                      aria-pressed={notif.read}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-[var(--raio-sm)] border p-3.5 text-left transition-colors hover:bg-[var(--superficie-2)]',
                        notif.read
                          ? 'border-[var(--borda)] bg-[var(--superficie)]'
                          : 'border-[var(--verde-300)] border-l-4 border-l-[var(--verde-600)] bg-[var(--verde-50)]',
                      )}
                    >
                      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[11px] text-[20px]', tone)}>
                        <Icon className="ic" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={cn('text-[14px]', notif.read ? 'font-medium text-[var(--texto-2)]' : 'font-semibold text-[var(--texto)]')}>
                            {!notif.read && <span className="sr-only">Não lida: </span>}
                            {notif.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {!notif.read && (
                              <span className="h-2 w-2 rounded-full bg-[var(--verde-600)]" aria-hidden="true" />
                            )}
                            <span className="suave flex items-center gap-1 text-[12px]">
                              <Clock className="ic" aria-hidden="true" />
                              {timeAgo(notif.createdAt)}
                            </span>
                          </span>
                        </span>
                        {notif.message && (
                          <span className="suave mt-0.5 line-clamp-2 block text-[13px]">
                            {notif.message}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
