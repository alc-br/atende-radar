'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { mutate } from '@/lib/mutation'
import { tourSignal } from '@/lib/system-tour/signals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  Plus, Wifi, WifiOff, TriangleAlert, MessageSquare, RefreshCw, QrCode,
  Pause, Play, Pencil, Stethoscope, Unplug, Trash2, ChevronDown,
  Activity, Clock, CircleCheck, CircleX, Info, Loader2,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { QrDialog } from './qr-dialog'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/permissions'

// Rótulo e tom (classes do pacote: tag--*) de cada status real da conexão.
const statusConfig: Record<string, { label: string; tom: 'cinza' | 'ambar' | 'azul' | 'verde' | 'laranja' | 'vermelho' }> = {
  pending:      { label: 'Pendente',      tom: 'cinza' },
  qr_required:  { label: 'QR necessário', tom: 'ambar' },
  connecting:   { label: 'Conectando',    tom: 'azul' },
  syncing:      { label: 'Sincronizando', tom: 'azul' },
  connected:    { label: 'Conectada',     tom: 'verde' },
  degraded:     { label: 'Degradada',     tom: 'laranja' },
  disconnected: { label: 'Desconectada',  tom: 'vermelho' },
  logged_out:   { label: 'Desconectada',  tom: 'cinza' },
  blocked:      { label: 'Bloqueada',     tom: 'vermelho' },
  error:        { label: 'Erro',          tom: 'vermelho' },
  disabled:     { label: 'Desabilitada',  tom: 'cinza' },
}

function SignalQuality({ quality }: { quality: 'good' | 'medium' | 'bad' | null }) {
  if (!quality) {
    return (
      <span className="sinal" role="img" aria-label="Qualidade do sinal: sem dados" title="Qualidade do sinal: sem dados">
        <i className="traco" />
      </span>
    )
  }
  const on = quality === 'good' ? 3 : quality === 'medium' ? 2 : 1
  const tom = quality === 'good' ? 'sinal--verde' : quality === 'medium' ? 'sinal--laranja' : 'sinal--vermelho'
  const label = quality === 'good' ? 'Boa qualidade' : quality === 'medium' ? 'Qualidade média' : 'Baixa qualidade'
  return (
    <span className={`sinal ${tom}`} role="img" aria-label={`Qualidade do sinal: ${label}`} title={label}>
      {[0, 1, 2].map((i) => <i key={i} className={i < on ? 'on' : ''} />)}
    </span>
  )
}

export default function ConnectionsView() {
  // T4 · gestor e supervisor acompanham a saúde das conexões; criar, parear, pausar ou excluir é do administrador
  const canManage = can(useAppStore((s) => s.me?.role), 'connections.manage')
  const [newConnDialogOpen, setNewConnDialogOpen] = useState(false)
  const [newConnName, setNewConnName] = useState('')
  const [newConnPhone, setNewConnPhone] = useState('')
  const [newConnAck, setNewConnAck] = useState(false)
  const [creatingConn, setCreatingConn] = useState(false)
  const [qrConnId, setQrConnId] = useState<string | null>(null)

  const handleCreateConnection = async () => {
    setCreatingConn(true)
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newConnName, phoneNumber: newConnPhone }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json().catch(() => null)
      setNewConnName('')
      setNewConnPhone('')
      setNewConnAck(false)
      setNewConnDialogOpen(false)
      tourSignal('connection.created')
      fetchData()
      if (created?.connection?.id) setQrConnId(created.connection.id) // já abre o QR para parear
    } catch {
      // keep dialog open so the user can retry
    } finally {
      setCreatingConn(false)
    }
  }
  const [expandedDiag, setExpandedDiag] = useState<string | null>(null)
  const [localPaused, setLocalPaused] = useState<Record<string, boolean>>({})
  const [diagnosticsMap, setDiagnosticsMap] = useState<Record<string, any>>({})

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionsData, setConnectionsData] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      const res = await fetch('/api/connections')
      if (!res.ok) throw new Error('Erro ao carregar conexões')
      const data = await res.json()
      setConnectionsData(data.connections || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally { setIsLoading(false) }
  }, [])

  // Atualiza a lista SEM mostrar o esqueleto de carregamento (senão o diálogo do QR é desmontado).
  const refreshQuietly = useCallback(async () => {
    try {
      const res = await fetch('/api/connections')
      if (res.ok) setConnectionsData((await res.json()).connections || [])
    } catch { /* mantém a lista atual */ }
  }, [])

  const fetchDiagnostics = useCallback(async (connId: string) => {
    try {
      const res = await fetch(`/api/connections/${connId}/health`)
      if (res.ok) {
        const data = await res.json()
        setDiagnosticsMap(prev => ({ ...prev, [connId]: data.diagnostics }))
      }
    } catch (_e) { /* ignore */ }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    connectionsData.forEach((c: any) => fetchDiagnostics(c.id))
  }, [connectionsData.length])

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameConnId, setRenameConnId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const patchConnection = (connId: string, body: Record<string, unknown>) => {
    return mutate(`/api/connections/${connId}`, {
      method: 'PATCH',
      json: body,
    }, { onSettled: fetchData })
  }

  const handleReconnect = (connId: string) => {
    void patchConnection(connId, { action: 'reconnect' }).then((ok) => {
      if (ok) toast.info('Conexão marcada para novo pareamento. Gere um novo QR Code.')
    })
  }

  const handleDisconnect = (connId: string) => {
    void patchConnection(connId, { action: 'disconnect' })
  }

  const handleDeleteConnection = (connId: string) => {
    void mutate(`/api/connections/${connId}`, { method: 'DELETE' }, { onSettled: fetchData })
  }

  const openRenameDialog = (connId: string, currentName: string) => {
    setRenameConnId(connId)
    setRenameValue(currentName)
    setRenameDialogOpen(true)
  }

  const confirmRename = () => {
    if (renameConnId && renameValue.trim()) {
      void patchConnection(renameConnId, { name: renameValue.trim() })
    }
    setRenameDialogOpen(false)
  }

  // Abre/fecha o diagnóstico de uma conexão (busca os dados se ainda não vieram).
  const setDiagOpen = (connId: string, open: boolean) => {
    if (open) {
      setExpandedDiag(connId)
      if (!diagnosticsMap[connId]) fetchDiagnostics(connId)
    } else if (expandedDiag === connId) {
      setExpandedDiag(null)
    }
  }

  const togglePause = async (connId: string) => {
    const newPaused = !localPaused[connId]
    setLocalPaused(prev => ({ ...prev, [connId]: newPaused }))
    // falha (rede ou 4xx/5xx) vira aviso e desfaz a troca; antes o erro sumia e o botão mostrava um estado falso
    const ok = await mutate(`/api/connections/${connId}`, { method: 'PATCH', json: { action: newPaused ? 'pause' : 'resume' } })
    if (!ok) setLocalPaused(prev => ({ ...prev, [connId]: !newPaused }))
  }

  const connectedCount = connectionsData.filter((c: any) => c.status === 'connected').length
  const disconnectedCount = connectionsData.filter((c: any) => ['disconnected', 'logged_out', 'blocked', 'error'].includes(c.status)).length
  const problemCount = connectionsData.filter((c: any) => ['degraded', 'syncing', 'qr_required', 'connecting'].includes(c.status)).length
  const totalMessages24h = connectionsData.reduce((sum: number, c: any) => sum + Math.floor((c.messageCount || 0) * 0.15), 0)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center gap-4">
          <div><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-64 max-w-full mt-2" /></div>
          <Skeleton className="h-11 w-36" />
        </div>
        <div className="grade grade-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grade grade-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="cartao vazio" role="alert">
        <TriangleAlert className="ic" aria-hidden="true" />
        <strong>{error}</strong>
        <button type="button" className="btn mt-3" onClick={fetchData}>
          <RefreshCw className="ic" aria-hidden="true" />Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="cab-pagina">
        <div>
          <h1>Conexões</h1>
          <p>Gerencie as conexões WhatsApp e monitore sua saúde operacional.</p>
        </div>
        {canManage && (
          <div className="cab-pagina__acoes">
            <button
              type="button"
              data-tour="connections-new"
              className="btn btn--primario btn--lg"
              onClick={() => setNewConnDialogOpen(true)}
            >
              <Plus className="ic" aria-hidden="true" />Nova conexão
            </button>
          </div>
        )}
      </div>

      <Dialog open={newConnDialogOpen} onOpenChange={setNewConnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
            <DialogDescription>
              Adicione um novo número WhatsApp para monitoramento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="nova-conexao-nome" className="text-sm font-medium">Nome da conexão</label>
              <Input
                id="nova-conexao-nome"
                type="text"
                placeholder="Ex: Recepção Filial 2"
                value={newConnName}
                onChange={(e) => setNewConnName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="nova-conexao-numero" className="text-sm font-medium">Número do WhatsApp</label>
              <Input
                id="nova-conexao-numero"
                type="text"
                inputMode="tel"
                placeholder="Ex: 5511999998888"
                value={newConnPhone}
                onChange={(e) => setNewConnPhone(e.target.value)}
              />
            </div>
            <Alert>
              <TriangleAlert className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <AlertDescription className="text-xs">
                Esta integração utiliza bibliotecas de código aberto (Baileys) e <strong>não possui parceria oficial com o WhatsApp/Meta</strong>. O uso pode violar os Termos de Serviço do WhatsApp. Use por sua conta e risco.
              </AlertDescription>
            </Alert>
            <div className="flex items-start gap-2">
              <Switch id="nova-conexao-ciente" checked={newConnAck} onCheckedChange={setNewConnAck} />
              <label htmlFor="nova-conexao-ciente" className="text-xs leading-relaxed pt-0.5">
                Li e compreendo os riscos de usar uma integração não oficial com o WhatsApp.
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Ao criar a conexão, o QR Code aparece na próxima tela para você ler com o celular deste número.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewConnDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!newConnName.trim() || !newConnPhone.trim() || !newConnAck || creatingConn}
              onClick={handleCreateConnection}
            >
              Criar conexão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resumo das conexões */}
      <section className="grade grade-4" aria-label="Resumo das conexões">
        <article className="cartao resumo-con">
          <span className="kpi__icone tom-verde"><Wifi className="ic" aria-hidden="true" /></span>
          <div><p className="resumo-con__num verde-txt">{connectedCount}</p><p>Conectadas</p></div>
        </article>
        <article className="cartao resumo-con">
          <span className="kpi__icone tom-vermelho"><WifiOff className="ic" aria-hidden="true" /></span>
          <div><p className="resumo-con__num vermelho">{disconnectedCount}</p><p>Desconectadas</p></div>
        </article>
        <article className="cartao resumo-con">
          <span className="kpi__icone tom-laranja"><TriangleAlert className="ic" aria-hidden="true" /></span>
          <div><p className="resumo-con__num vermelho">{problemCount}</p><p>Com problemas</p></div>
        </article>
        <article className="cartao resumo-con">
          <span className="kpi__icone tom-teal"><MessageSquare className="ic" aria-hidden="true" /></span>
          <div><p className="resumo-con__num verde-txt">{totalMessages24h.toLocaleString('pt-BR')}</p><p>Total mensagens 24h</p></div>
        </article>
      </section>

      {/* Cartões das conexões */}
      <section data-tour="connections-list" className="grade grade-3 conexoes" aria-label="Conexões WhatsApp">
        {connectionsData.length === 0 && (
          <div className="cartao vazio col-span-full">
            <Wifi className="ic" aria-hidden="true" />
            <strong>Nenhuma conexão ainda</strong>
            {canManage
              ? 'Clique em "Nova conexão" para cadastrar um número de WhatsApp e ler o QR Code.'
              : 'O administrador da empresa cadastra os números de WhatsApp.'}
          </div>
        )}
        {connectionsData.map((conn) => {
          const cfg = statusConfig[conn.status] || statusConfig.error
          const diag = diagnosticsMap[conn.id]
          const isExpanded = expandedDiag === conn.id
          const paused = !!localPaused[conn.id]

          return (
            <div key={conn.id} className={`cartao conexao flex flex-col${cfg.tom === 'vermelho' ? ' conexao--alerta' : ''}`}>
              <header className="conexao__cab">
                <span className={`av av--lg ${conn.status === 'connected' ? 'av--verde' : 'av--cinza'}`} aria-hidden="true">
                  {conn.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="conexao__nome">
                  <h2 title={conn.name}>{conn.name}</h2>
                  <p className="mono suave">(**) *****-{conn.phoneLast4}</p>
                </div>
                <SignalQuality quality={conn.quality} />
                <span className={`tag tag--${cfg.tom} tag--contorno`}><span className="ponto" aria-hidden="true" />{cfg.label}</span>
              </header>

              <ul className="conexao__meta">
                <li><span className="tag tag--cinza">{conn.provider}</span></li>
                <li><Activity className="ic" aria-hidden="true" />Último evento: {timeAgo(conn.lastEventAt)}</li>
                <li><Clock className="ic" aria-hidden="true" />Última sinc: {timeAgo(conn.lastSyncAt)}</li>
                <li><MessageSquare className="ic" aria-hidden="true" />{(conn.messageCount || 0).toLocaleString('pt-BR')} msgs</li>
              </ul>

              <div className="conexao__acoes mt-auto">
                {canManage && (<>
                <button type="button" title="Tentar reconectar" onClick={() => handleReconnect(conn.id)}>
                  <RefreshCw className="ic" aria-hidden="true" />Reconectar
                </button>
                <button
                  type="button"
                  title="Gerar novo QR Code"
                  onClick={() => {
                    if (conn.status === 'connected') toast.info('Este número já está conectado. Para trocar de aparelho, use "Reconectar" e depois "Gerar QR".')
                    else setQrConnId(conn.id)
                  }}
                >
                  <QrCode className="ic" aria-hidden="true" />Gerar QR
                </button>
                <button type="button" title={paused ? 'Retomar conexão' : 'Pausar temporariamente'} onClick={() => togglePause(conn.id)}>
                  {paused ? <Play className="ic" aria-hidden="true" /> : <Pause className="ic" aria-hidden="true" />}
                  {paused ? 'Retomar' : 'Pausar'}
                </button>
                <button type="button" title="Alterar nome da conexão" onClick={() => openRenameDialog(conn.id, conn.name)}>
                  <Pencil className="ic" aria-hidden="true" />Renomear
                </button>
                </>)}
                <button
                  type="button"
                  title="Ver diagnóstico detalhado"
                  aria-expanded={isExpanded}
                  onClick={() => setDiagOpen(conn.id, !isExpanded)}
                >
                  <Stethoscope className="ic" aria-hidden="true" />Diagnóstico
                </button>
                {canManage && (<>
                <button type="button" className="laranja-txt" title="Desconectar sem excluir" onClick={() => handleDisconnect(conn.id)}>
                  <Unplug className="ic" aria-hidden="true" />Desconectar
                </button>
                <button type="button" className="vermelho" title="Excluir credenciais" onClick={() => handleDeleteConnection(conn.id)}>
                  <Trash2 className="ic" aria-hidden="true" />Excluir
                </button>
                </>)}
              </div>

              {/* Diagnóstico expansível (dados reais de /api/connections/:id/health) */}
              {(diag || isExpanded) && (
                <details
                  className="conexao__diag"
                  open={isExpanded}
                  onToggle={(e) => { if (e.currentTarget.open !== isExpanded) setDiagOpen(conn.id, e.currentTarget.open) }}
                >
                  <summary><ChevronDown className="ic" aria-hidden="true" />Diagnóstico</summary>
                  {!diag ? (
                    <p className="flex items-center justify-center gap-2 pb-3 text-xs suave" role="status">
                      <Loader2 className="ic animate-spin" aria-hidden="true" />Carregando diagnóstico…
                    </p>
                  ) : (
                    <div className="pb-2 space-y-2.5 text-xs">
                      <dl>
                        <div>
                          <dt>Socket</dt>
                          <dd className={`mono ${diag.socketStatus === 'OPEN' ? 'verde-txt' : diag.socketStatus === 'CLOSED' || diag.socketStatus === 'NONE' ? 'vermelho' : 'laranja-txt'}`}>
                            {diag.socketStatus}
                          </dd>
                        </div>
                        <div><dt>Heartbeat</dt><dd>{diag.lastHeartbeat === '—' ? '—' : timeAgo(diag.lastHeartbeat)}</dd></div>
                        <div>
                          <dt>Filas pendentes</dt>
                          <dd className={diag.pendingQueues > 0 ? 'laranja-txt' : 'verde-txt'}>{diag.pendingQueues}</dd>
                        </div>
                        <div><dt>Eventos</dt><dd>{diag.eventRate}</dd></div>
                        <div><dt>Protocolo</dt><dd className="mono">{diag.protocolVersion}</dd></div>
                        <div><dt>Mensagens</dt><dd>{diag.messageCount}</dd></div>
                      </dl>

                      {diag.pendingQueues > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between suave">
                            <span>Filas de processamento</span>
                            <span>{diag.pendingQueues} itens</span>
                          </div>
                          <Progress value={Math.max(5, 100 - diag.pendingQueues * 5)} className="h-1.5" aria-label="Filas de processamento" />
                        </div>
                      )}

                      {diag.recentErrors?.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-medium vermelho flex items-center gap-1">
                            <CircleX className="ic" aria-hidden="true" />
                            Erros recentes (sanitizados)
                          </p>
                          {diag.recentErrors.map((err: string, i: number) => (
                            <div key={i} className="mono rounded-md px-2 py-1.5 text-[11px] vermelho" style={{ background: 'var(--vermelho-fundo)' }}>
                              {err}
                            </div>
                          ))}
                        </div>
                      )}

                      {diag.recommendedActions?.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="font-medium flex items-center gap-1">
                            <Info className="ic verde-txt" aria-hidden="true" />
                            Ações recomendadas
                          </p>
                          {diag.recommendedActions.map((action: string, i: number) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <CircleCheck className="ic verde-txt mt-0.5" aria-hidden="true" />
                              <span>{action}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {!diag.recommendedActions?.length && !diag.recentErrors?.length && (
                        <p className="flex items-center gap-1.5 verde-txt">
                          <CircleCheck className="ic" aria-hidden="true" />
                          Nenhum problema detectado.
                        </p>
                      )}
                    </div>
                  )}
                </details>
              )}
            </div>
          )
        })}
      </section>

      {/* Diálogo de renomear */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear conexão</DialogTitle>
            <DialogDescription>Escolha um novo nome para esta conexão.</DialogDescription>
          </DialogHeader>
          <Input
            type="text"
            aria-label="Novo nome da conexão"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmRename} disabled={!renameValue.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QrDialog connectionId={qrConnId} onOpenChange={(o) => { if (!o) setQrConnId(null) }} onConnected={refreshQuietly} />
    </>
  )
}
