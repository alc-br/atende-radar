'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Trash2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAppStore, type OrganizationDeletion } from '@/lib/store'
import { can } from '@/lib/permissions'

// Zona de perigo (Configurações › Privacidade): o dono encerra a conta. A empresa fica 7 dias "em exclusão"
// (dá para desistir pela faixa no topo) e depois é apagada com todos os dados.
export function DangerZone() {
  const me = useAppStore((s) => s.me)
  const setMe = useAppStore((s) => s.setMe)
  const [password, setPassword] = useState('')
  const [typedName, setTypedName] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!me || !can(me.role, 'organization.delete')) return null
  const orgName = (me.organizationName || '').trim()
  const pending = me.organizationDeletion
  const ready = password.length > 0 && typedName.trim() === orgName && orgName.length > 0

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/organization/deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmName: typedName }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; deletion?: OrganizationDeletion }
      if (!res.ok || !data.deletion) {
        setError(data.error || 'Não foi possível pedir a exclusão. Tente novamente.')
        return
      }
      setMe({ ...me, organizationDeletion: data.deletion })
      setPassword('')
      setTypedName('')
      toast.success(`Exclusão agendada para ${new Date(data.deletion.scheduledFor).toLocaleDateString('pt-BR')}.`)
    } catch {
      setError('Não foi possível pedir a exclusão. Tente novamente.')
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  return (
    <section className="cartao secao-config border border-[var(--vermelho-borda)]" aria-labelledby="t-zona-perigo" data-testid="danger-zone" data-tour="settings-danger">
      <header className="secao-config__cab">
        <span className="cab-pagina__icone cab-pagina__icone--caixa text-[var(--vermelho)]" aria-hidden="true"><AlertTriangle className="ic" /></span>
        <div>
          <h2 id="t-zona-perigo">Zona de perigo · Encerrar conta e apagar a empresa</h2>
          <p>Só o dono da conta vê esta seção.</p>
        </div>
      </header>
      <div className="flex flex-col gap-3 text-[13px]">
        <p>
          Ao encerrar a conta, <b>tudo desta empresa é apagado de forma definitiva</b>: conversas e mensagens, contatos, alertas,
          recuperação, relatórios, regras, equipes, conexões de WhatsApp (e as credenciais dos números), faturas guardadas, registro
          de auditoria e os usuários que só pertencem a esta empresa.
        </p>
        <ul className="list-disc pl-5">
          <li>A renovação da assinatura é cancelada na hora (o período já pago não é estornado).</li>
          <li>Os WhatsApp são desconectados na hora e a análise para.</li>
          <li>Você tem <b>7 dias</b> para desistir. Depois disso não há como recuperar.</li>
        </ul>
        {pending ? (
          <p className="aviso aviso--ambar" data-testid="danger-zone-pending">
            Exclusão já agendada para {new Date(pending.scheduledFor).toLocaleDateString('pt-BR')}. Para desistir, use o botão na faixa vermelha no topo.
          </p>
        ) : (
          <form
            className="form-grade"
            onSubmit={(e) => {
              e.preventDefault()
              if (ready) setConfirmOpen(true)
            }}
          >
            <div className="campo">
              <label htmlFor="z-senha">Sua senha atual</label>
              <input className="entrada" id="z-senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="z-nome">Digite o nome da empresa: <b>{orgName}</b></label>
              <input className="entrada" id="z-nome" autoComplete="off" value={typedName} onChange={(e) => setTypedName(e.target.value)} />
            </div>
            {error && <p className="form-grade__todo text-[var(--vermelho)]" role="alert">{error}</p>}
            <div className="form-grade__todo flex justify-end">
              <button type="submit" className="btn btn--lg border-[var(--vermelho)] bg-[var(--vermelho)] text-white" disabled={!ready || busy}>
                <Trash2 className="ic" aria-hidden="true" />
                Encerrar conta e apagar a empresa
              </button>
            </div>
          </form>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !o && !busy && setConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {orgName} e todos os dados?</AlertDialogTitle>
            <AlertDialogDescription>
              A assinatura deixa de renovar e os WhatsApp são desconectados agora. Em 7 dias a empresa e todos os dados são apagados
              para sempre. Até lá, você pode desistir (a assinatura precisará ser reativada em Planos).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void submit() }}>
              {busy ? 'Agendando...' : 'Sim, apagar a empresa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
