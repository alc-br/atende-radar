'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { MailWarning } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { MutationError, fetchMutation } from '@/lib/mutation'

// Faixa enquanto o e-mail de acesso não foi confirmado (link do e-mail do cadastro). Confirmar prova que o endereço é
// de quem entrou e ajuda os alertas e relatórios a chegarem na caixa de entrada. "Reenviar" manda um link novo.
export function EmailVerifyBanner() {
  const me = useAppStore((s) => s.me)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  if (!me || me.emailVerified !== false || me.isPlatformOperator) return null

  const resend = async () => {
    setBusy(true)
    try {
      await fetchMutation('/api/profile/verify-email', { method: 'POST' })
      setSent(true)
      toast.success(`Enviamos um link novo para ${me.email}. Confira também a caixa de spam.`)
    } catch (e) {
      // 429 traz o motivo (limite por hora); o resto, a mensagem genérica
      toast.error(e instanceof MutationError && e.status === 429 ? e.message : 'Não foi possível reenviar o e-mail. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 pt-4 sm:px-7">
      <div data-testid="email-verify-banner" role="status" className="aviso aviso--ambar flex-col sm:flex-row sm:items-center">
        <span className="aviso__ic">
          <MailWarning className="ic" aria-hidden="true" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span>
            <b>Confirme o seu e-mail.</b> Enviamos um link para <b>{me.email}</b>. Sem a confirmação, os alertas e relatórios por
            e-mail podem cair no spam ou não chegar.
          </span>
          <span>Não chegou? Confira a caixa de spam e as abas Promoções e Atualizações, ou peça um link novo.</span>
        </span>
        <button type="button" className="btn btn--sm self-start sm:self-auto" disabled={busy || sent} onClick={() => void resend()}>
          {busy ? 'Enviando...' : sent ? 'E-mail enviado' : 'Reenviar e-mail'}
        </button>
      </div>
    </div>
  )
}
