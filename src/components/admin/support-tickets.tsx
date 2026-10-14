'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LifeBuoy, Send } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fetchMutation, mutate, MUTATION_ERROR_MESSAGE } from '@/lib/mutation'
import { REPLY_MAX, supportStatusLabel, supportStatusTone } from '@/lib/support'

// Chamados de "Falar com o suporte" (P8) para o operador da plataforma: lista, detalhe, responder por e-mail,
// fechar e reabrir. Situação: aberto → respondido (resposta enviada) → fechado.

interface AdminTicket {
  id: string
  organization: { id: string; name: string }
  authorName: string
  authorEmail: string
  subject: string
  message: string
  appVersion: string | null
  screen: string | null
  userAgent: string | null
  hasScreenshot: boolean
  screenshotSize: number | null
  status: string
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
}

interface TicketReply {
  id: string
  text: string
  to: string
  emailStatus: string
  sentAt: string | null
  createdAt: string
}

type Filtro = 'open' | 'answered' | 'resolved' | 'all'

const formatDateTime = (d: string) =>
  new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const statusTag = (status: string) => <span className={`tag ${supportStatusTone(status)}`}>{supportStatusLabel(status)}</span>

const EMAIL_STATUS: Record<string, string> = { sent: 'e-mail enviado', queued: 'e-mail na fila', failed: 'e-mail falhou (nova tentativa automática)', sending: 'enviando e-mail' }

export function SupportTickets() {
  const [filtro, setFiltro] = useState<Filtro>('open')
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null)
  const [abertos, setAbertos] = useState(0)
  const [erro, setErro] = useState(false)
  const [selecionado, setSelecionado] = useState<AdminTicket | null>(null)
  const [respostas, setRespostas] = useState<TicketReply[]>([])
  const [resposta, setResposta] = useState('')
  const [fecharAoResponder, setFecharAoResponder] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async (): Promise<AdminTicket[] | null> => {
    setErro(false)
    try {
      const res = await fetch(`/api/admin/support${filtro === 'all' ? '' : `?status=${filtro}`}`)
      if (!res.ok) throw new Error(String(res.status))
      const d = (await res.json()) as { tickets: AdminTicket[]; open: number }
      setTickets(d.tickets)
      setAbertos(d.open)
      return d.tickets
    } catch {
      setErro(true)
      setTickets([])
      return null
    }
  }, [filtro])

  useEffect(() => { void carregar() }, [carregar])

  const abrir = async (t: AdminTicket) => {
    setSelecionado(t)
    setRespostas([])
    setResposta('')
    setFecharAoResponder(false)
    try {
      const res = await fetch(`/api/admin/support/${t.id}`)
      if (res.ok) {
        const d = (await res.json()) as { ticket: AdminTicket; replies: TicketReply[] }
        setSelecionado(d.ticket)
        setRespostas(d.replies)
      }
    } catch { /* fica o que veio da lista */ }
  }

  const alterarStatus = async (t: AdminTicket, status: 'open' | 'resolved') => {
    setSalvando(true)
    const ok = await mutate(`/api/admin/support/${t.id}`, { method: 'PATCH', json: { status } }, { onSettled: carregar })
    setSalvando(false)
    if (ok) setSelecionado({ ...t, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : null })
  }

  const responder = async (t: AdminTicket) => {
    if (!resposta.trim()) return
    setSalvando(true)
    try {
      const res = await fetchMutation(`/api/admin/support/${t.id}/reply`, { json: { message: resposta, close: fecharAoResponder } })
      const d = (await res.json()) as { ticket: AdminTicket; replies: TicketReply[]; emailStatus: string }
      setSelecionado(d.ticket)
      setRespostas(d.replies)
      setResposta('')
      setFecharAoResponder(false)
      if (d.emailStatus === 'sent') toast.success(`Resposta enviada por e-mail para ${t.authorEmail}.`)
      else if (d.emailStatus === 'queued') toast.warning('Resposta registrada, mas o e-mail ficou na fila: o provedor de e-mail não está configurado.')
      else toast.error('Resposta registrada, mas o e-mail não foi entregue. O sistema tenta de novo sozinho.')
      void carregar()
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith('HTTP ') ? e.message : MUTATION_ERROR_MESSAGE)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="cartao" aria-labelledby="t-suporte-admin" data-testid="admin-suporte">
      <div className="cartao__cab flex-wrap">
        <div>
          <h2 id="t-suporte-admin"><LifeBuoy className="ic verde-txt" aria-hidden="true" />Chamados de suporte</h2>
          <p>{abertos === 1 ? '1 chamado aberto' : `${abertos} chamados abertos`}</p>
        </div>
        <div className="abas" role="group" aria-label="Filtrar chamados">
          {([['open', 'Abertos'], ['answered', 'Respondidos'], ['resolved', 'Fechados'], ['all', 'Todos']] as const).map(([v, label]) => (
            <button key={v} type="button" className={`btn btn--sm ${filtro === v ? 'btn--escuro' : ''}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="cartao__corpo">
        <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Chamados de suporte">
          <table className="tabela tabela--cab-cinza">
            <thead>
              <tr>
                <th>Assunto</th>
                <th className="hidden md:table-cell">Empresa</th>
                <th className="hidden lg:table-cell">Autor</th>
                <th>Status</th>
                <th className="hidden sm:table-cell">Recebido em</th>
              </tr>
            </thead>
            <tbody>
              {!tickets || tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="centro suave py-8">
                    {!tickets ? 'Carregando...' : erro ? 'Não foi possível carregar os chamados.' : 'Nenhum chamado aqui.'}
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} className="cursor-pointer" onClick={() => void abrir(t)}>
                    <td>
                      <button type="button" className="forte text-left hover:underline" onClick={(e) => { e.stopPropagation(); void abrir(t) }}>
                        {t.subject}
                      </button>
                    </td>
                    <td className="hidden md:table-cell suave">{t.organization.name}</td>
                    <td className="hidden lg:table-cell suave">{t.authorName}</td>
                    <td>{statusTag(t.status)}</td>
                    <td className="hidden sm:table-cell suave whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selecionado} onOpenChange={(open) => !open && setSelecionado(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selecionado && (
            <>
              <DialogHeader>
                <DialogTitle>{selecionado.subject}</DialogTitle>
                <DialogDescription>
                  {selecionado.organization.name} · {selecionado.authorName} ({selecionado.authorEmail})
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap items-center gap-2" data-testid="chamado-status">
                  {statusTag(selecionado.status)}
                  <span className="text-muted-foreground">Recebido em {formatDateTime(selecionado.createdAt)}</span>
                  {selecionado.resolvedAt && <span className="text-muted-foreground">· fechado em {formatDateTime(selecionado.resolvedAt)}</span>}
                </div>
                <p className="whitespace-pre-wrap break-words">{selecionado.message}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Versão</dt><dd className="font-mono">{selecionado.appVersion || '—'}</dd>
                  <dt className="text-muted-foreground">Tela</dt><dd>{selecionado.screen || '—'}</dd>
                  <dt className="text-muted-foreground">Navegador</dt><dd className="break-all">{selecionado.userAgent || '—'}</dd>
                </dl>
                {selecionado.hasScreenshot && (
                  <a href={`/api/admin/support/${selecionado.id}/screenshot`} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={`/api/admin/support/${selecionado.id}/screenshot`}
                      alt="Captura de tela enviada no chamado"
                      className="max-h-[360px] w-full rounded-lg border object-contain"
                    />
                  </a>
                )}

                {respostas.length > 0 && (
                  <div className="grid gap-2">
                    <h3 className="text-[14px] font-bold">Respostas enviadas</h3>
                    <ol className="grid gap-2" aria-label="Respostas enviadas">
                      {respostas.map((r) => (
                        <li key={r.id} className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(r.createdAt)} · para {r.to} · {EMAIL_STATUS[r.emailStatus] ?? r.emailStatus}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words">{r.text}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="grid gap-2">
                  <label htmlFor="resposta-chamado" className="text-[14px] font-bold">Responder por e-mail</label>
                  <textarea
                    className="area"
                    id="resposta-chamado"
                    rows={5}
                    maxLength={REPLY_MAX}
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    placeholder={`A resposta vai para ${selecionado.authorEmail}`}
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={fecharAoResponder} onChange={(e) => setFecharAoResponder(e.target.checked)} />
                    Fechar o chamado ao enviar
                  </label>
                  <Button type="button" disabled={salvando || !resposta.trim()} onClick={() => void responder(selecionado)}>
                    <Send className="ic" aria-hidden="true" />{salvando ? 'Enviando...' : 'Enviar resposta'}
                  </Button>
                </div>

                <div className="flex gap-2">
                  {selecionado.status === 'resolved' ? (
                    <Button type="button" variant="outline" className="flex-1" disabled={salvando} onClick={() => void alterarStatus(selecionado, 'open')}>
                      Reabrir chamado
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="flex-1" disabled={salvando} onClick={() => void alterarStatus(selecionado, 'resolved')}>
                      Fechar chamado
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
