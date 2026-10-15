'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldOff, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/permissions'

type Action = 'exclude' | 'erase'

const COPY: Record<Action, { title: string; body: string; confirm: string; done: string }> = {
  exclude: {
    title: 'Parar de monitorar este contato?',
    body: 'A conversa some das telas e das análises, os alertas abertos são encerrados e as próximas mensagens desta pessoa deixam de ser guardadas. O histórico já guardado NÃO é apagado (para isso, use "Apagar dados").',
    confirm: 'Parar de monitorar',
    done: 'Contato excluído do monitoramento.',
  },
  erase: {
    title: 'Apagar todos os dados deste cliente?',
    body: 'Remove de forma definitiva as conversas, mensagens, alertas, promessas e itens de recuperação deste contato. Esta ação não pode ser desfeita. Se a pessoa voltar a escrever, ela aparece como um contato novo (use "Parar de monitorar" para evitar).',
    confirm: 'Apagar definitivamente',
    done: 'Dados do cliente apagados.',
  },
}

// Pedidos de privacidade do cliente final (titular). Só para quem configura a empresa (admin/gestor).
export function PrivacyMenu({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const me = useAppStore((s) => s.me)
  const [pending, setPending] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)

  const [exporting, setExporting] = useState(false)

  if (!can(me?.role, 'privacy.manage')) return null

  // Baixa o JSON só se a resposta for o arquivo. Antes era um link direto: com a exportação desligada
  // (Configurações › Privacidade) o navegador baixava um arquivo contendo a mensagem de erro.
  const exportData = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/privacy/export`)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
        toast.error(
          body?.code === 'export_disabled'
            ? 'A exportação de dados do cliente está desligada em Configurações › Privacidade. Peça a quem administra a empresa para ligar "Exportação pelo titular".'
            : body?.error || 'Não foi possível exportar os dados deste cliente. Tente novamente.',
          { duration: 10000 }
        )
        return
      }
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'dados-cliente.json'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.error('Não foi possível exportar os dados deste cliente. Confira sua internet e tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  const run = async (action: Action) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/privacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error()
      toast.success(COPY[action].done)
      onDone()
    } catch {
      toast.error('Não foi possível concluir o pedido de privacidade.')
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="btn btn--link suave" aria-label="Privacidade do cliente">
            <ShieldOff className="ic" aria-hidden="true" />
            Privacidade
            <ChevronDown className="ic" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void exportData()} disabled={exporting}>Exportar dados deste cliente (JSON)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPending('exclude')}>Parar de monitorar este contato</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPending('erase')} className="text-red-700 dark:text-red-400">Apagar dados deste cliente</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? COPY[pending].title : ''}</AlertDialogTitle>
            <AlertDialogDescription>{pending ? COPY[pending].body : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (pending) void run(pending) }}>
              {pending ? COPY[pending].confirm : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
