'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'

// B5/B9: telefone completo do cliente, só sob pedido (cada "Mostrar" fica no registro de auditoria).
// Some de novo ao trocar de conversa; nunca vai para listas nem para o cache do navegador.
export function RevealPhone({ conversationId, masked, available }: { conversationId: string; masked: string; available: boolean }) {
  const [phone, setPhone] = useState<{ id: string; value: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const shown = phone?.id === conversationId ? phone.value : null

  const reveal = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/phone`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { phone?: string; error?: string }
      if (!res.ok || !data.phone) throw new Error(data.error || 'Telefone completo indisponível.')
      setPhone({ id: conversationId, value: data.phone })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Telefone completo indisponível.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="mono suave contato__id" data-testid="contact-phone">{shown || masked}</span>
      {available && (
        shown ? (
          <button type="button" className="btn btn--sm btn--link" onClick={() => setPhone(null)} aria-label="Esconder telefone">
            <EyeOff className="ic" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="btn btn--sm btn--link" onClick={() => void reveal()} disabled={loading} aria-label="Mostrar telefone completo">
            <Eye className="ic" aria-hidden="true" />Mostrar
          </button>
        )
      )}
    </span>
  )
}
