'use client'

import { useEffect, useState, useCallback } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  FileText, Download, Settings2, Clock, Users, FileSpreadsheet, FileJson, FileDown, RefreshCw,
  CircleAlert, CircleCheck, Loader2, Hourglass, LayoutGrid, History, Calendar, Play, Database,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { fetchMutation, MutationError, MUTATION_ERROR_MESSAGE } from '@/lib/mutation'

/** Nome legível do fuso da empresa (o agendamento vale nele). */
function timezoneLabel(tz: string) {
  return tz === 'America/Sao_Paulo' ? 'horário de Brasília' : `fuso ${tz.replace(/_/g, ' ')}`
}

// Ícone e tom de cada tipo de relatório (mesma linguagem visual do pacote de design).
const reportIcons: Record<string, { icon: React.ReactNode; tom: string }> = {
  agent: { icon: <Users className="ic" aria-hidden="true" />, tom: 'tom-verde' },
  connections: { icon: <FileText className="ic" aria-hidden="true" />, tom: 'tom-azul' },
  daily: { icon: <Clock className="ic" aria-hidden="true" />, tom: 'tom-roxo' },
  data_quality: { icon: <Database className="ic" aria-hidden="true" />, tom: 'tom-laranja' },
  lost_opportunities: { icon: <CircleAlert className="ic" aria-hidden="true" />, tom: 'tom-vermelho' },
  promises: { icon: <CircleCheck className="ic" aria-hidden="true" />, tom: 'tom-verde' },
  recovery: { icon: <RefreshCw className="ic" aria-hidden="true" />, tom: 'tom-laranja' },
  weekly: { icon: <FileText className="ic" aria-hidden="true" />, tom: 'tom-azul' },
}

function getStatusTag(status: string) {
  switch (status) {
    case 'completed':
      return <span className="tag tag--verde"><CircleCheck className="ic" aria-hidden="true" />Concluído</span>
    case 'processing':
      return <span className="tag tag--azul"><Loader2 className="ic animate-spin" aria-hidden="true" />Processando</span>
    case 'pending':
      return <span className="tag tag--ambar"><Hourglass className="ic" aria-hidden="true" />Pendente</span>
    case 'failed':
      return <span className="tag tag--vermelho"><CircleAlert className="ic" aria-hidden="true" />Falhou</span>
    default:
      return <span className="tag tag--cinza">{status}</span>
  }
}

// Exportações contam na cota do plano: o download passa por fetch para, se a cota acabou (402), mostrar o motivo em
// vez de baixar um arquivo com o JSON do erro. O href continua no link (abrir em nova aba, testes).
async function downloadExport(e: React.MouseEvent<HTMLAnchorElement>, fallbackName: string) {
  e.preventDefault()
  const href = e.currentTarget.href
  try {
    const res = await fetch(href)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      toast.error(data?.error || 'Não foi possível exportar. Tente de novo.')
      return
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch {
    toast.error('Não foi possível exportar. Verifique a conexão e tente de novo.')
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ReportsView() {
  const [configDialogOpen, setConfigDialogOpen] = useState<string | null>(null)
  const [configSchedule, setConfigSchedule] = useState('')
  const [configRecipients, setConfigRecipients] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState<string>('all')
  const [tab, setTab] = useState('types')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportTypesData, setReportTypesData] = useState<any[]>([])
  const [reportHistoryData, setReportHistoryData] = useState<any[]>([])
  const [orgTimezone, setOrgTimezone] = useState('America/Sao_Paulo')
  const [busyRunId, setBusyRunId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      const res = await fetch('/api/reports')
      if (!res.ok) throw new Error('Erro ao carregar relatórios')
      const data = await res.json()
      setReportTypesData((data.definitions || []).map((d: any) => ({
        id: d.id, name: d.name, description: d.description,
        schedule: d.schedule, recipients: d.recipients || [], lastRun: d.lastRun,
      })))
      setReportHistoryData(data.history || [])
      if (typeof data.timezone === 'string' && data.timezone) setOrgTimezone(data.timezone)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleGenerate = async (reportTypeId: string) => {
    setGeneratingId(reportTypeId)
    try {
      const periodEnd = new Date()
      const periodStart = new Date()
      periodStart.setDate(periodStart.getDate() - 7)
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportTypeId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        }),
      })
      if (!res.ok) throw new Error('Erro ao gerar relatório')
      const created = await res.json().catch(() => null)
      const runId = created?.reportRun?.id
      toast.success('Relatório gerado.', runId ? {
        action: { label: 'Abrir', onClick: () => window.open(`/api/reports/runs/${runId}/download?format=html`, '_blank', 'noopener') },
      } : undefined)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar relatório')
    } finally {
      setGeneratingId(null)
    }
  }

  const openConfig = (report: { id: string; schedule: string; recipients: string[] }) => {
    setConfigSchedule(report.schedule || '')
    setConfigRecipients(report.recipients.join('\n'))
    setConfigDialogOpen(report.id)
  }

  // Reenviar (e-mail com o PDF aos destinatários) e "Tentar novamente" (gera de novo o que falhou): ações do histórico.
  const handleRunAction = async (runId: string, action: 'send' | 'retry') => {
    setBusyRunId(runId)
    try {
      const res = await fetchMutation(`/api/reports/runs/${runId}/${action}`)
      const data = await res.json().catch(() => null)
      if (action === 'send') {
        toast.success(data?.emailStatus === 'failed' ? 'O envio falhou. Veja as notificações.' : `Relatório reenviado para ${data?.emails ?? 0} destinatário(s).`)
      } else {
        toast.success('Relatório gerado de novo.')
      }
    } catch (e) {
      toast.error(e instanceof MutationError ? e.message : MUTATION_ERROR_MESSAGE)
    } finally {
      setBusyRunId(null)
      fetchData()
    }
  }

  const handleSaveConfig = async (reportTypeId: string) => {
    setSavingConfig(true)
    try {
      const res = await fetch(`/api/reports/${reportTypeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule: configSchedule,
          recipients: configRecipients.split('\n').map((r) => r.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Erro ao salvar configuração')
      toast.success('Configuração salva.')
      setConfigDialogOpen(null)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar configuração')
    } finally {
      setSavingConfig(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="grade grade-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="cartao vazio" role="alert">
        <CircleAlert className="ic" aria-hidden="true" />
        <strong>{error}</strong>
        <button type="button" className="btn mt-3" onClick={fetchData}>
          <RefreshCw className="ic" aria-hidden="true" />Tentar novamente
        </button>
      </div>
    )
  }

  const filteredHistory = historyFilter === 'all'
    ? reportHistoryData
    : reportHistoryData.filter((r: any) => r.reportTypeId === historyFilter)

  return (
    <>
      <div className="cab-pagina">
        <div>
          <h1>Relatórios</h1>
          <p>Gere e gerencie relatórios automáticos de auditoria e qualidade para acompanhar o desempenho do seu atendimento no WhatsApp.</p>
        </div>
        <div className="cab-pagina__acoes">
          <a className="btn btn--lg" href="/api/reports/export?format=csv" download onClick={(e) => downloadExport(e, 'atenderadar-indicadores.csv')}>
            <FileSpreadsheet className="ic" aria-hidden="true" />Indicadores (CSV)
          </a>
          <a className="btn btn--lg" href="/api/reports/export?format=xlsx" download="atenderadar-indicadores.xlsx" onClick={(e) => downloadExport(e, 'atenderadar-indicadores.xlsx')}>
            <FileSpreadsheet className="ic" aria-hidden="true" />Indicadores (XLSX)
          </a>
          <a className="btn btn--lg" href="/api/reports/export?format=json" download="atenderadar-indicadores.json" onClick={(e) => downloadExport(e, 'atenderadar-indicadores.json')}>
            <FileJson className="ic" aria-hidden="true" />Indicadores (JSON)
          </a>
        </div>
      </div>

      <TabsPrimitive.Root value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <TabsPrimitive.List data-tour="reports-tabs" className="abas-caixa abas-relatorio" aria-label="Relatórios">
          <TabsPrimitive.Trigger value="types" className="aba">
            <LayoutGrid className="ic" aria-hidden="true" />Tipos de Relatório
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="history" className="aba">
            <History className="ic" aria-hidden="true" />Histórico
          </TabsPrimitive.Trigger>
        </TabsPrimitive.List>

        {/* ========== TIPOS DE RELATÓRIO ========== */}
        <TabsPrimitive.Content value="types" data-tour="reports-types" className="grade grade-4 relatorios">
          {reportTypesData.length === 0 && (
            <div className="cartao vazio col-span-full">
              <FileText className="ic" aria-hidden="true" />
              <strong>Nenhum tipo de relatório disponível</strong>
            </div>
          )}
          {reportTypesData.map((report) => {
            const visual = reportIcons[report.id] || { icon: <FileText className="ic" aria-hidden="true" />, tom: 'tom-verde' }
            const generating = generatingId === report.id
            return (
              <article key={report.id} className="cartao relatorio">
                <header className="relatorio__cab">
                  <span className={`kpi__icone ${visual.tom}`}>{visual.icon}</span>
                  <h2>{report.name}</h2>
                </header>
                <p className="relatorio__desc">{report.description}</p>
                <ul className="relatorio__meta">
                  <li><Clock className="ic" aria-hidden="true" />Agendamento: <b>{report.schedule || '—'}</b></li>
                  <li><Calendar className="ic" aria-hidden="true" />Última execução: <b>{report.lastRun ? timeAgo(report.lastRun) : 'Nunca'}</b></li>
                  <li><Users className="ic" aria-hidden="true" />Destinatários: <b>{report.recipients.length}</b></li>
                </ul>
                <div className="relatorio__acoes">
                  <button
                    type="button"
                    className="btn btn--escuro"
                    disabled={generating}
                    onClick={() => handleGenerate(report.id)}
                  >
                    {generating
                      ? <Loader2 className="ic animate-spin" aria-hidden="true" />
                      : <Play className="ic" aria-hidden="true" />}
                    Gerar agora
                  </button>
                  <Dialog open={configDialogOpen === report.id} onOpenChange={(open) => open ? openConfig(report) : setConfigDialogOpen(null)}>
                    <DialogTrigger asChild>
                      <button type="button" className="btn">
                        <Settings2 className="ic" aria-hidden="true" />Configurar
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Configurar: {report.name}</DialogTitle>
                        <DialogDescription>
                          No horário agendado ({timezoneLabel(orgTimezone)}, o fuso da empresa) o relatório é gerado e cada
                          destinatário recebe o resumo por e-mail, com o PDF executivo em anexo. Deixe o horário vazio para não
                          enviar automaticamente.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label htmlFor={`rel-agenda-${report.id}`} className="text-sm font-medium">Agendamento</label>
                          <Input
                            id={`rel-agenda-${report.id}`}
                            type="time"
                            value={configSchedule}
                            onChange={(e) => setConfigSchedule(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor={`rel-dest-${report.id}`} className="text-sm font-medium">Destinatários (um por linha)</label>
                          <Textarea
                            id={`rel-dest-${report.id}`}
                            className="min-h-[80px]"
                            value={configRecipients}
                            onChange={(e) => setConfigRecipients(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setConfigDialogOpen(null)}>Cancelar</Button>
                        <Button disabled={savingConfig} onClick={() => handleSaveConfig(report.id)}>
                          Salvar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </article>
            )
          })}
        </TabsPrimitive.Content>

        {/* ========== HISTÓRICO ========== */}
        <TabsPrimitive.Content value="history">
          <div className="cartao">
            <div className="cartao__cab flex-wrap">
              <div>
                <h2>Histórico de Relatórios</h2>
                <p>Últimas gerações e seus status.</p>
              </div>
              <Select value={historyFilter} onValueChange={setHistoryFilter}>
                <SelectTrigger aria-label="Filtrar por tipo" className="w-[220px] max-w-full">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {reportTypesData.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Histórico de relatórios">
              <table className="tabela tabela--folgada">
                <thead>
                  <tr>
                    <th>Relatório</th>
                    <th>Gerado em</th>
                    <th>Período</th>
                    <th>Status</th>
                    <th>Enviado para</th>
                    <th className="direita">Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.type}</strong></td>
                      <td title={row.createdAt ? timeAgo(row.createdAt) : undefined}>{formatDateTime(row.createdAt)}</td>
                      <td>{row.period}</td>
                      <td title={row.error || undefined}>
                        {getStatusTag(row.status)}
                        {row.emailStatus === 'failed' && <span className="tag tag--vermelho ml-1"><CircleAlert className="ic" aria-hidden="true" />E-mail falhou</span>}
                      </td>
                      <td>{(row.recipients?.length ?? 0) === 1 ? row.recipients[0] : `${row.recipients?.length ?? 0} destinatário(s)`}</td>
                      <td className="direita">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {row.status === 'completed' && (
                            <>
                              <a
                                className="btn btn--sm"
                                href={`/api/reports/runs/${row.id}/download?format=csv`}
                                download
                                onClick={(e) => downloadExport(e, `atenderadar-${row.id}.csv`)}
                                aria-label="Baixar CSV"
                                title="Baixar CSV (Excel)"
                              >
                                <Download className="ic" aria-hidden="true" />CSV
                              </a>
                              <a
                                className="btn btn--sm"
                                href={`/api/reports/runs/${row.id}/download?format=html`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Abrir relatório"
                                title="Abrir para ler ou salvar em PDF"
                              >
                                <FileDown className="ic" aria-hidden="true" />Abrir
                              </a>
                              {(['xlsx', 'pdf', 'json'] as const).map((fmt) => (
                                <a
                                  key={fmt}
                                  className="btn btn--sm"
                                  href={`/api/reports/runs/${row.id}/download?format=${fmt}`}
                                  download
                                  onClick={(e) => downloadExport(e, `atenderadar-${row.id}.${fmt}`)}
                                  aria-label={`Baixar ${fmt.toUpperCase()}`}
                                  title={fmt === 'xlsx' ? 'Baixar planilha (Excel)' : fmt === 'pdf' ? 'Baixar PDF executivo' : 'Baixar dados em JSON'}
                                >
                                  <Download className="ic" aria-hidden="true" />{fmt.toUpperCase()}
                                </a>
                              ))}
                              {(row.recipients?.length ?? 0) > 0 && row.emailStatus !== 'failed' && (
                                <button
                                  type="button"
                                  className="btn btn--sm"
                                  aria-label="Reenviar por e-mail"
                                  title="Reenviar por e-mail aos destinatários, com o PDF em anexo"
                                  disabled={busyRunId === row.id}
                                  onClick={() => handleRunAction(row.id, 'send')}
                                >
                                  <RefreshCw className="ic" aria-hidden="true" />Reenviar
                                </button>
                              )}
                            </>
                          )}
                          {(row.status === 'failed' || row.emailStatus === 'failed') && (
                            <button
                              type="button"
                              className="btn btn--sm"
                              aria-label="Tentar novamente"
                              title={row.error ? `Tentar novamente. Erro: ${row.error}` : 'Tentar novamente'}
                              disabled={busyRunId === row.id}
                              onClick={() => handleRunAction(row.id, 'retry')}
                            >
                              <RefreshCw className="ic" aria-hidden="true" />Tentar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="vazio">Nenhum relatório encontrado para este filtro.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </>
  )
}
