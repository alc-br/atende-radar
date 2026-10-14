'use client'

import { useCallback, useEffect, useState } from 'react'
import { Webhook, Save, Send, KeyRound, Copy, Trash2, CircleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { fetchMutation, runMutation } from '@/lib/mutation'

// Configurações › Webhook: avisa um sistema da empresa (CRM, ERP, automação) quando um alerta abre ou se resolve.
// O segredo só aparece uma vez (ao criar ou gerar outro); a API devolve apenas o final dele.

interface WebhookConfig {
  url: string
  enabled: boolean
  events: string[]
  secretHint: string
  lastStatus: 'ok' | 'error' | null
  lastStatusCode: number | null
  lastError: string | null
  lastEvent: string | null
  lastAttemptAt: string | null
}

interface Delivery {
  id: string
  event: string
  status: string
  attempts: number
  lastStatusCode: number | null
  lastError: string | null
  createdAt: string
  deliveredAt: string | null
  nextAttemptAt: string | null
}

interface ViewData {
  webhook: WebhookConfig | null
  deliveries: Delivery[]
  availableEvents: Array<{ id: string; label: string }>
}

const STATUS: Record<string, { label: string; tag: string }> = {
  sent: { label: 'Entregue', tag: 'tag--verde' },
  pending: { label: 'Aguardando nova tentativa', tag: 'tag--ambar' },
  sending: { label: 'Enviando', tag: 'tag--azul' },
  failed: { label: 'Falhou', tag: 'tag--vermelho' },
  skipped: { label: 'Não enviado', tag: 'tag--cinza' },
}
const EVENT_LABEL: Record<string, string> = { 'alert.created': 'Alerta criado', 'alert.resolved': 'Alerta resolvido', 'webhook.test': 'Teste' }
const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function WebhookSettings() {
  const [data, setData] = useState<ViewData | null>(null)
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [events, setEvents] = useState<string[]>(['alert.created', 'alert.resolved'])
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async (syncForm = false) => {
    try {
      const r = await fetch('/api/settings/webhook')
      if (!r.ok) throw new Error()
      const d = (await r.json()) as ViewData
      setData(d)
      setLoadError(false)
      if (syncForm && d.webhook) {
        setUrl(d.webhook.url)
        setEnabled(d.webhook.enabled)
        setEvents(d.webhook.events)
      }
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])

  const save = async () => {
    setBusy('save')
    let ok = false
    try {
      const res = await fetch('/api/settings/webhook', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, enabled, events }) })
      const body = (await res.json().catch(() => ({}))) as { error?: string; secret?: string }
      if (!res.ok) {
        toast.error(body.error || 'Não foi possível salvar o webhook.')
      } else {
        ok = true
        if (body.secret) setNewSecret(body.secret)
        toast.success('Webhook salvo.')
      }
    } catch {
      toast.error('Não foi possível salvar o webhook.')
    } finally {
      setBusy(null)
      await load(ok)
    }
  }

  const sendTest = async () => {
    setBusy('test')
    try {
      const res = await fetch('/api/settings/webhook/test', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; statusCode?: number | null; error?: string | null }
      if (res.ok && body.ok) toast.success(`Teste entregue (HTTP ${body.statusCode}).`)
      else toast.error(`Teste não entregue: ${body.error || `HTTP ${res.status}`}`)
    } catch {
      toast.error('Não foi possível enviar o teste.')
    } finally {
      setBusy(null)
      await load()
    }
  }

  const rotate = async () => {
    if (!window.confirm('Gerar um novo segredo? O atual para de valer na hora e o seu sistema precisa ser atualizado.')) return
    setBusy('secret')
    await runMutation(async () => {
      const res = await fetchMutation('/api/settings/webhook/secret', { method: 'POST' })
      const body = (await res.json()) as { secret: string }
      setNewSecret(body.secret)
      toast.success('Novo segredo gerado.')
    }, { onSettled: () => load() })
    setBusy(null)
  }

  const remove = async () => {
    if (!window.confirm('Remover o webhook? Nenhum aviso será enviado e o segredo é descartado.')) return
    setBusy('remove')
    const ok = await runMutation(() => fetchMutation('/api/settings/webhook', { method: 'DELETE' }), { onSettled: () => load() })
    if (ok) {
      setUrl('')
      setEnabled(false)
      setEvents(['alert.created', 'alert.resolved'])
      setNewSecret(null)
      toast.success('Webhook removido.')
    }
    setBusy(null)
  }

  const copySecret = () => {
    if (!newSecret) return
    navigator.clipboard?.writeText(newSecret).then(() => toast.success('Segredo copiado.')).catch(() => toast.error('Copie o segredo manualmente.'))
  }

  const toggleEvent = (id: string, on: boolean) => setEvents((prev) => (on ? [...new Set([...prev, id])] : prev.filter((e) => e !== id)))
  const wh = data?.webhook ?? null
  const available = data?.availableEvents ?? [{ id: 'alert.created', label: 'Alerta criado' }, { id: 'alert.resolved', label: 'Alerta resolvido' }]

  return (
    <div className="painel-config">
      <form className="cartao secao-config" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <header className="secao-config__cab">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Webhook className="ic" /></span>
          <div>
            <h2 id="t-webhook">Webhook de alertas</h2>
            <p>Enviamos um POST em JSON para o seu sistema quando um alerta é criado ou resolvido. Só dados do alerta: nunca o texto das mensagens nem telefones.</p>
          </div>
        </header>

        {loadError && <p className="suave text-[13px]" role="alert">Não foi possível carregar o webhook.</p>}

        <div className="form-grade">
          <div className="campo form-grade__todo">
            <label htmlFor="w-url">URL de destino (https)</label>
            <p className="ajuda-campo" id="w-url-ajuda">Precisa ser https e acessível pela internet. Endereços internos (localhost, rede privada) são recusados.</p>
            <input className="entrada mono" id="w-url" type="url" inputMode="url" placeholder="https://seu-sistema.com.br/webhooks/atenderadar" aria-describedby="w-url-ajuda" value={url} onChange={(e) => setUrl(e.target.value)} required />
          </div>

          <div className="opcao form-grade__todo">
            <span className="dado-ic tom-verde" aria-hidden="true"><Send className="ic" /></span>
            <div><b>Webhook ativo</b><p className="suave">Desligado, nada é enviado (o botão de teste continua funcionando).</p></div>
            <label className="interruptor">
              <input type="checkbox" checked={enabled} aria-label="Webhook ativo" onChange={(e) => setEnabled(e.target.checked)} />
              <span />
            </label>
          </div>

          <fieldset className="campo form-grade__todo">
            <legend className="rotulo">Eventos enviados</legend>
            <div className="flex flex-wrap gap-3">
              {available.map((ev) => (
                <label key={ev.id} className="flex cursor-pointer items-center gap-2 rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie-2)] px-3 py-2 text-[13.5px]">
                  <input type="checkbox" className="caixa" checked={events.includes(ev.id)} onChange={(e) => toggleEvent(ev.id, e.target.checked)} />
                  <span>{ev.label}</span>
                  <code className="suave text-[12px]">{ev.id}</code>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {newSecret && (
          <div className="aviso aviso--ambar mt-5" role="status">
            <span className="aviso__ic" aria-hidden="true"><KeyRound className="ic" /></span>
            <div className="min-w-0">
              <p><b>Guarde este segredo agora: ele não será mostrado de novo.</b> Use-o para validar a assinatura (cabeçalho X-AtendeRadar-Signature).</p>
              <div className="linha-flex mt-2">
                <code className="mono break-all" data-testid="webhook-secret">{newSecret}</code>
                <button className="btn btn--sm" type="button" onClick={copySecret}><Copy className="ic" aria-hidden="true" />Copiar</button>
              </div>
            </div>
          </div>
        )}

        <footer className="secao-config__rodape flex flex-wrap gap-2">
          {wh && (
            <>
              <button className="btn btn--lg" type="button" onClick={() => void sendTest()} disabled={busy !== null}>
                <Send className="ic" aria-hidden="true" />{busy === 'test' ? 'Enviando...' : 'Enviar teste'}
              </button>
              <button className="btn btn--lg" type="button" onClick={() => void rotate()} disabled={busy !== null}>
                <KeyRound className="ic" aria-hidden="true" />Gerar novo segredo
              </button>
              <button className="btn btn--lg btn--perigo" type="button" onClick={() => void remove()} disabled={busy !== null}>
                <Trash2 className="ic" aria-hidden="true" />Remover
              </button>
            </>
          )}
          <button className="btn btn--escuro btn--lg" type="submit" disabled={busy !== null}>
            <Save className="ic" aria-hidden="true" />{busy === 'save' ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
      </form>

      {wh && (
        <section className="cartao" aria-labelledby="t-webhook-entregas">
          <div className="cartao__cab">
            <div>
              <h2 id="t-webhook-entregas">Últimas entregas</h2>
              <p>
                Segredo atual termina em <code className="mono">{wh.secretHint}</code>.{' '}
                {wh.lastAttemptAt ? (
                  <>
                    Última tentativa {fmt.format(new Date(wh.lastAttemptAt))}:{' '}
                    <span className={`tag ${wh.lastStatus === 'ok' ? 'tag--verde' : 'tag--vermelho'}`} data-testid="webhook-last-status">
                      {wh.lastStatus === 'ok' ? 'OK' : 'Erro'}{wh.lastStatusCode ? ` · HTTP ${wh.lastStatusCode}` : ''}
                    </span>
                    {wh.lastStatus !== 'ok' && wh.lastError ? <span className="suave"> {wh.lastError}</span> : null}
                  </>
                ) : 'Nenhuma entrega ainda.'}
              </p>
            </div>
          </div>
          <div className="cartao__corpo">
            {data && data.deliveries.length > 0 ? (
              <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Últimas entregas do webhook">
                <table className="tabela">
                  <thead><tr><th>Evento</th><th>Situação</th><th className="hidden sm:table-cell">Tentativas</th><th className="hidden sm:table-cell">Resposta</th><th>Quando</th></tr></thead>
                  <tbody>
                    {data.deliveries.map((d) => {
                      const st = STATUS[d.status] ?? { label: d.status, tag: 'tag--cinza' }
                      return (
                        <tr key={d.id}>
                          <td>{EVENT_LABEL[d.event] ?? d.event}</td>
                          <td><span className={`tag ${st.tag}`}>{st.label}</span></td>
                          <td className="hidden sm:table-cell suave">{d.attempts}</td>
                          <td className="hidden sm:table-cell suave">{d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : d.lastError || '—'}</td>
                          <td className="suave">{fmt.format(new Date(d.deliveredAt ?? d.createdAt))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="suave text-[13px]">Nenhuma entrega registrada.</p>
            )}
            <p className="suave mt-3 flex items-start gap-2 text-[12.5px]">
              <CircleAlert className="ic shrink-0" aria-hidden="true" />
              Cada envio leva os cabeçalhos X-AtendeRadar-Signature (sha256=HMAC do corpo com o segredo), X-AtendeRadar-Timestamp, X-AtendeRadar-Event e X-AtendeRadar-Delivery. Falhas são repetidas até 3 vezes (após 1 e 5 minutos).
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
