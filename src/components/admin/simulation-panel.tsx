'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchMutation } from '@/lib/mutation'

// Ambiente de simulação (S1), só para o operador da plataforma: roda cenários contra empresas simuladas
// (isoladas: sem e-mail, webhook, cobrança nem métricas) e mostra o resultado de cada verificação.
// A aba só aparece quando o servidor tem SIMULATION_ENABLED=on (senão a API responde 404).

type Scenario = { id: string; title: string; description: string; plan: string; steps: number }
type Assertion = { at: number | null; label: string; ok: boolean; detail?: string }
type Result = { scenarioId: string; title: string; status: string; organizationId: string | null; kept: boolean; error?: string; assertions: Assertion[] }
type Run = { id: string; kind: string; scenarioId: string | null; status: string; organizationId: string | null; startedBy: string; createdAt: string }
type KeptOrg = { id: string; displayName: string | null; simulationExpiresAt: string | null; createdAt: string }
type Snapshot = {
  organization: { id: string; name: string | null; expiresAt: string | null }
  plan: { code: string; name: string } | null
  connections: Array<{ id: string; name: string; status: string }>
  conversations: Array<{ id: string; customer: string | null; status: string; intent: string | null; sentiment: string | null; potentialValue: number | null; closed: boolean; messages: number }>
  alerts: Array<{ id: string; ruleName: string; status: string; severity: string; title: string }>
  recovery: Array<{ id: string; reason: string; status: string }>
}

const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const KIND: Record<string, string> = { run: 'Rodar', inject: 'Mensagem', tick: 'Motor', clean: 'Limpar' }
const statusTag = (s: string) => (
  <span className={`tag ${s === 'passed' ? 'tag--verde' : s === 'running' ? 'tag--contorno' : 'tag--ambar'}`}>
    {s === 'passed' ? 'Verde' : s === 'failed' ? 'Falhou' : s === 'error' ? 'Erro' : s === 'running' ? 'Rodando' : s}
  </span>
)

/** Pergunta ao servidor se a simulação está ligada e se quem vê é o operador (200). Qualquer outra resposta: sem aba. */
export function useSimulationAvailable() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/simulation/scenarios')
      .then((r) => alive && setAvailable(r.ok))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return available
}

export function SimulationPanel() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [kept, setKept] = useState<KeptOrg[]>([])
  const [results, setResults] = useState<Result[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [keep, setKeep] = useState(false)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [msg, setMsg] = useState({ chat: 'cliente-1', from: 'customer', text: '', minutesAgo: '0' })

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([fetch('/api/admin/simulation/scenarios'), fetch('/api/admin/simulation/runs')])
      if (s.ok) setScenarios((await s.json()).scenarios)
      if (r.ok) {
        const d = await r.json()
        setRuns(d.runs)
        setKept(d.keptOrganizations)
      }
    } catch {
      toast.error('Não foi possível carregar a simulação.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openSnapshot = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/admin/simulation/orgs/${id}`)
      if (!r.ok) throw new Error(String(r.status))
      setSnap(await r.json())
    } catch {
      toast.error('Empresa simulada não encontrada (pode ter expirado).')
      setSnap(null)
    }
  }, [])

  async function run(scenarioId: string) {
    setBusy(scenarioId)
    try {
      const res = await fetchMutation('/api/admin/simulation/run', { json: { scenarioId, keep } })
      const d = (await res.json()) as { ok: boolean; passed: number; total: number; results: Result[] }
      setResults(d.results)
      if (d.ok) toast.success(`${d.passed} de ${d.total} cenário(s) verde(s).`)
      else toast.error(`${d.total - d.passed} de ${d.total} cenário(s) falharam.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao rodar.')
    } finally {
      setBusy(null)
      void load()
    }
  }

  async function act(label: string, url: string, json: unknown, after?: () => Promise<void> | void) {
    setBusy(label)
    try {
      await fetchMutation(url, { json })
      await after?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha.')
    } finally {
      setBusy(null)
      void load()
    }
  }

  return (
    <div className="space-y-[18px]" data-testid="admin-simulation">
      <section className="cartao" aria-labelledby="t-sim-cenarios">
        <div className="cartao__cab">
          <div>
            <h2 id="t-sim-cenarios">Cenários de simulação</h2>
            <p>Cada cenário cria uma empresa simulada, injeta mensagens com relógio virtual, roda o motor e confere o resultado. Nada sai para clientes: sem e-mail, webhook, cobrança ou métricas.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Manter a empresa (24 h)
            </label>
            <Button onClick={() => run('todos')} disabled={!!busy}>{busy === 'todos' ? 'Rodando…' : 'Rodar todos'}</Button>
            <Button variant="outline" disabled={!!busy} onClick={() => act('clean', '/api/admin/simulation/clean', {}, () => { setSnap(null); toast.success('Empresas simuladas apagadas.') })}>
              Limpar simuladas
            </Button>
          </div>
        </div>
        <div className="cartao__corpo">
          <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Cenários">
            <table className="tabela tabela--cab-cinza">
              <thead><tr><th>Cenário</th><th className="hidden md:table-cell">Plano</th><th className="hidden lg:table-cell">Passos</th><th aria-label="Ações" /></tr></thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.title}</strong><div className="suave text-xs">{s.description}</div><div className="mono text-xs suave">{s.id}</div></td>
                    <td className="hidden md:table-cell">{s.plan}</td>
                    <td className="hidden lg:table-cell">{s.steps}</td>
                    <td><Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(s.id)}>{busy === s.id ? 'Rodando…' : 'Rodar'}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {results && (
        <section className="cartao" aria-labelledby="t-sim-result" data-testid="simulation-results">
          <div className="cartao__cab"><div><h2 id="t-sim-result">Resultado</h2></div></div>
          <div className="cartao__corpo space-y-4">
            {results.map((r) => (
              <div key={r.scenarioId + (r.organizationId ?? '')}>
                <p className="flex flex-wrap items-center gap-2">{statusTag(r.status)} <strong>{r.title}</strong>{r.kept && r.organizationId && <Button size="sm" variant="ghost" onClick={() => openSnapshot(r.organizationId!)}>Ver empresa</Button>}</p>
                {r.error && <p className="text-sm tom-vermelho">{r.error}</p>}
                <ul className="text-sm mt-1 space-y-0.5">
                  {r.assertions.map((a, i) => (
                    <li key={i} className={a.ok ? 'suave' : ''}>
                      {a.ok ? '✓' : '✗'} {a.at === null ? 'fim' : `min ${a.at}`} · {a.label}{!a.ok && a.detail ? ` — ${a.detail}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {kept.length > 0 && (
        <section className="cartao" aria-labelledby="t-sim-mantidas">
          <div className="cartao__cab"><div><h2 id="t-sim-mantidas">Empresas simuladas mantidas</h2><p>Apagadas sozinhas quando expiram (24 h) ou em “Limpar simuladas”.</p></div></div>
          <div className="cartao__corpo">
            <ul className="space-y-1 text-sm">
              {kept.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <strong>{o.displayName ?? o.id}</strong>
                  <span className="suave">expira {o.simulationExpiresAt ? fmt(o.simulationExpiresAt) : '—'}</span>
                  <Button size="sm" variant="outline" onClick={() => openSnapshot(o.id)}>Abrir</Button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {snap && (
        <section className="cartao" aria-labelledby="t-sim-snap" data-testid="simulation-snapshot">
          <div className="cartao__cab">
            <div>
              <h2 id="t-sim-snap">{snap.organization.name ?? 'Empresa simulada'}</h2>
              <p>Retrato só leitura · plano {snap.plan?.name ?? '—'} · {snap.connections.length} conexão(ões) · {snap.alerts.filter((a) => a.status === 'new').length} alerta(s) abertos</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act('tick', `/api/admin/simulation/orgs/${snap.organization.id}/tick`, {}, () => openSnapshot(snap.organization.id))}>Rodar o motor agora</Button>
              <Button size="sm" variant="ghost" onClick={() => setSnap(null)}>Fechar</Button>
            </div>
          </div>
          <div className="cartao__corpo space-y-4">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto_auto] items-end"
              onSubmit={(e) => {
                e.preventDefault()
                if (!msg.text.trim()) return
                void act('inject', `/api/admin/simulation/orgs/${snap.organization.id}/inject`, { chat: msg.chat, from: msg.from, text: msg.text, minutesAgo: Number(msg.minutesAgo) || 0 }, () => {
                  setMsg((m) => ({ ...m, text: '' }))
                  return openSnapshot(snap.organization.id)
                })
              }}
            >
              <div><Label htmlFor="sim-chat">Conversa</Label><Input id="sim-chat" value={msg.chat} maxLength={60} onChange={(e) => setMsg({ ...msg, chat: e.target.value })} /></div>
              <div>
                <Label htmlFor="sim-from">Quem fala</Label>
                <select id="sim-from" className="flex h-10 w-full rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie)] px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" value={msg.from} onChange={(e) => setMsg({ ...msg, from: e.target.value })}>
                  <option value="customer">Cliente</option>
                  <option value="company">Empresa</option>
                </select>
              </div>
              <div><Label htmlFor="sim-text">Mensagem</Label><Input id="sim-text" value={msg.text} maxLength={4000} onChange={(e) => setMsg({ ...msg, text: e.target.value })} /></div>
              <div><Label htmlFor="sim-ago">Minutos atrás</Label><Input id="sim-ago" type="number" min={0} max={10080} value={msg.minutesAgo} onChange={(e) => setMsg({ ...msg, minutesAgo: e.target.value })} /></div>
              <Button type="submit" disabled={!!busy || !msg.text.trim()}>Injetar</Button>
            </form>
            <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Conversas simuladas">
              <table className="tabela tabela--cab-cinza">
                <thead><tr><th>Cliente</th><th>Situação</th><th className="hidden md:table-cell">Intenção</th><th className="hidden md:table-cell">Sentimento</th><th className="hidden lg:table-cell">Mensagens</th></tr></thead>
                <tbody>
                  {snap.conversations.map((c) => (
                    <tr key={c.id}>
                      <td>{c.customer ?? '—'}</td>
                      <td>{c.closed ? 'Encerrada' : c.status}</td>
                      <td className="hidden md:table-cell">{c.intent ?? '—'}</td>
                      <td className="hidden md:table-cell">{c.sentiment ?? '—'}</td>
                      <td className="hidden lg:table-cell">{c.messages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {snap.alerts.length > 0 && (
              <ul className="text-sm space-y-0.5" aria-label="Alertas">
                {snap.alerts.map((a) => <li key={a.id}>{a.status === 'new' ? '●' : '○'} {a.title} <span className="suave">({a.ruleName} · {a.severity})</span></li>)}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="cartao" aria-labelledby="t-sim-hist">
        <div className="cartao__cab"><div><h2 id="t-sim-hist">Últimas execuções</h2><p>Quem rodou fica registrado (e também na auditoria).</p></div></div>
        <div className="cartao__corpo">
          <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Últimas execuções">
            <table className="tabela tabela--cab-cinza">
              <thead><tr><th>Quando</th><th>Ação</th><th>Cenário</th><th>Situação</th><th className="hidden md:table-cell">Quem</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="suave">{fmt(r.createdAt)}</td>
                    <td>{KIND[r.kind] ?? r.kind}</td>
                    <td className="mono text-xs">{r.scenarioId ?? '—'}</td>
                    <td>{statusTag(r.status)}</td>
                    <td className="hidden md:table-cell suave">{r.startedBy === 'token' ? 'segredo (CLI/agente)' : r.startedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
