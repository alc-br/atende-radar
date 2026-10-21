'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/permissions'

interface Conn {
  id: string
  name: string
  status: string
  phoneLast4: string | null
  pairedAt: string | null
}

// Status em que o número parou de mandar conversas para o AtendeRadar. "paused" é escolha da empresa e "connecting" /
// "syncing" são passagens normais: não entram.
const DOWN = new Set(['disconnected', 'logged_out', 'blocked', 'error', 'qr_required'])

/** Números que já estiveram conectados e caíram. O que nunca foi pareado fica com os "Primeiros passos". */
export function downConnections(list: Conn[]): Conn[] {
  return list.filter((c) => DOWN.has(c.status) && !!c.pairedAt)
}

// Faixa vermelha no topo de todas as telas enquanto algum WhatsApp da empresa estiver desconectado: sem ele nenhuma
// conversa chega e os alertas param. Some sozinha quando o número volta (confere a cada minuto).
export function ConnectionBanner() {
  const me = useAppStore((s) => s.me)
  const setView = useAppStore((s) => s.setView)
  const currentView = useAppStore((s) => s.currentView)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  const [down, setDown] = useState<Conn[]>([])
  const allowed = !!me && can(me.role, 'connections.view') && !me.subscriptionLock

  useEffect(() => {
    if (!allowed) return
    let alive = true
    const load = () =>
      fetch('/api/connections')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && setDown(downConnections(d?.connections ?? [])))
        .catch(() => {})
    load()
    const id = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [allowed, refreshTrigger, currentView])

  if (!allowed || down.length === 0) return null
  const one = down.length === 1 ? down[0] : null
  const label = (c: Conn) => (c.phoneLast4 ? `${c.name} (final ${c.phoneLast4})` : c.name)

  return (
    <div className="px-4 pt-4 sm:px-7">
      <div
        data-testid="connection-banner"
        role="status"
        className="aviso flex-col sm:flex-row sm:items-center border border-[var(--vermelho-borda)] bg-[var(--vermelho-fundo)] text-[var(--vermelho)]"
      >
        <span className="aviso__ic grid size-7 shrink-0 place-items-center rounded-full bg-[var(--vermelho)] text-white">
          <WifiOff className="ic" aria-hidden="true" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span>
            <b>{one ? `WhatsApp desconectado: ${label(one)}.` : `${down.length} WhatsApp desconectados: ${down.map(label).join(', ')}.`}</b>{' '}
            O AtendeRadar parou de receber as conversas {one ? 'desse número' : 'desses números'} e os alertas não funcionam até reconectar.
          </span>
          <span>Em Conexões, use &quot;Gerar QR&quot; e leia o código com o celular da empresa (WhatsApp › Aparelhos conectados).</span>
        </span>
        {currentView !== 'connections' && (
          <button type="button" className="btn btn--sm self-start sm:self-auto" onClick={() => setView('connections')}>
            Reconectar
          </button>
        )}
      </div>
    </div>
  )
}
