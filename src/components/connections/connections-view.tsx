'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Plus, Wifi, WifiOff, AlertTriangle, MessageSquare, RefreshCw, QrCode,
  Pause, Play, TestTube, Pencil, Stethoscope, Unplug, Trash2, ChevronDown, ChevronUp,
  Activity, Clock, HardDrive, Zap, Shield, Server, CheckCircle2, XCircle, Info,
} from 'lucide-react'
import { connections, connectionDiagnostics, timeAgo } from '@/lib/mock-data'

const statusConfig: Record<string, { label: string; color: string; dotColor: string }> = {
  pending:      { label: 'Pendente',       color: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600', dotColor: 'bg-gray-400' },
  qr_required:  { label: 'QR necessário',  color: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700', dotColor: 'bg-amber-500' },
  connecting:   { label: 'Conectando',      color: 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-700', dotColor: 'bg-sky-500' },
  syncing:      { label: 'Sincronizando',   color: 'bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-700', dotColor: 'bg-cyan-500' },
  connected:    { label: 'Conectada',       color: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700', dotColor: 'bg-emerald-500' },
  degraded:     { label: 'Degradada',       color: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700', dotColor: 'bg-orange-500' },
  disconnected: { label: 'Desconectada',    color: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700', dotColor: 'bg-red-500' },
  logged_out:   { label: 'Desconectada',    color: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600', dotColor: 'bg-gray-400' },
  blocked:      { label: 'Bloqueada',       color: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700', dotColor: 'bg-red-500' },
  error:        { label: 'Erro',            color: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700', dotColor: 'bg-red-500' },
  disabled:     { label: 'Desabilitada',    color: 'bg-muted text-muted-foreground border-muted-foreground/30', dotColor: 'bg-muted-foreground' },
}

function QualityDots({ quality }: { quality: 'good' | 'medium' | 'bad' | null }) {
  if (!quality) return <span className="text-xs text-muted-foreground">—</span>
  const colors = quality === 'good'
    ? ['bg-emerald-500', 'bg-emerald-500', 'bg-emerald-500']
    : quality === 'medium'
      ? ['bg-amber-500', 'bg-amber-500', 'bg-gray-300 dark:bg-gray-600']
      : ['bg-red-500', 'bg-gray-300 dark:bg-gray-600', 'bg-gray-300 dark:bg-gray-600']
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-help">
            {colors.map((c, i) => (
              <div key={i} className={`h-2 w-2 rounded-full ${c}`} />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{quality === 'good' ? 'Boa qualidade' : quality === 'medium' ? 'Qualidade média' : 'Baixa qualidade'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default function ConnectionsView() {
  const [newConnDialogOpen, setNewConnDialogOpen] = useState(false)
  const [newConnName, setNewConnName] = useState('')
  const [newConnAck, setNewConnAck] = useState(false)
  const [expandedDiag, setExpandedDiag] = useState<string | null>(null)
  const [localPaused, setLocalPaused] = useState<Record<string, boolean>>({})

  const connectedCount = connections.filter(c => c.status === 'connected').length
  const disconnectedCount = connections.filter(c => ['disconnected', 'logged_out', 'blocked', 'error'].includes(c.status)).length
  const problemCount = connections.filter(c => ['degraded', 'syncing', 'qr_required', 'connecting'].includes(c.status)).length
  const totalMessages24h = connections.reduce((sum, c) => sum + Math.floor(c.messageCount * 0.15), 0)

  const togglePause = (connId: string) => {
    setLocalPaused(prev => ({ ...prev, [connId]: !prev[connId] }))
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conexões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie as conexões WhatsApp e monitore sua saúde operacional.
          </p>
        </div>
        <Dialog open={newConnDialogOpen} onOpenChange={setNewConnDialogOpen}>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setNewConnDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova conexão
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
              <DialogDescription>
                Adicione um novo número WhatsApp para monitoramento.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome da conexão</label>
                <input
                  type="text"
                  placeholder="Ex: Recepção Filial 2"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                  value={newConnName}
                  onChange={(e) => setNewConnName(e.target.value)}
                />
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs">
                  Esta integração utiliza bibliotecas de código aberto (Baileys) e <strong>não possui parceria oficial com o WhatsApp/Meta</strong>. O uso pode violar os Termos de Serviço do WhatsApp. Use por sua conta e risco.
                </AlertDescription>
              </Alert>
              <div className="flex items-start gap-2">
                <Switch checked={newConnAck} onCheckedChange={setNewConnAck} />
                <label className="text-xs leading-relaxed pt-0.5">
                  Li e compreendo os riscos de usar uma integração não oficial com o WhatsApp.
                </label>
              </div>
              {/* QR Code Placeholder */}
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="h-48 w-48 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <QrCode className="h-12 w-12 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">QR Code aparecerá aqui</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-[260px]">
                  Após confirmar, escaneie o QR Code com o WhatsApp do número desejado.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewConnDialogOpen(false)}>Cancelar</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!newConnName.trim() || !newConnAck}
                onClick={() => setNewConnDialogOpen(false)}
              >
                Criar conexão
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{connectedCount}</p>
                <p className="text-xs text-muted-foreground">Conectadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                <WifiOff className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{disconnectedCount}</p>
                <p className="text-xs text-muted-foreground">Desconectadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{problemCount}</p>
                <p className="text-xs text-muted-foreground">Com problemas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-teal-700 dark:text-teal-400">{totalMessages24h.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-muted-foreground">Total mensagens 24h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connection cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {connections.map((conn) => {
          const cfg = statusConfig[conn.status] || statusConfig.error
          const diag = connectionDiagnostics[conn.id]
          const isPaused = localPaused[conn.id] || false
          const isExpanded = expandedDiag === conn.id

          return (
            <Card key={conn.id} className={`flex flex-col ${cfg.dotColor === 'bg-red-500' ? 'border-red-200 dark:border-red-800/50' : cfg.dotColor === 'bg-orange-500' ? 'border-orange-200 dark:border-orange-800/50' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={`${conn.status === 'connected' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                        {conn.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-sm font-semibold">{conn.name}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono">(**) *****-{conn.phoneLast4}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <QualityDots quality={conn.quality} />
                    <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotColor} mr-1.5`} />
                      {cfg.label}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{conn.provider}</Badge>
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Último evento: {timeAgo(conn.lastEventAt)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Última sinc: {timeAgo(conn.lastSyncAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {conn.messageCount.toLocaleString('pt-BR')} msgs
                  </span>
                </div>

                {/* Actions */}
                <Separator className="my-1" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          <RefreshCw className="h-3 w-3" />Reconectar
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Tentar reconectar</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          <QrCode className="h-3 w-3" />Gerar QR
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Gerar novo QR Code</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => togglePause(conn.id)}
                        >
                          {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                          {isPaused ? 'Retomar' : 'Pausar'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>{isPaused ? 'Retomar conexão' : 'Pausar temporariamente'}</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          <TestTube className="h-3 w-3" />Testar
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Enviar mensagem de teste</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          <Pencil className="h-3 w-3" />Renomear
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Alterar nome da conexão</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          <Stethoscope className="h-3 w-3" />Diagnostic
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Ver diagnóstico detalhado</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-amber-600">
                          <Unplug className="h-3 w-3" />Desconectar
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Desconectar sem excluir</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-red-600">
                          <Trash2 className="h-3 w-3" />Excluir
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Excluir credenciais</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Expandable diagnostics */}
                {diag && (
                  <>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-full text-xs text-muted-foreground gap-1 mt-1"
                      onClick={() => setExpandedDiag(isExpanded ? null : conn.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Diagnóstico
                    </Button>
                    {isExpanded && (
                      <div className="rounded-lg border bg-muted/40 p-3 space-y-2.5 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1.5">
                            <Server className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Socket:</span>
                            <span className={`font-mono font-medium ${diag.socketStatus === 'OPEN' ? 'text-emerald-600' : diag.socketStatus === 'CLOSED' || diag.socketStatus === 'NONE' ? 'text-red-600' : 'text-amber-600'}`}>
                              {diag.socketStatus}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Heartbeat:</span>
                            <span className="font-medium">{diag.lastHeartbeat === '—' ? '—' : timeAgo(diag.lastHeartbeat)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Filas pendentes:</span>
                            <span className={`font-medium ${diag.pendingQueues > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{diag.pendingQueues}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Eventos:</span>
                            <span className="font-medium">{diag.eventRate}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Protocolo:</span>
                            <span className="font-mono font-medium">{diag.protocolVersion}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Armazenamento:</span>
                            <span className="font-medium">{diag.storageUsed}</span>
                          </div>
                        </div>

                        {diag.pendingQueues > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-muted-foreground">
                              <span>Filas de processamento</span>
                              <span>{diag.pendingQueues} itens</span>
                            </div>
                            <Progress value={Math.max(5, 100 - diag.pendingQueues * 5)} className="h-1.5" />
                          </div>
                        )}

                        {diag.recentErrors.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="font-medium text-red-600 flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              Erros recentes (sanitizados)
                            </p>
                            {diag.recentErrors.map((err, i) => (
                              <div key={i} className="rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-2 py-1.5 text-red-700 dark:text-red-400 font-mono text-[11px]">
                                {err}
                              </div>
                            ))}
                          </div>
                        )}

                        {diag.recommendedActions.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="font-medium flex items-center gap-1">
                              <Info className="h-3 w-3 text-teal-600" />
                              Ações recomendadas
                            </p>
                            {diag.recommendedActions.map((action, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <CheckCircle2 className="h-3 w-3 mt-0.5 text-teal-600 shrink-0" />
                                <span>{action}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {diag.recommendedActions.length === 0 && diag.recentErrors.length === 0 && (
                          <div className="flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Nenhum problema detectado.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
