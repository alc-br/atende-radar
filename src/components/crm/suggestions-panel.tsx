'use client'

import { useId, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CrmApiError, crmErrorMessage, crmSend, useCrmQuery } from '@/lib/crm/client'
import { LOST_REASON_LABEL } from '@/lib/crm/labels'
import { formatCents, reaisToCents } from '@/lib/crm/money'
import { moneyProps } from '@/lib/money-input'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'
import { timeAgo } from '@/lib/utils'

// Sugestões do CRM (D2: o sistema sugere, a pessoa decide). Nada aqui se aplica sozinho: cada item espera "Aceitar" ou
// "Descartar". O texto da mensagem do cliente nunca aparece: só o que se propõe e o motivo da regra (`reason`).

export interface SuggestionsPanelProps {
  /** Só as sugestões deste negócio; sem ele, todas as pendentes no escopo de quem vê. */
  dealId?: string
  /** Chamado depois de aceitar ou descartar (a tela recarrega o que mudou). */
  onChanged?: () => void
  /** Quantas mostrar antes de "Ver mais" (padrão 5). */
  initialCount?: number
}

type SuggestionKind = 'create_deal' | 'move_stage' | 'create_task' | 'confirm_outcome'

interface CrmSuggestion {
  id: string
  kind: SuggestionKind | string
  dealId: string | null
  conversationId: string | null
  opportunityId: string | null
  alertId: string | null
  reason: string
  payload: Record<string, unknown>
  ruleVersion: string | number | null
  expiresAt: string | null
  createdAt: string
}

/** Resposta de POST /accept (suggestions.ts › acceptSuggestion). */
interface AcceptResult {
  status: 'accepted'
  kind: string
  dealId: string | null
  activityId?: string
  reflected?: { reflected: number; kept: number }
}

type DialogState = { mode: 'won' | 'lost'; s: CrmSuggestion } | { mode: 'dismiss'; s: CrmSuggestion } | null

const EXPIRED_MESSAGE = 'Esta sugestão não vale mais: o negócio mudou.'
const LOST_REASONS = Object.entries(LOST_REASON_LABEL) as [keyof typeof LOST_REASON_LABEL, string][]
const SELECT_CLASS = 'flex h-10 w-full rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie)] px-3 text-sm text-[var(--texto)]'

function str(p: Record<string, unknown>, key: string): string | null {
  const v = p[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function num(p: Record<string, unknown>, key: string): number | null {
  const v = p[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function outcomeOf(s: CrmSuggestion): 'won' | 'lost' | null {
  const o = s.payload.outcome
  return o === 'won' || o === 'lost' ? o : null
}

/** O que a sugestão propõe, em uma linha, e o detalhe (valor estimado, prazo). */
function describe(s: CrmSuggestion): { title: string; detail: string | null } {
  const p = s.payload
  switch (s.kind) {
    case 'create_deal': {
      const est = num(p, 'estimatedAmountCents')
      return {
        title: `Criar negócio: ${str(p, 'title') ?? 'sem título'}`,
        detail: est !== null ? `Valor estimado: ${formatCents(est)} (estimativa, não é receita)` : null,
      }
    }
    case 'move_stage': {
      const stage = str(p, 'stageName')
      return { title: stage ? `Mudar para a etapa “${stage}”` : 'Mudar de etapa', detail: null }
    }
    case 'create_task': {
      const hours = num(p, 'dueInHours')
      return {
        title: `Criar tarefa: ${str(p, 'title') ?? 'Retornar ao cliente'}`,
        detail: hours !== null ? `Prazo sugerido: em ${hours} ${hours === 1 ? 'hora' : 'horas'}` : null,
      }
    }
    case 'confirm_outcome': {
      const won = outcomeOf(s) === 'won'
      const cents = num(p, 'confirmedValueCents')
      return {
        title: won ? 'Confirmar ganho' : 'Confirmar perda',
        detail: won && cents !== null ? `Valor citado na conversa: ${formatCents(cents)} (confira antes de confirmar)` : null,
      }
    }
    default:
      return { title: 'Sugestão', detail: null }
  }
}

export function SuggestionsPanel({ dealId, onChanged, initialCount = 5 }: SuggestionsPanelProps) {
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const selectConversation = useAppStore((s) => s.selectConversation)
  const canView = !!me?.crm?.enabled && can(me?.role, 'crm.deals.view')
  const canManage = can(me?.role, 'crm.deals.manage')
  const canSeeConversation = can(me?.role, 'conversations.view')

  const url = canView ? (dealId ? `/api/crm/suggestions?dealId=${encodeURIComponent(dealId)}` : '/api/crm/suggestions') : null
  const q = useCrmQuery<{ suggestions: CrmSuggestion[] }>(url)

  const headingId = useId()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [amount, setAmount] = useState('')
  const [noAmount, setNoAmount] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  if (!url) return null
  if (q.loading) return null
  if (q.error && !q.data) {
    return (
      <div className="cartao vazio crm-sugestoes__erro" role="alert" data-tour="crm-suggestions">
        <span>Não foi possível carregar as sugestões.</span>
        <button type="button" className="btn btn--sm" onClick={q.refetch}>
          Tentar novamente
        </button>
      </div>
    )
  }
  const items = q.data?.suggestions ?? []
  if (!items.length) return null

  const visible = showAll ? items : items.slice(0, initialCount)
  const busy = busyId !== null

  function changed() {
    q.refetch()
    onChanged?.()
  }

  function handleError(e: unknown) {
    if (e instanceof CrmApiError && e.extra.expired === true) {
      toast.error(EXPIRED_MESSAGE)
      setDialog(null)
      changed()
      return
    }
    if (e instanceof CrmApiError && (e.code === 'crm_version_conflict' || e.code === 'crm_not_found' || e.code === 'crm_invalid_transition')) {
      toast.error(crmErrorMessage(e))
      setDialog(null)
      changed()
      return
    }
    // validação do fechamento (ex.: ganho sem valor no negócio): a frase do servidor também fica no diálogo
    if (e instanceof CrmApiError && e.code === 'crm_invalid') setFormError(e.message)
    toast.error(crmErrorMessage(e))
  }

  function successToast(s: CrmSuggestion, r: AcceptResult) {
    switch (s.kind) {
      case 'create_deal': {
        const createdId = r.dealId
        toast.success('Negócio criado.', createdId ? { action: { label: 'Abrir negócio', onClick: () => openCrm('deal', createdId) } } : undefined)
        return
      }
      case 'move_stage':
        toast.success('Etapa alterada.')
        return
      case 'create_task':
        toast.success('Tarefa criada.')
        return
      case 'confirm_outcome':
        toast.success(outcomeOf(s) === 'won' ? 'Ganho confirmado.' : 'Perda registrada.')
        return
      default:
        toast.success('Sugestão aceita.')
    }
  }

  async function accept(s: CrmSuggestion, body: Record<string, unknown> = {}) {
    setBusyId(s.id)
    try {
      const r = await crmSend<AcceptResult>(`/api/crm/suggestions/${encodeURIComponent(s.id)}/accept`, { json: body })
      successToast(s, r)
      setDialog(null)
      changed()
    } catch (e) {
      handleError(e)
    } finally {
      setBusyId(null)
    }
  }

  async function dismiss(s: CrmSuggestion) {
    const text = note.trim()
    setBusyId(s.id)
    try {
      await crmSend(`/api/crm/suggestions/${encodeURIComponent(s.id)}/dismiss`, { json: text ? { note: text.slice(0, 500) } : {} })
      toast.success('Sugestão descartada.')
      setDialog(null)
      changed()
    } catch (e) {
      handleError(e)
    } finally {
      setBusyId(null)
    }
  }

  function openDialog(next: NonNullable<DialogState>) {
    setNote('')
    setFormError(null)
    setLostReason('')
    setNoAmount(false)
    const cents = next.mode === 'won' ? num(next.s.payload, 'confirmedValueCents') : null
    setAmount(cents !== null && cents > 0 ? String(cents / 100) : '')
    setDialog(next)
  }

  function onAccept(s: CrmSuggestion) {
    if (s.kind === 'confirm_outcome') {
      const outcome = outcomeOf(s)
      if (outcome) {
        openDialog({ mode: outcome, s })
        return
      }
    }
    void accept(s)
  }

  function submitOutcome() {
    if (!dialog || dialog.mode === 'dismiss') return
    const body: Record<string, unknown> = {}
    const text = note.trim()
    if (text) body.note = text.slice(0, 1000)
    if (dialog.mode === 'won') {
      if (noAmount) {
        body.amountCents = null
        body.confirmNoAmount = true
      } else if (amount) {
        const cents = reaisToCents(Number(amount))
        if (cents === null || cents <= 0) {
          setFormError('Informe um valor maior que zero ou marque "Fechou sem valor informado".')
          return
        }
        body.amountCents = cents
      } else {
        // em branco: vale o valor já informado no negócio (sem ele, o servidor pede o valor ou a confirmação)
        body.amountCents = null
      }
    } else {
      if (!lostReason) {
        setFormError('Escolha o motivo da perda.')
        return
      }
      body.lostReasonCode = lostReason
    }
    setFormError(null)
    void accept(dialog.s, body)
  }

  const dialogSuggestion = dialog?.s ?? null
  const dialogBusy = !!dialogSuggestion && busyId === dialogSuggestion.id

  return (
    <section className="cartao crm-sugestoes" data-tour="crm-suggestions" aria-labelledby={headingId}>
      <div className="cartao__cab">
        <div>
          <h2 id={headingId}>
            <Lightbulb className="ic" aria-hidden="true" />
            Sugestões
          </h2>
          <p>Vindas das conversas. Nada muda no CRM sem você aceitar.</p>
        </div>
        <span className="tag tag--cinza">{items.length} {items.length === 1 ? 'pendente' : 'pendentes'}</span>
      </div>
      <div className="cartao__corpo">
        <ul className="crm-sugestoes__lista">
          {visible.map((s) => {
            const d = describe(s)
            const titleId = `${headingId}-item-${s.id}`
            const itemBusy = busyId === s.id
            return (
              <li key={s.id} className="crm-sugestao">
                <div className="crm-sugestao__texto">
                  <strong id={titleId}>{d.title}</strong>
                  {d.detail && <span className="crm-sugestao__detalhe">{d.detail}</span>}
                  {s.reason && <span className="suave">Por quê: {s.reason}</span>}
                  <span className="crm-sugestao__meta">{timeAgo(s.createdAt)}</span>
                </div>
                <div className="crm-sugestao__acoes">
                  {!dealId && s.dealId && (
                    <button type="button" className="btn btn--sm btn--link" aria-describedby={titleId} onClick={() => openCrm('deal', s.dealId)}>
                      Abrir negócio
                    </button>
                  )}
                  {canSeeConversation && s.conversationId && (
                    <button type="button" className="btn btn--sm btn--link" aria-describedby={titleId} onClick={() => selectConversation(s.conversationId)}>
                      Ver conversa
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button type="button" className="btn btn--sm btn--primario" aria-describedby={titleId} disabled={busy} onClick={() => onAccept(s)}>
                        {itemBusy && !dialog ? 'Aceitando…' : 'Aceitar'}
                      </button>
                      <button type="button" className="btn btn--sm" aria-describedby={titleId} disabled={busy} onClick={() => openDialog({ mode: 'dismiss', s })}>
                        Descartar
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {items.length > initialCount && (
          <button type="button" className="btn btn--sm btn--link crm-sugestoes__mais" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Ver menos' : `Ver mais (${items.length - initialCount})`}
          </button>
        )}
      </div>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !dialogBusy) setDialog(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {dialog?.mode === 'dismiss' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void dismiss(dialog.s)
              }}
              className="grid gap-4"
            >
              <DialogHeader>
                <DialogTitle>Descartar sugestão</DialogTitle>
                <DialogDescription>{describe(dialog.s).title}. Ela sai da lista e nada muda no CRM.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="crm-sug-motivo">Motivo (opcional)</Label>
                <Textarea id="crm-sug-motivo" value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: O cliente já comprou em outro canal" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={dialogBusy} onClick={() => setDialog(null)}>
                  Voltar
                </Button>
                <Button type="submit" disabled={dialogBusy}>
                  {dialogBusy ? 'Descartando…' : 'Descartar sugestão'}
                </Button>
              </DialogFooter>
            </form>
          ) : dialog ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submitOutcome()
              }}
              className="grid gap-4"
              noValidate
            >
              <DialogHeader>
                <DialogTitle>{dialog.mode === 'won' ? 'Confirmar ganho' : 'Confirmar perda'}</DialogTitle>
                <DialogDescription>
                  {dialog.mode === 'won'
                    ? 'O negócio vai para ganho. Informe o valor que o cliente fechou; a estimativa da conversa não conta como receita.'
                    : 'O negócio vai para perdido. Escolha o motivo para ele entrar nos indicadores.'}
                </DialogDescription>
              </DialogHeader>
              {dialog.mode === 'won' ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="crm-sug-valor">Valor da venda (R$)</Label>
                    <Input
                      id="crm-sug-valor"
                      {...moneyProps(amount, setAmount)}
                      disabled={noAmount}
                      placeholder="0,00"
                      aria-describedby="crm-sug-valor-dica"
                    />
                    <p id="crm-sug-valor-dica" className="text-xs text-[var(--suave)]">
                      Em branco, vale o valor já informado no negócio.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="crm-sug-sem-valor"
                      type="checkbox"
                      className="size-4 accent-[var(--verde-600)]"
                      checked={noAmount}
                      onChange={(e) => {
                        setNoAmount(e.target.checked)
                        setFormError(null)
                      }}
                    />
                    <Label htmlFor="crm-sug-sem-valor">Fechou sem valor informado</Label>
                  </div>
                </>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="crm-sug-perda">Motivo da perda</Label>
                  <select
                    id="crm-sug-perda"
                    className={SELECT_CLASS}
                    value={lostReason}
                    required
                    aria-invalid={formError !== null && !lostReason}
                    onChange={(e) => {
                      setLostReason(e.target.value)
                      setFormError(null)
                    }}
                  >
                    <option value="">Escolha o motivo</option>
                    {LOST_REASONS.map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="crm-sug-nota">Observação (opcional)</Label>
                <Textarea id="crm-sug-nota" value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} />
              </div>
              {formError && (
                <p role="alert" className="text-sm text-[var(--vermelho)]">
                  {formError}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={dialogBusy} onClick={() => setDialog(null)}>
                  Voltar
                </Button>
                <Button type="submit" disabled={dialogBusy}>
                  {dialogBusy ? 'Confirmando…' : dialog.mode === 'won' ? 'Confirmar ganho' : 'Confirmar perda'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
