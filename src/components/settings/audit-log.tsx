'use client'

import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { History, RefreshCw } from 'lucide-react'

// Registro de auditoria da organização: quem fez o quê, quando. Só metadados (nunca texto de mensagem ou telefone).
interface Entry {
  id: string
  action: string
  actionLabel: string
  actorEmail: string
  actorRole: string
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

const ROLE: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', supervisor: 'Supervisor', analista: 'Analista', member: 'Membro', atendente: 'Atendente', viewer: 'Visualizador' }
const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function describeDetails(e: Entry): string {
  const d = e.details || {}
  const parts: string[] = []
  if (e.targetLabel) parts.push(e.targetLabel)
  if (typeof d.from === 'string' || typeof d.to === 'string') parts.push(`${d.from ?? '—'} → ${d.to ?? '—'}`)
  if (Array.isArray(d.keys) && d.keys.length) parts.push(`campos: ${(d.keys as string[]).slice(0, 8).join(', ')}${d.keys.length > 8 ? '…' : ''}`)
  if (typeof d.action === 'string' && d.action) parts.push(d.action)
  if (typeof d.format === 'string') parts.push(d.format.toUpperCase())
  if (typeof d.conversations === 'number') parts.push(`${d.conversations} conversa(s)`)
  if (!parts.length && e.targetId) parts.push(`${e.targetType ?? 'item'} ${e.targetId.slice(-6)}`)
  return parts.join(' · ')
}

export function AuditLog() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (before?: string | null) => {
    try {
      const r = await fetch(`/api/audit?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`)
      if (!r.ok) throw new Error()
      const data = (await r.json()) as { entries: Entry[]; nextBefore: string | null }
      setEntries((prev) => (before && prev ? [...prev, ...data.entries] : data.entries))
      setNextBefore(data.nextBefore)
      setError(null)
    } catch {
      setError('Não foi possível carregar o registro.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="cartao" aria-labelledby="t-auditoria">
      <div className="cartao__cab">
        <div>
          <h2 id="t-auditoria"><History className="ic verde-txt" aria-hidden="true" />Registro de auditoria</h2>
          <p>
            Quem fez o quê nesta organização: papéis, configurações, regras, conexões, privacidade e quem abriu o conteúdo de cada conversa.
            Guarda só metadados — nunca o texto das mensagens nem telefones.
          </p>
        </div>
        <button className="btn btn--sm shrink-0" type="button" aria-label="Atualizar registro" onClick={() => void load()}>
          <RefreshCw className="ic" aria-hidden="true" />
        </button>
      </div>
      <div className="cartao__corpo">
        {error && <p role="alert" className="text-sm text-[var(--vermelho)]">{error}</p>}
        {!error && entries === null && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        )}
        {entries && entries.length === 0 && <p className="suave text-[13px]">Nenhuma ação registrada ainda.</p>}
        {entries && entries.length > 0 && (
          <>
            <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Registro de auditoria">
              <table className="tabela tabela--folgada" data-testid="audit-table">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">Quando</th>
                    <th>Quem</th>
                    <th>O quê</th>
                    <th className="hidden md:table-cell">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap suave">{fmt.format(new Date(e.createdAt))}</td>
                      <td>
                        <div className="forte break-all">{e.actorEmail}</div>
                        <span className="tag tag--cinza mt-1">{ROLE[e.actorRole] ?? e.actorRole}</span>
                      </td>
                      <td>
                        <div>{e.actionLabel}</div>
                        <div className="md:hidden suave">{describeDetails(e)}</div>
                      </td>
                      <td className="suave hidden md:table-cell">{describeDetails(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextBefore && (
              <div className="mt-3 flex justify-center">
                <button className="btn btn--sm" type="button" disabled={loadingMore} onClick={async () => { setLoadingMore(true); await load(nextBefore); setLoadingMore(false) }}>
                  {loadingMore ? 'Carregando…' : 'Carregar mais antigos'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
