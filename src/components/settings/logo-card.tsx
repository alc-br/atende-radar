'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Building2, ImageUp, Trash2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { fetchMutation } from '@/lib/mutation'

const erro = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Não foi possível concluir a ação. Tente novamente.')

// Configurações › Empresa (P7): logotipo da empresa. Aparece na barra superior para todos os membros.
export function LogoCard() {
  const me = useAppStore((s) => s.me)
  const setMe = useAppStore((s) => s.setMe)
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const logoUrl = me?.organizationLogoUrl || null

  const apply = (url: string | null) => {
    const current = useAppStore.getState().me
    if (current) setMe({ ...current, organizationLogoUrl: url })
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setSaving(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetchMutation('/api/organization/logo', { method: 'POST', body: form })
      const data = (await res.json()) as { logoUrl: string | null }
      apply(data.logoUrl)
      toast.success('Logotipo atualizado.')
    } catch (err) {
      toast.error(erro(err))
    } finally {
      setSaving(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await fetchMutation('/api/organization/logo', { method: 'DELETE' })
      apply(null)
      toast.success('Logotipo removido.')
    } catch (err) {
      toast.error(erro(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="cartao secao-config secao-config--linha" aria-labelledby="t-logo">
      <span className="perfil-foto perfil-foto--logo" aria-hidden="true">
        {logoUrl ? <img src={logoUrl} alt="" /> : <Building2 className="ic" />}
      </span>
      <div>
        <h2 id="t-logo">Logotipo</h2>
        <p className="suave">Aparece na barra superior para toda a equipe. PNG, JPG ou WEBP de até 2 MB.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={input} id="org-logo-file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Escolher logotipo da empresa" onChange={(e) => void upload(e.target.files?.[0])} disabled={saving} />
        <button className="btn btn--lg" type="button" onClick={() => input.current?.click()} disabled={saving}>
          <ImageUp className="ic" aria-hidden="true" />{saving ? 'Enviando...' : logoUrl ? 'Trocar logotipo' : 'Enviar logotipo'}
        </button>
        {logoUrl && (
          <button className="btn btn--lg" type="button" onClick={() => void remove()} disabled={saving}>
            <Trash2 className="ic" aria-hidden="true" />Remover logotipo
          </button>
        )}
      </div>
    </section>
  )
}
