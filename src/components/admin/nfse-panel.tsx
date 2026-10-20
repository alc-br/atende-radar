'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileText, Play, RotateCcw, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fetchMutation, MUTATION_ERROR_MESSAGE } from '@/lib/mutation'
import { cancelavel, mesCompetencia } from '@/lib/nfse/prazo'

// Notas fiscais (NFS-e Padrão Nacional) para o operador: como está configurado, a fila (emissão e cancelamento),
// o motivo de cada falha, nova tentativa, cancelamento manual e os XML. A emissão em si é automática (src/lib/nfse).

interface NfseConfig {
  enabled: boolean
  ambiente?: 'restrita' | 'producao'
  fake?: boolean
  cnpj?: string
  municipio?: string
  serie?: number
  cTribNac?: string
  desde?: string
  certificado?: { titular: string; cnpj: string | null; validoAte: string } | null
  error: string | null
}

interface NfseDoc {
  id: string
  organizationName: string
  providerInvoiceId: string
  ambiente: string
  status: string
  serie: number
  nDps: number | null
  amountCents: number
  competencia: string
  chave: string | null
  numero: string | null
  attempts: number
  nextAttemptAt: string
  lastError: string | null
  issuedAt: string | null
  cancelMotivo: string | null
  cancelReason: string | null
  canceledAt: string | null
  createdAt: string
  tomador: { nome: string; tipo: string; documento: string } | null
  files: { dps: boolean; nfse: boolean; evento: boolean }
}

interface NfseList {
  config: NfseConfig
  maxAttempts: number
  counts: Record<string, number>
  docs: NfseDoc[]
}

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Na fila', tone: 'tag--cinza' },
  issuing: { label: 'Emitindo', tone: 'tag--azul' },
  issued: { label: 'Emitida', tone: 'tag--verde' },
  failed: { label: 'Falha na emissão', tone: 'tag--vermelho' },
  cancel_pending: { label: 'Cancelamento na fila', tone: 'tag--ambar' },
  canceling: { label: 'Cancelando', tone: 'tag--ambar' },
  canceled: { label: 'Cancelada', tone: 'tag--roxo' },
  cancel_failed: { label: 'Falha no cancelamento', tone: 'tag--vermelho' },
  cancel_expired: { label: 'Reembolso fora do prazo', tone: 'tag--vermelho' },
  skipped: { label: 'Dispensada', tone: 'tag--cinza' },
}
const FILTROS = [['', 'Todas'], ['failed', 'Falhas'], ['issued', 'Emitidas'], ['canceled', 'Canceladas'], ['pending', 'Na fila'], ['cancel_expired', 'Fora do prazo']] as const
const MOTIVOS = [['erro', 'Erro na emissão'], ['naoPrestado', 'Serviço não prestado'], ['outros', 'Outros']] as const
const MOTIVO_LABEL: Record<string, string> = Object.fromEntries(MOTIVOS)

const statusTag = (s: string) => <span className={`tag ${STATUS[s]?.tone ?? 'tag--cinza'}`}>{STATUS[s]?.label ?? s}</span>
const fmtDateTime = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const docFmt = (t: NfseDoc['tomador']) =>
  !t ? '—' : t.tipo === 'CPF' ? t.documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : t.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')

export function NfsePanel() {
  const [filtro, setFiltro] = useState('')
  const [data, setData] = useState<NfseList | null>(null)
  const [erro, setErro] = useState(false)
  const [sel, setSel] = useState<NfseDoc | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState<string>('erro')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setErro(false)
    try {
      const res = await fetch(`/api/admin/nfse${filtro ? `?status=${filtro}` : ''}`)
      if (!res.ok) throw new Error(String(res.status))
      const d = (await res.json()) as NfseList
      setData(d)
      setSel((s) => (s ? d.docs.find((x) => x.id === s.id) ?? s : s))
    } catch {
      setErro(true)
    }
  }, [filtro])

  useEffect(() => { void carregar() }, [carregar])

  const acao = async (url: string, json: object, ok: string) => {
    setSalvando(true)
    try {
      await fetchMutation(url, { json })
      toast.success(ok)
      return true
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith('HTTP ') ? e.message : MUTATION_ERROR_MESSAGE)
      return false
    } finally {
      setSalvando(false)
      // a fila roda em segundo plano: recarrega agora e de novo logo depois para mostrar o resultado
      void carregar()
      setTimeout(() => void carregar(), 2500)
    }
  }

  const processar = () => acao('/api/admin/nfse', { action: 'run' }, 'Fila de notas processada.')
  const tentarDeNovo = (d: NfseDoc) => acao(`/api/admin/nfse/${d.id}`, { action: 'retry' }, 'Nova tentativa pedida.')
  const cancelar = async (d: NfseDoc) => {
    if (await acao(`/api/admin/nfse/${d.id}`, { action: 'cancel', motivo, texto }, 'Cancelamento pedido ao Sistema Nacional.')) {
      setCancelando(false)
      setTexto('')
    }
  }

  const cfg = data?.config
  const contagem = data?.counts ?? {}
  const falhas = (contagem.failed ?? 0) + (contagem.cancel_failed ?? 0)
  const foraPrazo = contagem.cancel_expired ?? 0
  const textoOk = texto.trim().length >= 15 && texto.trim().length <= 255

  return (
    <section className="cartao" aria-labelledby="t-nfse-admin" data-testid="admin-nfse">
      <div className="cartao__cab flex-wrap">
        <div>
          <h2 id="t-nfse-admin"><FileText className="ic verde-txt" aria-hidden="true" />Notas fiscais (NFS-e)</h2>
          <p>
            {(contagem.issued ?? 0) === 1 ? '1 emitida' : `${contagem.issued ?? 0} emitidas`}
            {' · '}{(contagem.canceled ?? 0) === 1 ? '1 cancelada' : `${contagem.canceled ?? 0} canceladas`}
            {' · '}{falhas === 1 ? '1 com falha' : `${falhas} com falha`}
            {foraPrazo > 0 && <span className="text-destructive">{' · '}{foraPrazo === 1 ? '1 reembolso fora do prazo de cancelamento' : `${foraPrazo} reembolsos fora do prazo de cancelamento`}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar notas">
            {FILTROS.map(([v, label]) => (
              <button key={v || 'all'} type="button" className={`btn btn--sm ${filtro === v ? 'btn--escuro' : ''}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>
                {label}
              </button>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" disabled={salvando || !cfg?.enabled} onClick={() => void processar()}>
            <Play className="ic" aria-hidden="true" />Processar agora
          </Button>
        </div>
      </div>
      <div className="cartao__corpo space-y-4">
        <div className="rounded-lg border p-3 text-sm" data-testid="nfse-config">
          {!cfg ? (
            <p className="suave">{erro ? 'Não foi possível carregar as notas.' : 'Carregando...'}</p>
          ) : !cfg.enabled ? (
            <p>
              <span className="tag tag--cinza">Desligada</span>{' '}
              {cfg.error ? <span className="text-destructive">Configuração com erro: {cfg.error}</span> : 'A emissão de notas está desligada (NFSE_AMBIENTE=off). Nenhuma nota é enviada.'}
            </p>
          ) : (
            <div className="grid gap-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className={`tag ${cfg.ambiente === 'producao' ? 'tag--verde' : 'tag--ambar'}`}>
                  {cfg.ambiente === 'producao' ? 'Produção (notas valem)' : 'Produção restrita (testes, sem valor fiscal)'}
                </span>
                {cfg.fake && <span className="tag tag--roxo">Sistema Nacional simulado</span>}
                <span className="suave">CNPJ {cfg.cnpj} · município {cfg.municipio} · série {cfg.serie} · serviço {cfg.cTribNac} · pagamentos desde {cfg.desde ? fmtDate(cfg.desde) : '—'}</span>
              </p>
              <p className="suave">
                Certificado: {cfg.certificado ? `${cfg.certificado.titular} (CNPJ ${cfg.certificado.cnpj ?? '—'}), válido até ${fmtDate(cfg.certificado.validoAte)}` : '—'}
              </p>
              {cfg.error && <p className="text-destructive">{cfg.error}</p>}
            </div>
          )}
        </div>

        <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Notas fiscais">
          <table className="tabela tabela--cab-cinza">
            <thead>
              <tr>
                <th>Empresa</th>
                <th className="hidden md:table-cell">Tomador</th>
                <th>Valor</th>
                <th>Situação</th>
                <th className="hidden sm:table-cell">Número</th>
                <th className="hidden lg:table-cell">Criada em</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.docs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="centro suave py-8">{!data ? (erro ? 'Não foi possível carregar as notas.' : 'Carregando...') : 'Nenhuma nota aqui.'}</td>
                </tr>
              ) : (
                data.docs.map((d) => (
                  <tr key={d.id} className="cursor-pointer" onClick={() => { setSel(d); setCancelando(false) }}>
                    <td>
                      <button type="button" className="forte text-left hover:underline" onClick={(e) => { e.stopPropagation(); setSel(d); setCancelando(false) }}>
                        {d.organizationName}
                      </button>
                      {d.lastError && (d.status === 'failed' || d.status === 'cancel_failed' || d.status === 'cancel_expired') && <p className="text-xs text-destructive line-clamp-2">{d.lastError}</p>}
                    </td>
                    <td className="hidden md:table-cell suave">{d.tomador?.nome ?? '—'}</td>
                    <td className="whitespace-nowrap">{brl(d.amountCents)}</td>
                    <td>{statusTag(d.status)}</td>
                    <td className="hidden sm:table-cell suave">{d.numero ?? '—'}</td>
                    <td className="hidden lg:table-cell suave whitespace-nowrap">{fmtDateTime(d.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!sel} onOpenChange={(open) => !open && setSel(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {sel && (
            <>
              <DialogHeader>
                <DialogTitle>Nota de {sel.organizationName}</DialogTitle>
                <DialogDescription>{brl(sel.amountCents)} · competência {fmtDate(sel.competencia)} · {sel.ambiente === 'producao' ? 'produção' : 'produção restrita'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap items-center gap-2" data-testid="nfse-status">
                  {statusTag(sel.status)}
                  {sel.issuedAt && <span className="text-muted-foreground">emitida em {fmtDateTime(sel.issuedAt)}</span>}
                  {sel.canceledAt && <span className="text-muted-foreground">· cancelada em {fmtDateTime(sel.canceledAt)}</span>}
                </div>
                {sel.lastError && (
                  <div className="rounded-lg border border-destructive p-3" role="alert">
                    <p className="font-bold">{sel.status === 'cancel_expired' ? 'Não pode mais ser cancelada' : `Último erro${sel.attempts ? ` (tentativa ${sel.attempts} de ${data?.maxAttempts ?? 6})` : ''}`}</p>
                    <p className="break-words">{sel.lastError}</p>
                    {(sel.status === 'failed' || sel.status === 'cancel_failed') && sel.attempts < (data?.maxAttempts ?? 6) && (
                      <p className="text-xs text-muted-foreground">Nova tentativa automática a partir de {fmtDateTime(sel.nextAttemptAt)}.</p>
                    )}
                  </div>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Tomador</dt><dd>{sel.tomador ? `${sel.tomador.nome} · ${sel.tomador.tipo} ${docFmt(sel.tomador)}` : '—'}</dd>
                  <dt className="text-muted-foreground">Número</dt><dd>{sel.numero ?? '—'}</dd>
                  <dt className="text-muted-foreground">Chave de acesso</dt><dd className="font-mono break-all">{sel.chave ?? '—'}</dd>
                  <dt className="text-muted-foreground">DPS</dt><dd>série {sel.serie}{sel.nDps ? `, nº ${sel.nDps}` : ''}</dd>
                  <dt className="text-muted-foreground">Fatura</dt><dd className="font-mono break-all">{sel.providerInvoiceId}</dd>
                  {sel.cancelMotivo && (<><dt className="text-muted-foreground">Cancelamento</dt><dd>{MOTIVO_LABEL[sel.cancelMotivo] ?? sel.cancelMotivo}{sel.cancelReason ? `: ${sel.cancelReason}` : ''}</dd></>)}
                </dl>

                {(sel.files.nfse || sel.files.dps || sel.files.evento) && (
                  <div className="flex flex-wrap gap-2">
                    {sel.files.nfse && <a className="btn btn--sm" href={`/api/admin/nfse/${sel.id}/xml?tipo=nfse`} download><Download className="ic" aria-hidden="true" />XML da nota</a>}
                    {sel.files.dps && <a className="btn btn--sm" href={`/api/admin/nfse/${sel.id}/xml?tipo=dps`} download><Download className="ic" aria-hidden="true" />XML da DPS</a>}
                    {sel.files.evento && <a className="btn btn--sm" href={`/api/admin/nfse/${sel.id}/xml?tipo=evento`} download><Download className="ic" aria-hidden="true" />XML do cancelamento</a>}
                  </div>
                )}

                {(sel.status === 'failed' || sel.status === 'cancel_failed') && (
                  <Button type="button" variant="outline" className="w-full" disabled={salvando} onClick={() => void tentarDeNovo(sel)}>
                    <RotateCcw className="ic" aria-hidden="true" />Tentar novamente agora
                  </Button>
                )}

                {sel.status === 'issued' && !cancelavel(new Date(sel.competencia)) && (
                  <p className="text-xs text-muted-foreground">O prazo de cancelamento acabou: a nota é da competência de {mesCompetencia(new Date(sel.competencia))} e só podia ser cancelada dentro desse mês. Fale com a contabilidade.</p>
                )}
                {sel.status === 'issued' && cancelavel(new Date(sel.competencia)) && !cancelando && (
                  <Button type="button" variant="outline" className="w-full" disabled={salvando} onClick={() => setCancelando(true)}>
                    <XCircle className="ic" aria-hidden="true" />Cancelar esta nota
                  </Button>
                )}
                {sel.status === 'issued' && cancelando && (
                  <form className="grid gap-2 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); if (textoOk) void cancelar(sel) }} aria-label="Cancelar nota">
                    <label htmlFor="nfse-motivo" className="text-[14px] font-bold">Motivo do cancelamento</label>
                    <select id="nfse-motivo" className="flex h-10 w-full rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie)] px-3 text-sm" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                      {MOTIVOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <label htmlFor="nfse-texto" className="text-[14px] font-bold">Explicação (15 a 255 caracteres, vai para o Sistema Nacional)</label>
                    <textarea id="nfse-texto" className="area" rows={3} maxLength={255} value={texto} onChange={(e) => setTexto(e.target.value)} />
                    <p className="text-xs text-muted-foreground">{texto.trim().length}/255 · o cancelamento não pode ser desfeito.</p>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setCancelando(false)}>Voltar</Button>
                      <Button type="submit" variant="destructive" className="flex-1" disabled={salvando || !textoOk}>Confirmar cancelamento</Button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
