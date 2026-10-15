'use client'

import { useCallback, useEffect, useState } from 'react'
import { Fingerprint, Check, Undo2, Ban } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { fetchMutation, runMutation } from '@/lib/mutation'
import { Skeleton } from '@/components/ui/skeleton'

// P5 · Equipe › Identidades do WhatsApp (§18.2). O sistema detecta e SUGERE; admin/gestor confirma, troca, desfaz
// ou marca "não é atendente". Só vínculo confirmado conta nos indicadores por atendente.

type Status = 'confirmed' | 'suggested' | 'unconfirmed' | 'ignored'
interface Identity {
  id: string
  kind: 'signature' | 'device' | 'number'
  displayName: string
  status: Status
  agent: { id: string; name: string } | null
  suggestedAgent: { id: string; name: string } | null
  confidence: number | null
  confidenceLevel: 'alta' | 'media' | 'baixa' | null
  reason: string | null
  conversationCount: number
  messageCount: number
  lastSeenAt: string | null
  confirmedAt: string | null
  confirmedByName: string | null
}
interface Data {
  canManage: boolean
  agents: Array<{ id: string; name: string }>
  connections: Array<{ id: string; name: string; phoneLast4: string | null; identities: Identity[] }>
  summary: { confirmed: number; pending: number; ignored: number; hidden: number; suggestedConversations: number }
}

const KIND_LABEL: Record<Identity['kind'], string> = { signature: 'Assinatura', device: 'Aparelho', number: 'Número' }
const STATUS: Record<Status, { label: string; tag: string }> = {
  confirmed: { label: 'Confirmado', tag: 'tag--verde' },
  suggested: { label: 'Sugerido', tag: 'tag--ambar' },
  unconfirmed: { label: 'Sem vínculo', tag: 'tag--cinza' },
  ignored: { label: 'Não é atendente', tag: 'tag--cinza' },
}
const LEVEL: Record<string, string> = { alta: 'alta', media: 'média', baixa: 'baixa' }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function IdentityCard({ identity, data, onDone }: { identity: Identity; data: Data; onDone: () => Promise<void> }) {
  const [choice, setChoice] = useState(identity.agent?.id ?? identity.suggestedAgent?.id ?? '')
  const [busy, setBusy] = useState(false)

  const act = async (action: 'confirm' | 'ignore' | 'undo') => {
    setBusy(true)
    let changed = 0
    const ok = await runMutation(
      async () => {
        const res = await fetchMutation(`/api/agent-identities/${identity.id}`, { method: 'PATCH', json: { action, ...(action === 'confirm' ? { agentId: choice } : {}) } })
        changed = ((await res.json()) as { conversationsUpdated?: number }).conversationsUpdated ?? 0
      },
      { onSettled: onDone, errorMessage: 'Não foi possível salvar o vínculo. Tente novamente.' }
    )
    setBusy(false)
    if (ok) toast.success(`Vínculo salvo · ${changed} ${changed === 1 ? 'conversa atualizada' : 'conversas atualizadas'}`)
  }

  const st = STATUS[identity.status]
  const isSwitch = identity.status === 'confirmed' && choice !== identity.agent?.id
  const selectId = `ident-ag-${identity.id}`
  return (
    <li className="cartao ident-cartao" data-testid="identity-card" data-identity-id={identity.id} data-status={identity.status}>
      <div className="ident-cartao__cab">
        <div>
          <strong className="ident-cartao__nome">{identity.displayName}</strong>
          <small className="suave"> · {KIND_LABEL[identity.kind]}</small>
        </div>
        <span className={cn('tag', st.tag)} data-testid="identity-status"><span className="ponto" />{st.label}</span>
      </div>

      <p className="ident-cartao__vinculo">
        {identity.status === 'confirmed' && identity.agent ? (
          <>Atendente: <strong data-testid="identity-agent">{identity.agent.name}</strong></>
        ) : identity.suggestedAgent && identity.status !== 'ignored' ? (
          <>Sugestão: <strong data-testid="identity-suggested">{identity.suggestedAgent.name}</strong>{' '}
            <span className="suave">(confiança {LEVEL[identity.confidenceLevel ?? 'baixa']}, {Math.round((identity.confidence ?? 0) * 100)}%)</span></>
        ) : identity.status === 'ignored' ? (
          <span className="suave">Não entra na atribuição de atendente.</span>
        ) : (
          <span className="suave">Sem sugestão.</span>
        )}
      </p>
      {identity.reason && identity.status !== 'confirmed' && identity.status !== 'ignored' && <p className="suave ident-cartao__motivo">Por quê: {identity.reason}</p>}
      <p className="suave ident-cartao__meta">
        {identity.conversationCount} {identity.conversationCount === 1 ? 'conversa' : 'conversas'} · {identity.messageCount} msgs · visto por último {when(identity.lastSeenAt)}
        {identity.confirmedAt && identity.status !== 'unconfirmed' ? ` · decidido ${when(identity.confirmedAt)}${identity.confirmedByName ? ` por ${identity.confirmedByName}` : ''}` : ''}
      </p>

      {data.canManage && (
        <div className="ident-cartao__acoes">
          {identity.status !== 'ignored' && (
            <>
              <label className="sr-only" htmlFor={selectId}>Atendente de {identity.displayName}</label>
              <select id={selectId} className="selecao" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy} data-testid="identity-agent-select">
                <option value="">Escolha o atendente…</option>
                {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button type="button" className="btn btn--sm btn--escuro" disabled={busy || !choice || (identity.status === 'confirmed' && !isSwitch)} onClick={() => void act('confirm')}>
                <Check className="ic" aria-hidden="true" />{isSwitch ? 'Trocar' : 'Confirmar'}
              </button>
            </>
          )}
          {identity.status === 'confirmed' || identity.status === 'ignored' ? (
            <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void act('undo')}>
              <Undo2 className="ic" aria-hidden="true" />Desfazer
            </button>
          ) : (
            <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void act('ignore')}>
              <Ban className="ic" aria-hidden="true" />Não é atendente
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export default function WhatsappIdentities() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-identities')
      if (!res.ok) throw new Error()
      setData(await res.json())
      setError(false)
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <section className="cartao" aria-labelledby="ident-t" data-testid="whatsapp-identities" data-tour="team-identities">
      <div className="cartao__cab">
        <div className="linha-flex">
          <span className="cab-pagina__icone cab-pagina__icone--caixa mini-caixa"><Fingerprint className="ic" aria-hidden="true" /></span>
          <div>
            <h2 id="ident-t">Identidades do WhatsApp</h2>
            <p>Quem é cada atendente nas conversas. O sistema sugere pela assinatura, pelo aparelho e pelo número; a decisão é sua.</p>
          </div>
        </div>
      </div>
      <div className="cartao__corpo">
        {error ? (
          <div className="vazio" role="alert">
            <strong>Não foi possível carregar as identidades.</strong>
            <button type="button" onClick={() => void load()} className="btn mt-3">Tentar novamente</button>
          </div>
        ) : !data ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <>
            <p className="suave ident-resumo" data-testid="identities-summary">
              {data.summary.confirmed} confirmada(s) · {data.summary.pending} pendente(s) · {data.summary.ignored} ignorada(s).{' '}
              Só o vínculo <strong>confirmado</strong> conta nos indicadores por atendente
              {data.summary.suggestedConversations > 0 ? `; ${data.summary.suggestedConversations} conversa(s) aguardam confirmação (aparecem como "sugerido").` : '.'}
              {!data.canManage && ' Só administrador e gestor podem confirmar.'}
            </p>
            {data.connections.length === 0 ? (
              <p className="vazio">Nenhuma conexão de WhatsApp cadastrada.</p>
            ) : (
              data.connections.map((c) => (
                <div key={c.id} className="ident-conexao" data-testid="identity-connection">
                  <h3 className="ident-conexao__titulo">{c.name}{c.phoneLast4 ? <span className="suave mono"> · final {c.phoneLast4}</span> : null}</h3>
                  {c.identities.length === 0 ? (
                    <p className="suave">Nenhuma identidade detectada ainda: aparecem conforme a empresa responde pelo WhatsApp.</p>
                  ) : (
                    <ul className="ident-lista">
                      {/* a chave muda com o vínculo: o cartão recomeça com a escolha certa depois de salvar */}
                      {c.identities.map((i) => <IdentityCard key={`${i.id}:${i.status}:${i.agent?.id ?? ''}:${i.suggestedAgent?.id ?? ''}`} identity={i} data={data} onDone={load} />)}
                    </ul>
                  )}
                </div>
              ))
            )}
            <details className="ident-ajuda">
              <summary>Como a sugestão é feita</summary>
              <ul>
                <li><strong>Assinatura</strong> (&quot;*Carlos*: …&quot; ou &quot;… — Carlos&quot;): nome completo do atendente = confiança alta; só o primeiro nome, sem outro atendente igual = média. Vista em menos de 3 conversas perde um pouco.</li>
                <li><strong>Número</strong>: o nome da conexão contém o nome do atendente (cada um com o próprio WhatsApp).</li>
                <li><strong>Aparelho</strong> (iPhone, Android, WhatsApp Web, computador): sozinho não identifica a pessoa; só sugere quando há um único atendente.</li>
                <li>Numa conversa vale a evidência mais específica: assinatura, depois aparelho, depois número. Escolha manual na conversa nunca é desfeita.</li>
              </ul>
            </details>
          </>
        )}
      </div>
    </section>
  )
}
