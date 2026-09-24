'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  connectionId: string | null
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}

const GIVE_UP_AFTER_MS = 45000

// QR Code REAL do WhatsApp: vem do serviço de conexão, muda a cada ~20 s, e a tela acompanha sozinha.
export function QrDialog({ connectionId, onOpenChange, onConnected }: Props) {
  const [qr, setQr] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('qr_required')
  const [waitedTooLong, setWaitedTooLong] = useState(false)

  useEffect(() => {
    if (!connectionId) return
    setQr(null)
    setStatus('qr_required')
    setWaitedTooLong(false)
    const startedAt = Date.now()
    let stop = false

    // Pede ao serviço um QR novo (necessário se o anterior expirou sem ser lido).
    void fetch(`/api/connections/${connectionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reconnect' }) }).catch(() => {})

    const poll = async () => {
      try {
        const res = await fetch(`/api/connections/${connectionId}/qr`)
        if (!res.ok || stop) return
        const data = await res.json()
        setStatus(data.status)
        setQr(data.qr)
        if (data.status === 'connected') {
          stop = true
          onConnected()
          return
        }
        if (!data.qr && Date.now() - startedAt > GIVE_UP_AFTER_MS) setWaitedTooLong(true)
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }
    void poll()
    const timer = setInterval(poll, 3000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [connectionId, onConnected])

  return (
    <Dialog open={!!connectionId} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar o WhatsApp</DialogTitle>
          <DialogDescription>Leia o QR Code com o celular do número que será monitorado.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {status === 'connected' ? (
            <div role="status" className="flex flex-col items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-12 w-12" />
              <p className="font-medium">WhatsApp conectado!</p>
              <p className="text-sm text-muted-foreground text-center">As conversas passam a aparecer aqui em instantes.</p>
            </div>
          ) : qr ? (
            <>
              <div className="rounded-xl border bg-white p-3">
                <QRCodeSVG value={qr} size={208} level="M" aria-label="QR Code do WhatsApp" />
              </div>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5 max-w-xs">
                <li>Abra o WhatsApp no celular.</li>
                <li>Toque em <strong>Configurações</strong> → <strong>Aparelhos conectados</strong>.</li>
                <li>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para este QR Code.</li>
              </ol>
              <p className="text-xs text-muted-foreground">O código muda sozinho de tempos em tempos; esta tela acompanha.</p>
            </>
          ) : waitedTooLong ? (
            <div role="alert" className="flex flex-col items-center gap-2 text-center max-w-xs">
              <AlertTriangle className="h-10 w-10 text-amber-600" />
              <p className="font-medium">O QR Code não chegou.</p>
              <p className="text-sm text-muted-foreground">O serviço de conexão do WhatsApp pode estar desligado ou sem internet. Tente de novo em instantes; se persistir, fale com o suporte.</p>
            </div>
          ) : (
            <div role="status" className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Gerando o QR Code...</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {status === 'connected' ? 'Fechar' : 'Cancelar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
