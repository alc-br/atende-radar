'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRightLeft, BriefcaseBusiness, CircleCheck, CircleX, History, MessageSquare, RotateCcw, Archive, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ActivityList } from '@/components/crm/activity-list'
import { SuggestionsPanel } from '@/components/crm/suggestions-panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { CrmApiError, crmErrorMessage, crmGet, crmSend, useCrmQuery, type CrmActivity, type CrmDeal, type CrmDealEvent, type CrmPipeline } from '@/lib/crm/client'
import { AMOUNT_SOURCE_LABEL, DEAL_SOURCE_LABEL, DEAL_STATUS_LABEL, DEAL_STATUS_TAG, LOST_REASON_LABEL, PRIORITY_LABEL, REOPEN_REASON, reopenReasonError } from '@/lib/crm/labels'
import { formatCents, MAX_AMOUNT_CENTS } from '@/lib/crm/money'
import { moneyProps } from '@/lib/money-input'
import { can, canOpenView } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// Detalhe do negócio: resumo (valor declarado e estimado sempre separados), ganho/perda/reabrir/arquivar, edição só do
// que mudou (com a versão lida), histórico, conversas vinculadas, tarefas e sugestões. Conflito de versão (409)
// recarrega o negócio e avisa.

type Member = { id: string; name: string }

type MemberRow = { id: string; name: string; role: string; team: string | null; status: string }

type DealFull = CrmDeal & {
  person: { id: string; name: string; phoneLast4: string | null } | null
  company: { id: string; name: string } | null
}

type DealLink = {
  id: string
  relationshipType: string
  conversationId: string | null
  revenueOpportunityId: string | null
  alertId: string | null
  recoveryItemId: string | null
  createdAt: string
}

type DealDetailResponse = {
  deal: DealFull
  pipeline: CrmPipeline
  events: CrmDealEvent[]
  activities: CrmActivity[]
  links: DealLink[]
  suggestions: unknown[]
  members: Member[]
}

type DealResponse = { deal: CrmDeal }

type CloseResponse = { deal: CrmDeal; conversations?: { reflected: number; kept: number } }

type LostReason = keyof typeof LOST_REASON_LABEL

const SELECT_CLASS =
  'flex h-10 w-full rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie)] px-3 text-sm text-[var(--texto)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50'

const PRIORITIES = Object.entries(PRIORITY_LABEL) as [keyof typeof PRIORITY_LABEL, string][]
const LOST_REASONS = Object.entries(LOST_REASON_LABEL) as [LostReason, string][]

const FIELD_LABEL: Record<string, string> = {
  title: 'título',
  personId: 'pessoa',
  companyId: 'empresa',
  ownerMemberId: 'responsável',
  amountCents: 'valor',
  priority: 'prioridade',
  expectedCloseAt: 'previsão de fechamento',
  nextAction: 'próxima ação',
  nextActionAt: 'data da próxima ação',
}

const SUGGESTION_KIND_LABEL: Record<string, string> = {
  create_deal: 'criar o negócio',
  move_stage: 'mudar de etapa',
  confirm_outcome: 'confirmar o desfecho',
  create_task: 'criar uma tarefa',
}

const LINK_TYPE_LABEL: Record<string, string> = {
  origin: 'Conversa de origem',
  conversation: 'Conversa vinculada',
  opportunity: 'Oportunidade da conversa',
  alert: 'Alerta da conversa',
  recovery: 'Recuperação da conversa',
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d)
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : dateTimeFmt.format(d)
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** ISO → valor do campo de data (AAAA-MM-DD na hora local); sem data = "". */
function dateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Campo de data (hora local) → ISO em UTC. */
function isoFromDate(date: string, hh: number, mm: number): string | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

/** Texto puro do campo de reais → centavos inteiros; vazio = null (não informado). Sem teto aqui: acima do limite o
 *  formulário mostra o erro, e nunca grava um valor diferente do digitado. */
function centsFromInput(v: string): number | null {
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

const AMOUNT_LIMIT_MSG = `Valor acima do limite de ${formatCents(MAX_AMOUNT_CENTS)}.`

function centsToInput(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '' : String(cents / 100)
}

function statusWord(v: unknown): string {
  if (v === 'won' || v === 'sale_confirmed') return 'ganho'
  if (v === 'lost') return 'perdido'
  if (typeof v === 'string' && DEAL_STATUS_LABEL[v]) return DEAL_STATUS_LABEL[v].toLowerCase()
  return 'outro desfecho'
}

function eventText(e: CrmDealEvent, stageName: (id: string | null) => string, memberName: (id: string | null | undefined) => string): string {
  const data = e.data ?? {}
  switch (e.type) {
    case 'created': {
      const source = typeof data.source === 'string' ? DEAL_SOURCE_LABEL[data.source as keyof typeof DEAL_SOURCE_LABEL] : undefined
      return `Negócio criado${e.toStageId ? ` na etapa ${stageName(e.toStageId)}` : ''}${source ? ` (${source.toLowerCase()})` : ''}.`
    }
    case 'stage_changed':
      return `Etapa mudou de ${stageName(e.fromStageId)} para ${stageName(e.toStageId)}.`
    case 'won': {
      const amount = typeof data.amountCents === 'number' ? data.amountCents : null
      if (amount !== null) return `Marcado como ganho, com valor declarado de ${formatCents(amount)}.`
      return data.noAmount ? 'Marcado como ganho, sem valor informado.' : 'Marcado como ganho.'
    }
    case 'lost': {
      const reason = typeof data.lostReasonCode === 'string' ? LOST_REASON_LABEL[data.lostReasonCode as LostReason] : undefined
      return reason ? `Marcado como perdido. Motivo: ${reason}.` : 'Marcado como perdido.'
    }
    case 'reopened': {
      const base = `Reaberto (estava ${statusWord(data.from)})${e.toStageId ? ` na etapa ${stageName(e.toStageId)}` : ''}.`
      // eventos antigos não têm motivo; o texto é de quem reabriu e sai como texto (o React escapa)
      const reason = typeof data.reason === 'string' ? data.reason.trim() : ''
      return reason ? `${base} Motivo: ${reason}${/[.!?…]$/.test(reason) ? '' : '.'}` : base
    }
    case 'archived':
      return 'Negócio arquivado.'
    case 'updated':
    case 'assigned': {
      const fields = Array.isArray(data.fields) ? (data.fields as unknown[]).filter((f): f is string => typeof f === 'string' && f !== 'amountSource') : []
      const parts: string[] = []
      if (e.type === 'assigned') {
        const from = typeof data.from === 'string' ? memberName(data.from) : 'sem responsável'
        const to = typeof data.to === 'string' ? memberName(data.to) : 'sem responsável'
        parts.push(`Responsável trocado de ${from} para ${to}.`)
      }
      const others = fields.filter((f) => !(e.type === 'assigned' && f === 'ownerMemberId')).map((f) => FIELD_LABEL[f] ?? 'outro dado')
      if (data.mergedFrom) parts.push('Pessoa trocada pela junção de contatos duplicados.')
      else if (others.length) parts.push(`Alterou ${[...new Set(others)].join(', ')}.`)
      return parts.join(' ') || 'Dados alterados.'
    }
    case 'divergence':
      if (data.kept === 'conversation') {
        return `Divergência: a conversa foi corrigida como ${statusWord(data.conversation)} e o negócio está ${statusWord(data.deal)}. A correção da conversa foi mantida.`
      }
      return `Divergência: a conversa indica ${statusWord(data.detected)}, mas o negócio está ${statusWord(data.kept)}. Vale revisar.`
    case 'recovery_completed':
      return 'Recuperação da conversa concluída.'
    case 'suggestion_accepted':
      return `Sugestão aceita: ${SUGGESTION_KIND_LABEL[String(data.kind)] ?? 'sugestão do AtendeRadar'}.`
    case 'suggestion_dismissed':
      return `Sugestão dispensada: ${SUGGESTION_KIND_LABEL[String(data.kind)] ?? 'sugestão do AtendeRadar'}.`
    default:
      return 'Alteração registrada.'
  }
}

/** Membros que podem ser responsáveis: ativos, que veem negócios e, para o supervisor com equipe, só os da equipe. */
function assignableMembers(rows: MemberRow[] | undefined, me: { id?: string; role: string; team?: string | null } | null): Member[] {
  const team = me?.role === 'supervisor' ? (me.team?.trim() ?? '') : ''
  return (rows ?? [])
    .filter((m) => m.status === 'active' && can(m.role, 'crm.deals.view') && (!team || m.team?.trim() === team || m.id === me?.id))
    .map((m) => ({ id: m.id, name: m.name }))
}

export default function CrmDealDetail() {
  const id = useAppStore((s) => s.selectedCrmId)
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const selectConversation = useAppStore((s) => s.selectConversation)
  const role = me?.role
  const canManage = can(role, 'crm.deals.manage')
  const canAssign = can(role, 'members.view')
  const canOpenConversation = canOpenView(role, 'conversation-detail')
  const canOpenContact = canOpenView(role, 'crm-contact')
  const canOpenCompany = canOpenView(role, 'crm-company')

  const q = useCrmQuery<DealDetailResponse>(id ? `/api/crm/deals/${encodeURIComponent(id)}` : null)
  const membersQ = useCrmQuery<{ members: MemberRow[] }>(canAssign && canManage ? '/api/members' : null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'won' | 'lost' | 'archive' | 'reopen' | null>(null)
  // erro da API ao reabrir: aparece dentro do diálogo, junto do motivo digitado
  const [reopenError, setReopenError] = useState<{ text: string; field: boolean } | null>(null)
  // depois de reabrir, o foco vai para o título: o «Reabrir», que o receberia de volta, some com o negócio aberto
  const titleRef = useRef<HTMLHeadingElement>(null)
  const focusTitleOnClose = useRef(false)
  const [now] = useState(() => Date.now())

  const back = () => openCrm('deal', null)
  const backButton = (
    <button type="button" className="voltar" onClick={back}>
      <ArrowLeft className="ic" aria-hidden="true" />
      Voltar para negócios
    </button>
  )

  function simpleHeader(sub?: string) {
    return (
      <header className="cab-pagina">
        <div className="cab-pagina__titulo">
          <BriefcaseBusiness className="ic cab-pagina__icone" aria-hidden="true" />
          <div>
            <h1>Negócio</h1>
            {sub && <p>{sub}</p>}
          </div>
        </div>
      </header>
    )
  }

  if (!id || q.error?.code === 'crm_not_found' || (q.error?.status === 404 && !q.data)) {
    return (
      <>
        {backButton}
        {simpleHeader()}
        <div className="cartao vazio" role="status">
          <BriefcaseBusiness className="ic" aria-hidden="true" />
          <strong>Negócio não encontrado</strong>
          {/* arquivado ainda abre aqui (com "Reabrir"); 404 é fora do seu escopo: passou para outro responsável ou equipe */}
          <p>Ele pode ter passado para outro responsável, ou você não tem acesso a ele. Volte para a lista e escolha outro negócio.</p>
          {/* nome diferente do "Voltar para negócios" do topo: dois botões iguais confundem leitor de tela e seletor */}
          <button type="button" className="btn mt-3" onClick={back}>
            Abrir a lista de negócios
          </button>
        </div>
      </>
    )
  }

  if (q.loading || (!q.data && !q.error)) {
    return (
      <>
        {backButton}
        {simpleHeader('Carregando o negócio…')}
        <div className="crm-detalhe" aria-busy="true">
          <span className="sr-only">Carregando o negócio…</span>
          <div className="crm-detalhe__principal">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="crm-detalhe__lateral">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </>
    )
  }

  if (!q.data) {
    return (
      <>
        {backButton}
        {simpleHeader()}
        <div className="cartao vazio" role="alert">
          <TriangleAlert className="ic" aria-hidden="true" />
          <strong>Não foi possível carregar o negócio.</strong>
          <p>{crmErrorMessage(q.error, 'Verifique a conexão e tente novamente.')}</p>
          <button type="button" className="btn mt-3" onClick={q.refetch}>
            Tentar novamente
          </button>
        </div>
      </>
    )
  }

  const { deal, pipeline, events, links } = q.data
  const personId = deal.person?.id ?? null
  const companyId = deal.company?.id ?? null
  const dealId = deal.id
  const names = new Map<string, string>(q.data.members.map((m) => [m.id, m.name]))
  for (const m of membersQ.data?.members ?? []) if (!names.has(m.id)) names.set(m.id, m.name)
  if (me?.id && !names.has(me.id)) names.set(me.id, me.name)
  const memberName = (mid: string | null | undefined) => (mid ? (names.get(mid) ?? 'membro da equipe') : 'sem responsável')
  const stageById = new Map(pipeline.stages.map((s) => [s.id, s]))
  const stageName = (sid: string | null) => (sid ? (stageById.get(sid)?.name ?? 'etapa removida') : 'sem etapa')
  const currentStage = stageById.get(deal.stageId)
  const otherStages = pipeline.stages.filter((s) => s.status === 'active' && s.id !== deal.stageId)
  const isOpen = deal.status === 'open'
  const isArchived = deal.status === 'archived'
  const ownerLabel = deal.ownerMemberId ? (names.get(deal.ownerMemberId) ?? 'Membro da equipe') : 'Sem responsável'
  // mesma regra do cartão no quadro: sem próxima ação escrita, vale a tarefa aberta de prazo mais próximo (sem prazo vem
  // antes, como no SQLite)
  const nextTask = deal.nextAction?.trim()
    ? null
    : (q.data.activities
        .filter((a) => a.status === 'open' || a.status === 'in_progress')
        .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '') || a.createdAt.localeCompare(b.createdAt))[0] ?? null)
  const nextText = deal.nextAction?.trim() || nextTask?.title || (deal.nextActionAt ? 'Próxima ação' : null)
  const nextAt = deal.nextAction?.trim() || !nextTask ? deal.nextActionAt : nextTask.dueAt
  const nextLate = !!nextAt && isOpen && new Date(nextAt).getTime() < now
  const owners = canAssign && canManage ? assignableMembers(membersQ.data?.members, me) : null

  async function run<T>(key: string, fn: () => Promise<T>, ok: (r: T) => string, after?: (r: T) => void): Promise<boolean> {
    setBusy(key)
    try {
      const r = await fn()
      toast.success(ok(r))
      after?.(r)
      return true
    } catch (e) {
      // conflito, transição inválida ou negócio que sumiu (arquivado/sem acesso): recarrega para a tela mostrar o estado real
      if (e instanceof CrmApiError && (e.code === 'crm_version_conflict' || e.code === 'crm_invalid_transition' || e.code === 'crm_invalid' || e.code === 'crm_not_found')) q.refetch()
      toast.error(crmErrorMessage(e))
      return false
    } finally {
      setBusy(null)
    }
  }

  const url = `/api/crm/deals/${encodeURIComponent(dealId)}`

  function moveTo(stageId: string) {
    const name = stageName(stageId)
    void run('stage', () => crmSend<DealResponse>(`${url}/stage`, { json: { stageId, version: deal.version } }), () => `Negócio movido para ${name}.`, q.refetch)
  }

  function openReopen() {
    setReopenError(null)
    focusTitleOnClose.current = false
    setDialog('reopen')
  }

  function closeReopen() {
    focusTitleOnClose.current = true
    setDialog(null)
  }

  async function reopen(reason: string) {
    setBusy('reopen')
    setReopenError(null)
    try {
      await crmSend<DealResponse>(`${url}/reopen`, { json: { version: deal.version, reason } })
      toast.success('Negócio reaberto.')
      closeReopen()
      q.refetch()
    } catch (e) {
      const code = e instanceof CrmApiError ? e.code : null
      // já aberto (outra pessoa reabriu) ou fora do seu alcance: não há o que reabrir; fecha, avisa e recarrega
      if (code === 'crm_invalid_transition' || code === 'crm_not_found') {
        closeReopen()
        toast.error(crmErrorMessage(e))
        q.refetch()
        return
      }
      if (code === 'crm_version_conflict') {
        // a mudança da outra pessoa foi a reabertura: o diálogo perde o sentido. Senão fica aberto, com o motivo digitado
        const fresh = await crmGet<DealDetailResponse>(url).catch(() => null)
        q.refetch()
        if (fresh?.deal.status === 'open') {
          closeReopen()
          toast.info('Outra pessoa já reabriu este negócio.')
          return
        }
      }
      setReopenError({ text: crmErrorMessage(e), field: code === 'crm_invalid' })
    } finally {
      setBusy(null)
    }
  }

  async function closeWon(input: { amountCents: number | null; noAmount: boolean; note: string }) {
    const json: Record<string, unknown> = { outcome: 'won', version: deal.version }
    if (input.noAmount) json.confirmNoAmount = true
    // o mesmo valor já declarado não é reenviado: sem amountCents o servidor usa o do negócio e mantém a origem
    // ("Dito na conversa", "Importado"); reenviar trocaria a origem por "Informado por você" sem nada ter mudado
    else if (input.amountCents !== null && input.amountCents !== deal.amountCents) json.amountCents = input.amountCents
    if (input.note) json.note = input.note
    const ok = await run(
      'won',
      () => crmSend<CloseResponse>(`${url}/close`, { json }),
      (r) => {
        const n = r.conversations?.reflected ?? 0
        return n > 0 ? `Negócio marcado como ganho. ${n === 1 ? 'A conversa vinculada também foi marcada.' : `${n} conversas vinculadas também foram marcadas.`}` : 'Negócio marcado como ganho.'
      },
      q.refetch,
    )
    if (ok) setDialog(null)
  }

  async function closeLost(input: { reason: LostReason; note: string }) {
    const json: Record<string, unknown> = { outcome: 'lost', version: deal.version, lostReasonCode: input.reason }
    if (input.note) json.note = input.note
    const ok = await run(
      'lost',
      () => crmSend<CloseResponse>(`${url}/close`, { json }),
      (r) => {
        const n = r.conversations?.reflected ?? 0
        return n > 0 ? `Negócio marcado como perdido. ${n === 1 ? 'A conversa vinculada também foi marcada.' : `${n} conversas vinculadas também foram marcadas.`}` : 'Negócio marcado como perdido.'
      },
      q.refetch,
    )
    if (ok) setDialog(null)
  }

  async function archive() {
    const ok = await run('archive', () => crmSend<DealResponse>(url, { method: 'DELETE', json: { version: deal.version } }), () => 'Negócio arquivado.')
    if (ok) {
      setDialog(null)
      back()
    }
  }

  async function save(patch: Record<string, unknown>): Promise<boolean> {
    return run('save', () => crmSend<DealResponse>(url, { method: 'PATCH', json: { ...patch, version: deal.version } }), () => 'Alterações salvas.', q.refetch)
  }

  const conversationLinks = (() => {
    const seen = new Set<string>()
    return links.filter((l): l is DealLink & { conversationId: string } => {
      if (!l.conversationId || seen.has(l.conversationId)) return false
      seen.add(l.conversationId)
      return true
    })
  })()

  const actions = canManage && (
    <div className="cab-pagina__acoes">
      {isOpen && otherStages.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn" disabled={!!busy}>
              <ArrowRightLeft className="ic" aria-hidden="true" />
              {busy === 'stage' ? 'Movendo…' : 'Mover de etapa'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Mover para a etapa</DropdownMenuLabel>
            {otherStages.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => moveTo(s.id)}>
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {isOpen && (
        <>
          <button type="button" className="btn btn--primario" disabled={!!busy} onClick={() => setDialog('won')}>
            <CircleCheck className="ic" aria-hidden="true" />
            Marcar como ganho
          </button>
          <button type="button" className="btn" disabled={!!busy} onClick={() => setDialog('lost')}>
            <CircleX className="ic" aria-hidden="true" />
            Marcar como perdido
          </button>
        </>
      )}
      {!isOpen && (
        <button type="button" className={cn('btn', isArchived && 'btn--primario')} disabled={!!busy} onClick={openReopen}>
          <RotateCcw className="ic" aria-hidden="true" />
          Reabrir
        </button>
      )}
      {!isArchived && (
        <button type="button" className="btn" disabled={!!busy} onClick={() => setDialog('archive')}>
          <Archive className="ic" aria-hidden="true" />
          Arquivar
        </button>
      )}
    </div>
  )

  return (
    <>
      {backButton}
      <header className="cab-pagina">
        <div className="cab-pagina__titulo">
          <BriefcaseBusiness className="ic cab-pagina__icone" aria-hidden="true" />
          <div className="crm-detalhe__cab">
            <h1 ref={titleRef} tabIndex={-1} className="outline-none">
              {deal.title}
            </h1>
            <p className="crm-detalhe__resumo">
              <span className={cn('tag', DEAL_STATUS_TAG[deal.status] ?? 'tag--cinza')}>
                <span className="ponto" aria-hidden="true" />
                {DEAL_STATUS_LABEL[deal.status] ?? deal.status}
              </span>
              <span>
                Etapa: {currentStage?.name ?? 'etapa removida'}
                {currentStage && currentStage.status !== 'active' ? ' (inativa)' : ''}
              </span>
              <span>Responsável: {ownerLabel}</span>
            </p>
          </div>
        </div>
        {actions}
      </header>

      {q.error && (
        <div className="aviso aviso--ambar" role="alert">
          <TriangleAlert className="ic aviso__ic" aria-hidden="true" />
          <span>
            Não foi possível atualizar agora. Você está vendo a última versão carregada.{' '}
            <button type="button" className="btn btn--sm btn--link" onClick={q.refetch}>
              Tentar novamente
            </button>
          </span>
        </div>
      )}

      <div className="crm-detalhe">
        <div className="crm-detalhe__principal">
          <section className="cartao" aria-labelledby="crm-negocio-resumo">
            <div className="cartao__cab">
              <div>
                <h2 id="crm-negocio-resumo">Resumo</h2>
                <p>Valor declarado é o combinado com o cliente. A estimativa vem da conversa e não é receita.</p>
              </div>
            </div>
            <div className="cartao__corpo">
              <dl className="crm-dados">
                <div>
                  <dt>Funil e etapa</dt>
                  <dd>
                    {pipeline.name} · {currentStage?.name ?? 'etapa removida'}
                    {currentStage && currentStage.status !== 'active' ? ' (inativa)' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{ownerLabel}</dd>
                </div>
                <div>
                  <dt>Valor declarado</dt>
                  <dd>
                    {formatCents(deal.amountCents)}
                    {deal.amountCents !== null && <span className="crm-valor-fonte">{AMOUNT_SOURCE_LABEL[deal.amountSource] ?? 'Origem não informada'}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Estimativa (não é receita)</dt>
                  <dd>
                    {deal.estimatedAmountCents !== null ? (
                      <>
                        <span className="crm-estimado">Estimado: {formatCents(deal.estimatedAmountCents)}</span>
                        <span className="crm-valor-fonte">Tirado da conversa. Não soma com o valor declarado.</span>
                      </>
                    ) : (
                      <span className="suave">Sem estimativa</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Origem</dt>
                  <dd>{DEAL_SOURCE_LABEL[deal.source as keyof typeof DEAL_SOURCE_LABEL] ?? 'Não informada'}</dd>
                </div>
                <div>
                  <dt>Prioridade</dt>
                  <dd>{PRIORITY_LABEL[deal.priority as keyof typeof PRIORITY_LABEL] ?? 'Normal'}</dd>
                </div>
                <div>
                  <dt>Pessoa</dt>
                  <dd>
                    {deal.person ? (
                      <span className="pilha">
                        {canOpenContact ? (
                          <button type="button" className="crm-link" onClick={() => openCrm('contact', personId)}>
                            {deal.person.name}
                          </button>
                        ) : (
                          deal.person.name
                        )}
                        {deal.person.phoneLast4 && <small className="crm-fone">•••• {deal.person.phoneLast4}</small>}
                      </span>
                    ) : (
                      <span className="suave">Sem pessoa</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Empresa</dt>
                  <dd>
                    {deal.company ? (
                      canOpenCompany ? (
                        <button type="button" className="crm-link" onClick={() => openCrm('company', companyId)}>
                          {deal.company.name}
                        </button>
                      ) : (
                        deal.company.name
                      )
                    ) : (
                      <span className="suave">Sem empresa</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Previsão de fechamento</dt>
                  <dd>{deal.expectedCloseAt ? fmtDate(deal.expectedCloseAt) : <span className="suave">Sem previsão</span>}</dd>
                </div>
                <div>
                  <dt>Próxima ação</dt>
                  <dd>
                    {nextText ? (
                      <span className="linha-flex envolve">
                        <span>
                          {nextText}
                          {nextAt ? ` · ${fmtDate(nextAt)}` : ''}
                          {nextTask && <span className="suave"> (tarefa)</span>}
                        </span>
                        {nextLate && (
                          <span className="tag tag--vermelho">
                            <TriangleAlert className="ic" aria-hidden="true" />
                            Atrasado
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="suave">Nenhuma definida</span>
                    )}
                  </dd>
                </div>
                {deal.closedAt && !isOpen && (
                  <div>
                    <dt>Fechado em</dt>
                    <dd>{fmtDateTime(deal.closedAt)}</dd>
                  </div>
                )}
                {deal.status === 'lost' && deal.lostReasonCode && (
                  <div>
                    <dt>Motivo da perda</dt>
                    <dd>{LOST_REASON_LABEL[deal.lostReasonCode as LostReason] ?? 'Outro motivo'}</dd>
                  </div>
                )}
                {deal.outcomeNote && !isOpen && (
                  <div className="crm-dados__todo">
                    <dt>Nota do fechamento</dt>
                    <dd>
                      <p>{deal.outcomeNote}</p>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          {canManage && (
            <section className="cartao" aria-labelledby="crm-negocio-editar">
              <div className="cartao__cab">
                <div>
                  <h2 id="crm-negocio-editar">Editar negócio</h2>
                  <p>Só o que você mudar é gravado.</p>
                </div>
              </div>
              <div className="cartao__corpo">
                <DealEditForm
                  key={`${deal.id}:${deal.version}`}
                  deal={deal}
                  owners={owners}
                  ownersLoading={membersQ.loading}
                  ownerName={ownerLabel}
                  me={me?.id ? { id: me.id, name: me.name } : null}
                  disabled={isArchived}
                  sending={busy === 'save'}
                  blocked={!!busy}
                  onSave={save}
                />
              </div>
            </section>
          )}

          <section className="cartao" aria-labelledby="crm-negocio-historico">
            <div className="cartao__cab">
              <div>
                <h2 id="crm-negocio-historico">
                  <History className="ic" aria-hidden="true" />
                  Histórico
                </h2>
                <p>O que mudou neste negócio, do mais recente para o mais antigo.</p>
              </div>
            </div>
            <div className="cartao__corpo">
              {events.length === 0 ? (
                <div className="vazio">
                  <History className="ic mx-auto" aria-hidden="true" />
                  <strong>Nada registrado ainda</strong>
                  <p>As mudanças de etapa, valor e responsável aparecem aqui.</p>
                </div>
              ) : (
                <ol className="crm-historico">
                  {events.map((e) => {
                    const author = e.actorMemberId ? memberName(e.actorMemberId) : (e.actorLabel ?? (e.origin === 'system' ? 'AtendeRadar' : 'Sistema'))
                    return (
                      <li key={e.id}>
                        {/* pre-line: o motivo da reabertura vem de um campo de várias linhas e mantém as quebras */}
                        <span className="crm-historico__texto whitespace-pre-line">{eventText(e, stageName, memberName)}</span>
                        <span className="crm-historico__quando">
                          <time dateTime={e.createdAt}>{fmtDateTime(e.createdAt)}</time> · por {author}
                          {e.origin === 'suggested' ? ' (por sugestão)' : ''}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>

        <div className="crm-detalhe__lateral">
          <SuggestionsPanel dealId={dealId} onChanged={q.refetch} />
          <ActivityList dealId={dealId} compact onChanged={q.refetch} />
          <section className="cartao" aria-labelledby="crm-negocio-conversas">
            <div className="cartao__cab">
              <div>
                <h2 id="crm-negocio-conversas">
                  <MessageSquare className="ic" aria-hidden="true" />
                  Conversas vinculadas
                </h2>
                <p>Conversas do WhatsApp ligadas a este negócio.</p>
              </div>
            </div>
            <div className="cartao__corpo">
              {conversationLinks.length === 0 ? (
                <div className="vazio">
                  <MessageSquare className="ic mx-auto" aria-hidden="true" />
                  <strong>Nenhuma conversa vinculada</strong>
                  <p>Negócios criados a partir de uma oportunidade ou sugestão já chegam com a conversa.</p>
                </div>
              ) : (
                <ul className="crm-vinculos">
                  {conversationLinks.map((l) => (
                    <li key={l.id}>
                      <span className="pilha">
                        {LINK_TYPE_LABEL[l.relationshipType] ?? 'Conversa vinculada'}
                        <small className="suave">Desde {fmtDateTime(l.createdAt)}</small>
                      </span>
                      {canOpenConversation && (
                        <button type="button" className="btn btn--sm" onClick={() => selectConversation(l.conversationId)}>
                          Abrir conversa
                          <span className="sr-only"> vinculada em {fmtDateTime(l.createdAt)}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {canManage && (
        <>
          <Dialog open={dialog === 'won'} onOpenChange={(o) => !o && busy !== 'won' && setDialog(null)}>
            <DialogContent className="sm:max-w-md">
              <WonForm initialCents={deal.amountCents} sending={busy === 'won'} onCancel={() => setDialog(null)} onConfirm={closeWon} />
            </DialogContent>
          </Dialog>
          <Dialog open={dialog === 'lost'} onOpenChange={(o) => !o && busy !== 'lost' && setDialog(null)}>
            <DialogContent className="sm:max-w-md">
              <LostForm sending={busy === 'lost'} onCancel={() => setDialog(null)} onConfirm={closeLost} />
            </DialogContent>
          </Dialog>
          {/* !isOpen: um negócio que já voltou aberto não mostra o convite para reabrir */}
          <Dialog open={dialog === 'reopen' && !isOpen} onOpenChange={(o) => !o && busy !== 'reopen' && setDialog(null)}>
            <DialogContent
              className="max-h-[90vh] overflow-y-auto sm:max-w-md"
              onCloseAutoFocus={(e) => {
                if (!focusTitleOnClose.current) return
                focusTitleOnClose.current = false
                e.preventDefault()
                titleRef.current?.focus()
              }}
            >
              <ReopenForm
                status={deal.status}
                sending={busy === 'reopen'}
                serverError={reopenError}
                onEdit={() => setReopenError(null)}
                onCancel={() => setDialog(null)}
                onConfirm={reopen}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={dialog === 'archive'} onOpenChange={(o) => !o && busy !== 'archive' && setDialog(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Arquivar negócio</DialogTitle>
                <DialogDescription>
                  “{deal.title}” sai do quadro e da lista. O histórico fica guardado e dá para reabrir depois, na lista, filtrando por arquivados.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy === 'archive'} onClick={() => setDialog(null)}>
                  Cancelar
                </Button>
                <Button type="button" variant="destructive" disabled={busy === 'archive'} onClick={() => void archive()}>
                  {busy === 'archive' ? 'Arquivando…' : 'Arquivar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  )
}

function DealEditForm(props: {
  deal: DealFull
  owners: Member[] | null
  ownersLoading: boolean
  ownerName: string
  me: Member | null
  disabled: boolean
  sending: boolean
  blocked: boolean
  onSave: (patch: Record<string, unknown>) => Promise<boolean>
}) {
  const { deal, owners, ownersLoading, ownerName, me, disabled, sending, blocked, onSave } = props
  const [title, setTitle] = useState(deal.title)
  const [amount, setAmount] = useState(centsToInput(deal.amountCents))
  const [ownerId, setOwnerId] = useState(deal.ownerMemberId ?? '')
  const [priority, setPriority] = useState<string>(deal.priority)
  const [expected, setExpected] = useState(dateInput(deal.expectedCloseAt))
  const [nextAction, setNextAction] = useState(deal.nextAction ?? '')
  const [nextDate, setNextDate] = useState(dateInput(deal.nextActionAt))
  const [error, setError] = useState<{ field: 'title' | 'amount'; text: string } | null>(null)

  const patch: Record<string, unknown> = {}
  const t = title.trim()
  if (t !== deal.title) patch.title = t.slice(0, 160)
  const cents = centsFromInput(amount)
  if (cents !== deal.amountCents) patch.amountCents = cents
  if (owners && (ownerId || null) !== deal.ownerMemberId) patch.ownerMemberId = ownerId || null
  if (priority !== deal.priority) patch.priority = priority
  if (expected !== dateInput(deal.expectedCloseAt)) patch.expectedCloseAt = isoFromDate(expected, 12, 0)
  const na = nextAction.trim()
  if ((na || null) !== (deal.nextAction ?? null)) patch.nextAction = na ? na.slice(0, 200) : null
  if (nextDate !== dateInput(deal.nextActionAt)) patch.nextActionAt = isoFromDate(nextDate, 23, 59)
  const dirty = Object.keys(patch).length > 0

  // o responsável atual pode não estar na lista (inativo ou de outra equipe): continua como opção
  const ownerOptions = owners ? [...owners] : []
  if (owners && deal.ownerMemberId && !ownerOptions.some((m) => m.id === deal.ownerMemberId)) ownerOptions.push({ id: deal.ownerMemberId, name: ownerName })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!t) {
      setError({ field: 'title', text: 'Informe o título do negócio.' })
      return
    }
    if (cents !== null && cents > MAX_AMOUNT_CENTS) {
      setError({ field: 'amount', text: AMOUNT_LIMIT_MSG })
      return
    }
    if (!dirty) return
    setError(null)
    await onSave(patch)
  }

  function reset() {
    setTitle(deal.title)
    setAmount(centsToInput(deal.amountCents))
    setOwnerId(deal.ownerMemberId ?? '')
    setPriority(deal.priority)
    setExpected(dateInput(deal.expectedCloseAt))
    setNextAction(deal.nextAction ?? '')
    setNextDate(dateInput(deal.nextActionAt))
    setError(null)
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <fieldset className="crm-edicao" disabled={disabled}>
        <legend className="sr-only">Dados do negócio</legend>
        {disabled && (
          <p className="crm-edicao__todo aviso aviso--ambar" role="status">
            <TriangleAlert className="ic aviso__ic" aria-hidden="true" />
            <span>Negócio arquivado: reabra para editar.</span>
          </p>
        )}
        <div className="campo crm-edicao__todo">
          <label htmlFor="crm-ed-titulo">Título</label>
          <input
            id="crm-ed-titulo"
            className="entrada"
            value={title}
            maxLength={160}
            required
            aria-invalid={error?.field === 'title'}
            aria-describedby={error?.field === 'title' ? 'crm-ed-erro' : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="crm-ed-valor">Valor declarado</label>
          <input
            id="crm-ed-valor"
            className="entrada"
            placeholder="0,00"
            aria-invalid={error?.field === 'amount'}
            aria-describedby={error?.field === 'amount' ? 'crm-ed-valor-dica crm-ed-erro' : 'crm-ed-valor-dica'}
            {...moneyProps(amount, setAmount)}
          />
          <span id="crm-ed-valor-dica" className="crm-edicao__dica">
            Em reais. Em branco fica como não informado; a estimativa da conversa não entra aqui.
          </span>
        </div>
        <div className="campo">
          <label htmlFor="crm-ed-prioridade">Prioridade</label>
          <select id="crm-ed-prioridade" className="selecao" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {owners && (
          <div className="campo">
            <label htmlFor="crm-ed-responsavel">Responsável</label>
            <select id="crm-ed-responsavel" className="selecao" value={ownerId} disabled={ownersLoading} onChange={(e) => setOwnerId(e.target.value)}>
              {me && <option value={me.id}>Eu ({me.name})</option>}
              {ownerOptions
                .filter((m) => m.id !== me?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              <option value="">Sem responsável</option>
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="crm-ed-previsao">Previsão de fechamento</label>
          <input id="crm-ed-previsao" className="entrada" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="crm-ed-proxima">Próxima ação</label>
          <input id="crm-ed-proxima" className="entrada" value={nextAction} maxLength={200} placeholder="Ex.: Enviar a proposta" onChange={(e) => setNextAction(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="crm-ed-proxima-data">Data da próxima ação</label>
          <input id="crm-ed-proxima-data" className="entrada" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </div>
        {error && (
          <p id="crm-ed-erro" role="alert" className="crm-edicao__todo text-sm text-[var(--vermelho)]">
            {error.text}
          </p>
        )}
        <div className="crm-edicao__acoes">
          {dirty && !disabled && (
            <button type="button" className="btn" disabled={sending} onClick={reset}>
              Descartar alterações
            </button>
          )}
          <button type="submit" className="btn btn--primario" disabled={disabled || !dirty || sending || blocked}>
            {sending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </fieldset>
    </form>
  )
}

function WonForm(props: {
  initialCents: number | null
  sending: boolean
  onCancel: () => void
  onConfirm: (input: { amountCents: number | null; noAmount: boolean; note: string }) => Promise<void>
}) {
  const { initialCents, sending, onCancel, onConfirm } = props
  // com valor já declarado, "fechou sem valor" não existe: o servidor manteria o valor antigo e a opção enganaria.
  // Para fechar sem valor, a pessoa apaga o valor em "Editar negócio" antes.
  const hasDeclared = initialCents !== null
  const [amount, setAmount] = useState(centsToInput(initialCents))
  const [noAmount, setNoAmount] = useState(false)
  const [note, setNote] = useState('')
  const cents = centsFromInput(amount)
  const overLimit = !noAmount && cents !== null && cents > MAX_AMOUNT_CENTS
  const ready = (noAmount && !hasDeclared) || (cents !== null && cents > 0 && !overLimit)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || sending) return
    const none = noAmount && !hasDeclared
    void onConfirm({ amountCents: none ? null : cents, noAmount: none, note: note.trim().slice(0, 1000) })
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Marcar como ganho</DialogTitle>
        <DialogDescription>Informe o valor fechado com o cliente. Ele vira o valor declarado do negócio; a estimativa da conversa não conta como receita.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="crm-won-valor">Valor da venda</Label>
        <Input
          id="crm-won-valor"
          placeholder="0,00"
          disabled={noAmount}
          aria-invalid={overLimit}
          aria-describedby={overLimit ? 'crm-won-valor-dica crm-won-erro' : 'crm-won-valor-dica'}
          {...moneyProps(amount, setAmount)}
        />
        <p id="crm-won-valor-dica" className="text-xs text-[var(--suave)]">
          {hasDeclared ? 'Em reais. Já vem com o valor declarado do negócio; altere se a venda fechou por outro valor.' : 'Em reais. Se ninguém sabe o valor, marque a opção abaixo.'}
        </p>
        {overLimit && (
          <p id="crm-won-erro" role="alert" className="text-sm text-[var(--vermelho)]">
            {AMOUNT_LIMIT_MSG}
          </p>
        )}
      </div>
      {!hasDeclared && (
        <div className="flex items-start gap-2">
          <input
            id="crm-won-sem-valor"
            type="checkbox"
            className="mt-1 size-4 accent-[var(--verde-600)]"
            checked={noAmount}
            onChange={(e) => setNoAmount(e.target.checked)}
          />
          <Label htmlFor="crm-won-sem-valor" className="font-normal leading-snug">
            Fechou sem valor informado
          </Label>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="crm-won-nota">Nota (opcional)</Label>
        <Textarea id="crm-won-nota" value={note} maxLength={1000} rows={3} placeholder="Ex.: Pagamento na entrega" onChange={(e) => setNote(e.target.value)} />
      </div>
      {!ready && !overLimit && (
        <p className="text-sm text-[var(--suave)]" aria-live="polite">
          {hasDeclared ? 'Para confirmar, informe um valor maior que zero.' : 'Para confirmar, informe um valor maior que zero ou marque “Fechou sem valor informado”.'}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={sending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!ready || sending}>
          {sending ? 'Confirmando…' : 'Confirmar ganho'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function LostForm(props: { sending: boolean; onCancel: () => void; onConfirm: (input: { reason: LostReason; note: string }) => Promise<void> }) {
  const { sending, onCancel, onConfirm } = props
  const [reason, setReason] = useState<LostReason | ''>('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!reason || sending) return
    void onConfirm({ reason, note: note.trim().slice(0, 1000) })
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Marcar como perdido</DialogTitle>
        <DialogDescription>O motivo da perda é obrigatório e entra nos relatórios do CRM.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="crm-lost-motivo">Motivo da perda</Label>
        <select
          id="crm-lost-motivo"
          className={SELECT_CLASS}
          value={reason}
          required
          aria-invalid={touched && !reason}
          aria-describedby={touched && !reason ? 'crm-lost-erro' : undefined}
          onChange={(e) => setReason(e.target.value as LostReason | '')}
        >
          <option value="">Escolha o motivo</option>
          {LOST_REASONS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        {touched && !reason && (
          <p id="crm-lost-erro" role="alert" className="text-sm text-[var(--vermelho)]">
            Escolha o motivo da perda.
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="crm-lost-nota">Nota (opcional)</Label>
        <Textarea id="crm-lost-nota" value={note} maxLength={1000} rows={3} placeholder="Ex.: Fechou com outro fornecedor" onChange={(e) => setNote(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={sending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!reason || sending}>
          {sending ? 'Confirmando…' : 'Confirmar perda'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ReopenForm(props: {
  status: string
  sending: boolean
  serverError: { text: string; field: boolean } | null
  /** Ao editar o motivo, o erro da API some (ele falava do texto anterior). */
  onEdit: () => void
  onCancel: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const { status, sending, serverError, onEdit, onCancel, onConfirm } = props
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const text = reason.trim()
  // a mesma regra do servidor: invisíveis não contam para o mínimo, e controle e bidi são recusados
  const problem = reopenReasonError(text)
  const clientError = touched ? problem : null
  const error = clientError ?? serverError?.text ?? null
  const fieldInvalid = !!clientError || !!serverError?.field

  // erro da API: o foco volta ao campo, que o erro descreve (o botão de enviar não o perde: fica aria-disabled)
  useEffect(() => {
    if (serverError) fieldRef.current?.focus()
  }, [serverError])

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (sending) return
    if (problem) {
      fieldRef.current?.focus()
      return
    }
    void onConfirm(text)
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Reabrir negócio</DialogTitle>
        <DialogDescription>
          Este negócio está {statusWord(status)}. Ao reabrir, ele volta para a etapa em que estava. O motivo fica no histórico, com o seu nome e a data.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="crm-reopen-motivo">Motivo da reabertura</Label>
        <Textarea
          ref={fieldRef}
          id="crm-reopen-motivo"
          value={reason}
          maxLength={REOPEN_REASON.max}
          rows={3}
          required
          aria-invalid={fieldInvalid}
          aria-describedby={error ? 'crm-reopen-dica crm-reopen-erro' : 'crm-reopen-dica'}
          placeholder="Ex.: O cliente pediu um novo orçamento"
          className="max-h-48"
          onChange={(e) => {
            setReason(e.target.value)
            if (serverError) onEdit()
          }}
        />
        <p id="crm-reopen-dica" className="text-xs text-[var(--suave)]">
          Obrigatório, de {REOPEN_REASON.min} a {REOPEN_REASON.max} caracteres.
        </p>
        {error && (
          <p id="crm-reopen-erro" role="alert" className="text-sm text-[var(--vermelho)]">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={sending} onClick={onCancel}>
          Cancelar
        </Button>
        {/* aria-disabled (e não disabled) enquanto envia: o botão desabilitado jogaria o foco para fora do diálogo */}
        <Button type="submit" aria-disabled={sending || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
          {sending ? 'Reabrindo…' : 'Reabrir negócio'}
        </Button>
      </DialogFooter>
    </form>
  )
}
