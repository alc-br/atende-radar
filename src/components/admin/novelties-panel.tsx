'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { fetchMutation, MUTATION_ERROR_MESSAGE } from '@/lib/mutation'
import type { NoveltyCluster, NoveltyStatus } from '@/lib/analysis/novelty'

// Admin › Situações novas: temas que o Claude viu nas conversas e os alertas ainda não cobrem (analysis/novelty.ts).
// O operador decide: "vale mapear" (vira assunto ou alerta no código) ou "descartar". Nada é criado sozinho.

interface Novelties {
  aiEnabled: boolean
  pending: number
  clusters: NoveltyCluster[]
}

const num = (v: number) => new Intl.NumberFormat('pt-BR').format(v)
const date = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

const STATUS: Record<NoveltyStatus, { label: string; className: string }> = {
  new: { label: 'A decidir', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/25' },
  mapped: { label: 'Vale mapear', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25' },
  dismissed: { label: 'Descartado', className: 'bg-muted text-muted-foreground' },
}

export function NoveltiesPanel() {
  const [data, setData] = useState<Novelties | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showDecided, setShowDecided] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/novelties')
      if (!res.ok) throw new Error('Não foi possível carregar as situações novas')
      setData((await res.json()) as Novelties)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (id: string, status: NoveltyStatus) => {
    setBusy(id)
    try {
      await fetchMutation(`/api/admin/novelties/${id}`, { method: 'PATCH', json: { status } })
      toast.success(status === 'mapped' ? 'Marcado como vale mapear' : status === 'dismissed' ? 'Tema descartado' : 'Tema voltou para a decidir')
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith('HTTP ') ? e.message : MUTATION_ERROR_MESSAGE)
    } finally {
      setBusy(null)
      void load()
    }
  }

  const clusterNow = async () => {
    setBusy('cluster')
    try {
      const res = await fetchMutation('/api/admin/novelties/cluster')
      const r = (await res.json()) as { signals: number; created: number; updated: number }
      toast.success(r.signals ? `${num(r.signals)} conversas agrupadas: ${num(r.created)} temas novos, ${num(r.updated)} atualizados` : 'Nenhuma frase pendente')
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith('HTTP ') ? e.message : MUTATION_ERROR_MESSAGE)
    } finally {
      setBusy(null)
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

  const open = data.clusters.filter((c) => c.status === 'new')
  const decided = data.clusters.filter((c) => c.status !== 'new')
  const shown = showDecided ? data.clusters : open

  return (
    <div className="space-y-[18px]" data-testid="admin-novidades">
      <div className="kpis">
        <article className="cartao kpi">
          <p className="kpi__rotulo">Temas a decidir</p>
          <p className="kpi__valor">{num(open.length)}</p>
        </article>
        <article className="cartao kpi">
          <p className="kpi__rotulo">Conversas esperando o agrupamento</p>
          <p className="kpi__valor" data-testid="admin-novidades-pendentes">{num(data.pending)}</p>
        </article>
        <article className="cartao kpi">
          <p className="kpi__rotulo">Já decididos</p>
          <p className="kpi__valor">{num(decided.length)}</p>
        </article>
      </div>

      <section className="cartao" aria-labelledby="t-novidades">
        <div className="cartao__cab">
          <div>
            <h2 id="t-novidades">Situações novas</h2>
            <p>
              O que o Claude viu de importante nas conversas e que os alertas ainda não cobrem. Os temas são agrupados uma vez por semana.
              Nada vira alerta sozinho: marque o que vale mapear.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {decided.length > 0 && (
              <button type="button" className="btn btn--sm" aria-pressed={showDecided} onClick={() => setShowDecided((v) => !v)}>
                {showDecided ? 'Só os a decidir' : 'Mostrar decididos'}
              </button>
            )}
            {data.aiEnabled && (
              <button type="button" className="btn btn--sm" disabled={busy !== null || data.pending === 0} onClick={() => void clusterNow()}>
                {busy === 'cluster' ? 'Agrupando…' : 'Agrupar agora'}
              </button>
            )}
          </div>
        </div>
        <div className="cartao__corpo">
          {!data.aiEnabled && (
            <p className="suave mb-3">A classificação por IA está desligada: sem ela não aparecem situações novas.</p>
          )}
          {shown.length === 0 ? (
            <p className="suave" data-testid="admin-novidades-vazio">
              {data.pending > 0 ? 'Há conversas esperando o agrupamento da semana.' : 'Nenhuma situação nova por enquanto.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {shown.map((c) => (
                <li key={c.id} className="cartao p-4" data-testid="admin-novidade">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="forte">{c.title}</h3>
                      <p className="text-sm">{c.summary}</p>
                    </div>
                    <Badge className={STATUS[c.status].className}>{STATUS[c.status].label}</Badge>
                  </div>
                  <p className="text-xs suave mt-2">
                    {num(c.conversations)} {c.conversations === 1 ? 'conversa' : 'conversas'} em {num(c.organizations)} {c.organizations === 1 ? 'empresa' : 'empresas'}
                    {c.lastRunConversations > 0 && ` · ${num(c.lastRunConversations)} no último agrupamento`}
                    {` · visto pela primeira vez em ${date(c.firstSeenAt)}`}
                    {c.decidedAt && ` · decidido em ${date(c.decidedAt)}`}
                  </p>
                  {c.examples.length > 0 && (
                    <ul className="text-sm suave mt-2 list-disc pl-5">
                      {c.examples.map((e) => <li key={e}>{e}</li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {c.status !== 'mapped' && (
                      <button type="button" className="btn btn--sm btn--primario" disabled={busy !== null} onClick={() => void decide(c.id, 'mapped')}>
                        Vale mapear
                      </button>
                    )}
                    {c.status !== 'dismissed' && (
                      <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => void decide(c.id, 'dismissed')}>
                        Descartar
                      </button>
                    )}
                    {c.status !== 'new' && (
                      <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => void decide(c.id, 'new')}>
                        Voltar para a decidir
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
