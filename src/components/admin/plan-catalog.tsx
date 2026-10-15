'use client'

import { useCallback, useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchMutation } from '@/lib/mutation'
import { formatCurrency } from '@/lib/utils'
import { PLAN_FEATURES } from '@/lib/plan-catalog'

// Admin › Planos (V7): o operador da plataforma edita a vitrine e a venda de cada plano. Limites (cotas) não mudam aqui.

interface CatalogPlan {
  id: string
  code: string
  name: string
  description: string | null
  monthlyPrice: number
  annualPrice: number
  active: boolean
  highlight: boolean
  features: Record<string, boolean>
  limits: { maxConnections: number; maxAgents: number; maxConversationsMonthly: number; maxMessagesMonthly: number; maxAlertRules: number; maxExports: number; retentionDays: number }
  subscribers: number
}

interface Form {
  name: string
  description: string
  monthlyPrice: string
  annualPrice: string
  active: boolean
  highlight: boolean
  features: Record<string, boolean>
}

const toForm = (p: CatalogPlan): Form => ({
  name: p.name,
  description: p.description ?? '',
  monthlyPrice: String(p.monthlyPrice).replace('.', ','),
  annualPrice: String(p.annualPrice).replace('.', ','),
  active: p.active,
  highlight: p.highlight,
  features: Object.fromEntries(PLAN_FEATURES.map(([k]) => [k, !!p.features[k]])),
})

// "1.490,00" e "149,90" (vírgula decimal) ou "149.90" (ponto decimal, sem vírgula)
const parsePrice = (s: string) => {
  const t = s.trim().replace(/^R\$\s*/, '')
  return t ? Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) : NaN
}

export function PlanCatalog() {
  const [plans, setPlans] = useState<CatalogPlan[] | null>(null)
  const [erro, setErro] = useState(false)
  const [editing, setEditing] = useState<CatalogPlan | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(false)
    try {
      const res = await fetch('/api/admin/plans')
      if (!res.ok) throw new Error(String(res.status))
      setPlans(((await res.json()) as { plans: CatalogPlan[] }).plans)
    } catch {
      setErro(true)
      setPlans([])
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const abrir = (p: CatalogPlan) => {
    setEditing(p)
    setForm(toForm(p))
    setFormError(null)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing || !form) return
    const monthlyPrice = parsePrice(form.monthlyPrice)
    const annualPrice = parsePrice(form.annualPrice)
    if (!Number.isFinite(monthlyPrice) || !Number.isFinite(annualPrice)) { setFormError('Preço inválido. Use, por exemplo, 149,90.'); return }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetchMutation(`/api/admin/plans/${editing.id}`, {
        method: 'PATCH',
        json: { name: form.name, description: form.description, monthlyPrice, annualPrice, active: form.active, highlight: form.highlight, features: form.features },
      })
      const data = (await res.json()) as { changed: string[] }
      toast.success(data.changed.length ? `Plano ${form.name.trim()} salvo.` : 'Nada mudou.')
      setEditing(null)
      await carregar()
    } catch (e2) {
      setFormError(e2 instanceof Error ? e2.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  const priceChanged = !!editing && !!form && (parsePrice(form.monthlyPrice) !== editing.monthlyPrice || parsePrice(form.annualPrice) !== editing.annualPrice)

  return (
    <section className="cartao" aria-labelledby="t-planos-admin" data-testid="admin-planos">
      <div className="cartao__cab">
        <div>
          <h2 id="t-planos-admin"><Package className="ic verde-txt" aria-hidden="true" />Catálogo de planos</h2>
          <p>O que aparece na página de vendas e em Planos. Preço novo vale só para novas contratações: quem já assina continua pagando o valor da própria assinatura.</p>
        </div>
      </div>
      <div className="cartao__corpo">
        {erro && <p className="aviso aviso--ambar" role="alert">Não foi possível carregar os planos. <button type="button" className="btn btn--sm" onClick={carregar}>Tentar de novo</button></p>}
        {plans === null ? (
          <p className="suave text-[13px]">Carregando…</p>
        ) : (
          <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Catálogo de planos">
            <table className="tabela tabela--cab-cinza">
              <thead>
                <tr>
                  <th>Plano</th>
                  <th className="direita">Mensal</th>
                  <th className="direita">Anual</th>
                  <th>Venda</th>
                  <th className="direita">Assinaturas</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} data-testid={`admin-plano-${p.code}`}>
                    <td>
                      <b>{p.name}</b> <span className="suave text-xs">({p.code})</span>
                      {p.highlight && <span className="tag tag--verde ml-2">Mais escolhido</span>}
                      {p.description && <p className="suave text-xs mt-1">{p.description}</p>}
                    </td>
                    <td className="direita whitespace-nowrap">{formatCurrency(p.monthlyPrice)}</td>
                    <td className="direita whitespace-nowrap">{formatCurrency(p.annualPrice)}</td>
                    <td><span className={`tag ${p.active ? 'tag--verde' : 'tag--cinza'}`}>{p.active ? 'À venda' : 'Fora de venda'}</span></td>
                    <td className="direita">{p.subscribers}</td>
                    <td className="direita"><button type="button" className="btn btn--sm" onClick={() => abrir(p)} aria-label={`Editar plano ${p.name}`}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          {editing && form && (
            <form onSubmit={salvar} noValidate className="space-y-4">
              <DialogHeader>
                <DialogTitle>Editar plano {editing.name}</DialogTitle>
                <DialogDescription>Código {editing.code} · {editing.subscribers} {editing.subscribers === 1 ? 'empresa usa' : 'empresas usam'} este plano.</DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="plano-nome">Nome</Label>
                <Input id="plano-nome" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plano-desc">Descrição</Label>
                <Input id="plano-desc" value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={saving} />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Preço para novas contratações</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="plano-mensal">Mensal (R$)</Label>
                    <Input id="plano-mensal" inputMode="decimal" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })} disabled={saving} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plano-anual">Anual (R$)</Label>
                    <Input id="plano-anual" inputMode="decimal" value={form.annualPrice} onChange={(e) => setForm({ ...form, annualPrice: e.target.value })} disabled={saving} />
                  </div>
                </div>
                <p className={`text-xs ${priceChanged ? 'aviso aviso--ambar' : 'suave'}`} data-testid="aviso-preco">
                  O preço novo vale só para quem contratar a partir de agora. As assinaturas que já existem continuam cobrando o valor de quando foram contratadas, inclusive quando a renovação é reativada.
                </p>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Destaques exibidos</legend>
                <p className="suave text-xs">Itens mostrados na página de vendas. São só vitrine: não liberam nem bloqueiam nada no sistema.</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {PLAN_FEATURES.map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!form.features[k]} onChange={(e) => setForm({ ...form, features: { ...form.features, [k]: e.target.checked } })} disabled={saving} />
                      {label}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.highlight} onChange={(e) => setForm({ ...form, highlight: e.target.checked })} disabled={saving} />
                  Selo &quot;Mais escolhido&quot;
                </label>
              </fieldset>

              <div className="space-y-1">
                <p className="text-sm font-medium">Limites</p>
                <p className="suave text-xs">
                  {editing.limits.maxConnections} {editing.limits.maxConnections === 1 ? 'conexão' : 'conexões'} · {editing.limits.maxAgents} atendentes · {editing.limits.maxConversationsMonthly.toLocaleString('pt-BR')} conversas/mês · {editing.limits.maxAlertRules} regras · {editing.limits.maxExports} exportações/mês · histórico de {editing.limits.retentionDays} dias.
                  Os limites são as cotas aplicadas a quem já assina, por isso não mudam por aqui.
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} disabled={saving} />
                <span>
                  À venda
                  <span className="block suave text-xs">Fora de venda, o plano some da página de vendas e de Planos e não pode ser contratado. Quem já assina continua com ele e pode reativar a renovação.</span>
                </span>
              </label>

              {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>Voltar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar plano'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
