'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/permissions'

/** Baixa o arquivo JSON com todos os dados da empresa (GET /api/organization/export). Funciona com o painel bloqueado. */
export function OrgExportButton({ className = 'btn' }: { className?: string }) {
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/organization/export')
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(data.error || 'Não foi possível gerar o arquivo. Tente novamente.')
        return
      }
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'atenderadar-dados-da-empresa.json'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success('Arquivo com os dados da empresa baixado.')
    } catch {
      toast.error('Não foi possível gerar o arquivo. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={className} onClick={() => void download()} disabled={busy} data-testid="org-export">
      {busy ? <Loader2 className="ic animate-spin" aria-hidden="true" /> : <Download className="ic" aria-hidden="true" />}
      {busy ? 'Gerando o arquivo…' : 'Exportar todos os dados (JSON)'}
    </button>
  )
}

// Configurações › Privacidade: portabilidade (LGPD). Só administradores; o mesmo botão aparece no painel bloqueado.
export function OrgExport() {
  const me = useAppStore((s) => s.me)
  if (!me || !can(me.role, 'organization.export')) return null
  return (
    <section className="cartao secao-config" aria-labelledby="t-exportar-empresa" data-testid="org-export-section">
      <header className="secao-config__cab">
        <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Download className="ic" /></span>
        <div>
          <h2 id="t-exportar-empresa">Exportar todos os dados da empresa</h2>
          <p>Um arquivo JSON com tudo o que a empresa tem no AtendeRadar. Disponível também com o painel bloqueado.</p>
        </div>
      </header>
      <div className="flex flex-col gap-3 text-[13px]">
        <p>
          Sai tudo: empresa, membros, equipes, conexões, atendentes, contatos (com o telefone), conversas com as mensagens e as
          análises, alertas, regras, recuperação, relatórios, métricas, notificações, assinatura e faturas, webhook e auditoria.
          Não saem senhas, tokens e outros segredos. O texto das mensagens sai com o mesmo mascaramento das telas (cartão, CPF).
        </p>
        <div><OrgExportButton /></div>
      </div>
    </section>
  )
}
