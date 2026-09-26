'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />Registro de auditoria</CardTitle>
          <CardDescription>
            Quem fez o quê nesta organização: papéis, configurações, regras, conexões, privacidade e quem abriu o conteúdo de cada conversa.
            Guarda só metadados — nunca o texto das mensagens nem telefones.
          </CardDescription>
        </div>
        <Button aria-label="Atualizar registro" variant="outline" size="icon" className="shrink-0" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        {!error && entries === null && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        )}
        {entries && entries.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>}
        {entries && entries.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <Table data-testid="audit-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs whitespace-nowrap">Quando</TableHead>
                    <TableHead className="text-xs">Quem</TableHead>
                    <TableHead className="text-xs">O quê</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmt.format(new Date(e.createdAt))}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium break-all">{e.actorEmail}</div>
                        <Badge variant="secondary" className="mt-0.5 text-[10px]">{ROLE[e.actorRole] ?? e.actorRole}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{e.actionLabel}</div>
                        <div className="md:hidden text-muted-foreground">{describeDetails(e)}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{describeDetails(e)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {nextBefore && (
              <div className="mt-3 flex justify-center">
                <Button variant="outline" size="sm" disabled={loadingMore} onClick={async () => { setLoadingMore(true); await load(nextBefore); setLoadingMore(false) }}>
                  {loadingMore ? 'Carregando…' : 'Carregar mais antigos'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
