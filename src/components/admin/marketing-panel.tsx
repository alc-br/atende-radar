'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { fetchMutation, MUTATION_ERROR_MESSAGE } from '@/lib/mutation'
import type { FunnelRow, GadsNames } from '@/lib/marketing-report'

// Admin › Medição (docs/operacao/medicao.md): quem é interno (não conta como cadastro, ativação nem compra), os nomes das
// conversões do Google Ads no CSV de importação, o funil por dia × campanha e as escolhas no aviso de cookies.
// O funil e os CSVs são só leitura.

interface Marketing {
  internal: { emails: string[]; domains: string[] }
  internalOrgCount: number
  gadsNames: GadsNames
  gadsRowCount: number
  rows: FunnelRow[]
  consent: { day: string; accept_all: number; reject_all: number; custom: number }[]
}

const num = (v: number) => new Intl.NumberFormat('pt-BR').format(v)
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const pct = (a: number, total: number) => (total ? `${Math.round((a / total) * 100)}%` : '—')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const daysAgo = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - n * 86400_000))

export function MarketingPanel() {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [data, setData] = useState<Marketing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emails, setEmails] = useState('')
  const [domains, setDomains] = useState('')
  const [names, setNames] = useState<GadsNames>({ activation: '', purchase: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/marketing?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Não foi possível carregar a medição')
      const d = (await res.json()) as Marketing
      setData(d)
      setEmails(d.internal.emails.join('\n'))
      setDomains(d.internal.domains.join('\n'))
      setNames(d.gadsNames)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setBusy(true)
    try {
      await fetchMutation('/api/admin/marketing', { method: 'PUT', json: { internal: { emails, domains }, gadsNames: names } })
      toast.success('Medição salva')
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith('HTTP ') ? e.message : MUTATION_ERROR_MESSAGE)
    } finally {
      setBusy(false)
      void load()
    }
  }

  if (error) {
    return (
      <div className="cartao vazio" role="alert">
        <strong>{error}</strong>
        <button type="button" onClick={() => void load()} className="btn btn--sm mt-3">Tentar novamente</button>
      </div>
    )
  }

  if (!data) return <Skeleton className="h-64 rounded-xl" />

  const t = data.rows.reduce(
    (a, r) => ({ s: a.s + r.signups, a: a.a + r.activations, e: a.e + r.trialsExpiredUnpaid, p: a.p + r.paidSubscriptions, v: a.v + r.revenueBrl, c: a.c + r.cancellations }),
    { s: 0, a: 0, e: 0, p: 0, v: 0, c: 0 },
  )
  const ct = data.consent.reduce((a, c) => ({ y: a.y + c.accept_all, n: a.n + c.reject_all, m: a.m + c.custom }), { y: 0, n: 0, m: 0 })
  const choices = ct.y + ct.n + ct.m
  const csv = (type: 'gads' | 'funnel') => `/api/admin/marketing/export?type=${type}&from=${from}&to=${to}`

  return (
    <div className="space-y-[18px]" data-testid="admin-medicao">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          De
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="Data inicial" />
        </label>
        <label className="grid gap-1 text-sm">
          Até
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Data final" />
        </label>
        <a className="btn btn--sm" href={csv('funnel')} data-testid="admin-medicao-csv-funil">Baixar funil (CSV)</a>
        <a className="btn btn--sm" href={csv('gads')} data-testid="admin-medicao-csv-gads">Conversões do Google Ads (CSV, {num(data.gadsRowCount)})</a>
      </div>

      <div className="kpis">
        <article className="cartao kpi"><p className="kpi__rotulo">Cadastros</p><p className="kpi__valor">{num(t.s)}</p></article>
        <article className="cartao kpi"><p className="kpi__rotulo">Ativações (WhatsApp conectado)</p><p className="kpi__valor">{num(t.a)}</p></article>
        <article className="cartao kpi"><p className="kpi__rotulo">Testes vencidos sem contratar</p><p className="kpi__valor">{num(t.e)}</p></article>
        <article className="cartao kpi"><p className="kpi__rotulo">Assinaturas pagas</p><p className="kpi__valor">{num(t.p)}</p></article>
        <article className="cartao kpi"><p className="kpi__rotulo">Receita</p><p className="kpi__valor">{brl(t.v)}</p></article>
        <article className="cartao kpi"><p className="kpi__rotulo">Cancelamentos</p><p className="kpi__valor">{num(t.c)}</p></article>
      </div>

      <section className="cartao" aria-labelledby="t-funil-campanha">
        <div className="cartao__cab">
          <div>
            <h2 id="t-funil-campanha">Funil por dia e campanha</h2>
            <p>A campanha é a do cadastro da empresa (utm_* ou gclid/fbclid). Empresas internas e simuladas ficam fora ({num(data.internalOrgCount)} hoje).</p>
          </div>
        </div>
        <div className="cartao__corpo overflow-x-auto">
          {data.rows.length === 0 ? (
            <p className="suave" data-testid="admin-medicao-vazio">Nada no período.</p>
          ) : (
            <table className="tabela tabela--cab-cinza text-sm" data-testid="admin-medicao-funil">
              <thead>
                <tr><th>Dia</th><th>Origem</th><th>Mídia</th><th>Campanha</th><th>Cadastros</th><th>Ativações</th><th>Testes vencidos</th><th>Pagas</th><th>Receita</th><th>Cancel.</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`${r.day}|${r.utm_source}|${r.utm_medium}|${r.utm_campaign}`}>
                    <td>{r.day.split('-').reverse().join('/')}</td><td>{r.utm_source}</td><td>{r.utm_medium}</td><td>{r.utm_campaign}</td>
                    <td>{num(r.signups)}</td><td>{num(r.activations)}</td><td>{num(r.trialsExpiredUnpaid)}</td><td>{num(r.paidSubscriptions)}</td><td>{brl(r.revenueBrl)}</td><td>{num(r.cancellations)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="cartao" aria-labelledby="t-aviso-cookies">
        <div className="cartao__cab">
          <div>
            <h2 id="t-aviso-cookies">Aviso de cookies</h2>
            <p>Quantas vezes cada botão foi escolhido no período (contador do dia, sem identificar ninguém).</p>
          </div>
        </div>
        <div className="cartao__corpo">
          <p data-testid="admin-medicao-consent">
            Aceitar todos: <b>{num(ct.y)}</b> ({pct(ct.y, choices)}) · Recusar: <b>{num(ct.n)}</b> ({pct(ct.n, choices)}) · Configurar: <b>{num(ct.m)}</b> ({pct(ct.m, choices)})
          </p>
        </div>
      </section>

      <section className="cartao" aria-labelledby="t-internos">
        <div className="cartao__cab">
          <div>
            <h2 id="t-internos">Quem é interno</h2>
            <p>
              Empresa com algum membro destes e-mails ou domínios não manda cadastro, ativação nem compra para o GA4, a Meta e o Google Ads,
              e sai do funil. Vale também para o que ainda está na fila. Um por linha.
            </p>
          </div>
        </div>
        <div className="cartao__corpo grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            E-mails
            <Textarea className="min-h-28 font-mono" value={emails} onChange={(e) => setEmails(e.target.value)} data-testid="admin-medicao-emails" />
          </label>
          <label className="grid gap-1 text-sm">
            Domínios
            <Textarea className="min-h-28 font-mono" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="exemplo.com.br" data-testid="admin-medicao-dominios" />
          </label>
          <label className="grid gap-1 text-sm">
            Nome da conversão de ativação no Google Ads
            <Input value={names.activation} onChange={(e) => setNames({ ...names, activation: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            Nome da conversão de assinatura no Google Ads
            <Input value={names.purchase} onChange={(e) => setNames({ ...names, purchase: e.target.value })} />
          </label>
          <div>
            <button type="button" className="btn btn--sm btn--primario" disabled={busy} onClick={() => void save()} data-testid="admin-medicao-salvar">
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
