'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  FileText, Download, Send, Settings2, Clock, Users, FileSpreadsheet,
  FileJson, FileDown, RefreshCw, AlertCircle, CheckCircle2, Loader2, Hourglass,
  LayoutGrid, History, ChevronDown,
} from 'lucide-react'
import { timeAgo } from '@/lib/mock-data'
import { Skeleton } from '@/components/ui/skeleton'

const reportIcons: Record<string, React.ReactNode> = {
  daily: <Clock className="h-5 w-5" />,
  weekly: <FileText className="h-5 w-5" />,
  agent: <Users className="h-5 w-5" />,
  lost_opportunities: <AlertCircle className="h-5 w-5" />,
  promises: <CheckCircle2 className="h-5 w-5" />,
  recovery: <RefreshCw className="h-5 w-5" />,
  data_quality: <Settings2 className="h-5 w-5" />,
  connections: <FileText className="h-5 w-5" />,
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50"><CheckCircle2 className="h-3 w-3 mr-1" />Concluído</Badge>
    case 'processing':
      return <Badge variant="outline" className="border-sky-300 text-sky-700 bg-sky-50"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processando</Badge>
    case 'pending':
      return <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50"><Hourglass className="h-3 w-3 mr-1" />Pendente</Badge>
    case 'failed':
      return <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50"><AlertCircle className="h-3 w-3 mr-1" />Falhou</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function ReportsView() {
  const [configDialogOpen, setConfigDialogOpen] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportTypesData, setReportTypesData] = useState<any[]>([])
  const [reportHistoryData, setReportHistoryData] = useState<any[]>([])

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (isLoading) return <div className="flex flex-col gap-4 p-4 md:p-6"><Skeleton className="h-8 w-48" /><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}</div></div>
  if (error) return <div className="flex flex-col items-center justify-center h-96 gap-4"><p className="text-destructive font-medium">{error}</p><button onClick={fetchData} className="text-sm text-primary underline">Tentar novamente</button></div>

  const filteredHistory = historyFilter === 'all'
    ? reportHistoryData
    : reportHistoryData.filter((r: any) => r.reportTypeId === historyFilter)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere e gerencie relatórios automáticos de auditoria e qualidade.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileJson className="h-4 w-4" />
            CSV indicadores
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" />
            XLSX relatórios
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileDown className="h-4 w-4" />
            PDF executivo
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileJson className="h-4 w-4" />
            JSON API
          </Button>
        </div>
      </div>

      <Tabs defaultValue="types" className="w-full">
        <TabsList>
          <TabsTrigger value="types" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" />
            Tipos de Relatório
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ========== REPORT TYPES GRID ========== */}
        <TabsContent value="types" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {reportTypesData.map((report) => (
              <Card key={report.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                        {reportIcons[report.id] || <FileText className="h-5 w-5" />}
                      </div>
                      <CardTitle className="text-sm font-semibold leading-tight">{report.name}</CardTitle>
                    </div>
                  </div>
                  <CardDescription className="text-xs mt-1.5">
                    {report.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end gap-3">
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Agendamento: <span className="font-medium text-foreground">{report.schedule}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Última execução: <span className="font-medium text-foreground">{report.lastRun ? timeAgo(report.lastRun) : 'Nunca'}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      <span>Destinatários: <span className="font-medium text-foreground">{report.recipients.length}</span></span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Gerar agora
                    </Button>
                    <Dialog open={configDialogOpen === report.id} onOpenChange={(open) => setConfigDialogOpen(open ? report.id : null)}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Settings2 className="h-3.5 w-3.5" />
                          Configurar
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Configurar: {report.name}</DialogTitle>
                          <DialogDescription>
                            Ajuste o agendamento e destinatários deste relatório.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Agendamento</label>
                            <input
                              type="text"
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                              defaultValue={report.schedule}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Destinatários (um por linha)</label>
                            <textarea
                              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                              defaultValue={report.recipients.join('\n')}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setConfigDialogOpen(null)}>Cancelar</Button>
                          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConfigDialogOpen(null)}>Salvar</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ========== REPORT HISTORY TABLE ========== */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Histórico de Relatórios</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Últimas gerações e seus status.</CardDescription>
                </div>
                <Select value={historyFilter} onValueChange={setHistoryFilter}>
                  <SelectTrigger className="w-[200px] h-8 text-xs">
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
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[calc(100vh-340px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Período</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Destinatários</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm font-medium">{row.type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.period}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                          {row.recipients.length} destinatário(s)
                        </TableCell>
                        <TableCell>{getStatusBadge(row.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.createdAt ? timeAgo(row.createdAt) : '—'}
                          {row.fileSize && (
                            <span className="ml-1.5 text-xs text-muted-foreground">({row.fileSize})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {row.status === 'completed' && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Download">
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Reenviar">
                                  <Send className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {row.status === 'failed' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Tentar novamente">
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredHistory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                          Nenhum relatório encontrado para este filtro.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
