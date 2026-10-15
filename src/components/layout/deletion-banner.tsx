'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/permissions'
import { fetchMutation, runMutation } from '@/lib/mutation'

// Faixa fixa enquanto a empresa está "em exclusão" (o dono pediu o encerramento da conta). Aparece para todos os membros;
// só o dono vê o botão de desistir.
export function DeletionBanner() {
  const me = useAppStore((s) => s.me)
  const setMe = useAppStore((s) => s.setMe)
  const [busy, setBusy] = useState(false)
  const deletion = me?.organizationDeletion
  if (!me || !deletion) return null

  const when = new Date(deletion.scheduledFor).toLocaleDateString('pt-BR')
  const owner = can(me.role, 'organization.delete')

  const cancel = async () => {
    setBusy(true)
    const ok = await runMutation(() => fetchMutation('/api/organization/deletion', { method: 'DELETE' }), { errorMessage: 'Não foi possível cancelar a exclusão. Tente novamente.' })
    setBusy(false)
    if (!ok) return
    setMe({ ...me, organizationDeletion: null })
    toast.success('Exclusão cancelada. A assinatura não volta sozinha: reative em Planos e conecte os WhatsApp de novo em Conexões.', { duration: 10000 })
  }

  return (
    <div className="px-4 pt-4 sm:px-7">
      <div
        data-testid="deletion-banner"
        role="alert"
        className="aviso flex-col sm:flex-row sm:items-center border border-[var(--vermelho-borda)] bg-[var(--vermelho-fundo)] text-[var(--vermelho)]"
      >
        <span className="aviso__ic grid size-7 shrink-0 place-items-center rounded-full bg-[var(--vermelho)] text-white">
          <AlertTriangle className="ic" aria-hidden="true" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span>
            <b>Esta empresa será apagada em {when}</b>{' '}
            ({deletion.daysLeft === 0 ? 'hoje' : deletion.daysLeft === 1 ? 'falta 1 dia' : `faltam ${deletion.daysLeft} dias`}).
            {' '}Todos os dados, usuários e conexões serão removidos de forma definitiva.
          </span>
          {!owner && <span>Só o dono da conta pode desistir da exclusão.</span>}
        </span>
        {owner && (
          <button type="button" className="btn btn--sm self-start sm:self-auto" disabled={busy} onClick={() => void cancel()}>
            {busy ? 'Cancelando...' : 'Desistir da exclusão'}
          </button>
        )}
      </div>
    </div>
  )
}
