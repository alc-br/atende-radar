'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldOff, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

  if (!can(me?.role, 'privacy.manage')) return null

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
          <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 text-xs" aria-label="Privacidade do cliente">
            <ShieldOff className="h-4 w-4" />
            Privacidade
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
