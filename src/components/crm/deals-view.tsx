'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { ArrowRightLeft, BriefcaseBusiness, CalendarClock, ChevronLeft, ChevronRight, GripVertical, LayoutGrid, List, Plus, Search, TriangleAlert, User, X } from 'lucide-react'
import { toast } from 'sonner'
import { SuggestionsPanel } from '@/components/crm/suggestions-panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { CrmApiError, crmErrorMessage, crmGet, crmSend, useCrmQuery, type CrmDeal, type CrmPipeline } from '@/lib/crm/client'
import { DEAL_STATUS_LABEL, DEAL_STATUS_TAG, PRIORITY_LABEL } from '@/lib/crm/labels'
import { formatCents, MAX_AMOUNT_CENTS } from '@/lib/crm/money'
import { moneyProps } from '@/lib/money-input'
import { can, canOpenView } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// Negócios do CRM: quadro (Kanban por etapa, com arrastar e com o botão "Mover" para quem usa teclado) e lista
// paginada. Valor declarado e estimado nunca se somam: a coluna mostra só o total declarado, e a estimativa aparece
// sempre rotulada. Toda mudança manda a `version` lida; a criação vai com Idempotency-Key.

type Member = { id: string; name: string }

type DealCard = CrmDeal & {
  person: { id: string; name: string; phoneLast4: string | null } | null
  company: { id: string; name: string } | null
  nextTask: { id: string; title: string; dueAt: string | null } | null
}

type BoardColumn = {
  stage: { id: string; name: string; position: number; probability: number; slaDays: number | null }
  total: number
  declaredCents: number
  deals: DealCard[]
  nextCursor: string | null
}

type BoardResponse = {
  pipeline: CrmPipeline | null
  pipelines: { id: string; name: string; isDefault: boolean }[]
  columns: BoardColumn[]
  members: Member[]
}

type ListResponse = { items: DealCard[]; total: number; page: number; limit: number; members: Member[] }

type MemberRow = { id: string; name: string; role: string; team: string | null; status: string }

type PersonHit = { id: string; name: string; phoneLast4: string | null }

type ListStatus = 'open' | 'won' | 'lost' | 'archived' | ''

const SELECT_CLASS =
  'flex h-10 w-full rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie)] px-3 text-sm text-[var(--texto)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50'

const PRIORITIES = Object.entries(PRIORITY_LABEL) as [keyof typeof PRIORITY_LABEL, string][]

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const DRAG_INSTRUCTIONS =
  'Para mudar a etapa de um negócio, foque a alça de arrastar e aperte Espaço ou Enter. Use as setas para a esquerda e para a direita para escolher a etapa, Espaço ou Enter para soltar e Esc para cancelar. O botão Mover faz o mesmo por um menu.'

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

/** Texto puro do campo de reais ("1234.56" ou "") → centavos inteiros; vazio = null (não informado). Sem teto aqui:
 *  acima do limite o formulário mostra o erro, e nunca grava um valor diferente do digitado. */
function centsFromInput(v: string): number | null {
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

const AMOUNT_LIMIT_MSG = `Valor acima do limite de ${formatCents(MAX_AMOUNT_CENTS)}.`

/** Data do campo (AAAA-MM-DD, hora local) → ISO em UTC. */
function isoFromDate(date: string, hh: number, mm: number): string | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

/** Membros que podem ser responsáveis: ativos, que veem negócios e, para o supervisor com equipe, só os da equipe. */
function assignableMembers(rows: MemberRow[] | undefined, me: { id?: string; role: string; team?: string | null } | null): Member[] {
  const team = me?.role === 'supervisor' ? (me.team?.trim() ?? '') : ''
  return (rows ?? [])
    .filter((m) => m.status === 'active' && can(m.role, 'crm.deals.view') && (!team || m.team?.trim() === team || m.id === me?.id))
    .map((m) => ({ id: m.id, name: m.name }))
}

/** Tira o negócio da coluna em que está e põe na etapa de destino (na posição `index`, padrão no topo). */
function relocate(columns: BoardColumn[], dealId: string, toStageId: string, opts: { patch?: Partial<DealCard>; index?: number } = {}): BoardColumn[] {
  const from = columns.find((c) => c.deals.some((d) => d.id === dealId))
  const card = from?.deals.find((d) => d.id === dealId)
  if (!from || !card || !columns.some((c) => c.stage.id === toStageId)) return columns
  const moved: DealCard = { ...card, ...opts.patch, stageId: toStageId }
  return columns.map((c) => {
    let next = c
    if (c.stage.id === from.stage.id) {
      next = { ...c, deals: c.deals.filter((d) => d.id !== dealId), total: Math.max(0, c.total - 1), declaredCents: Math.max(0, c.declaredCents - (card.amountCents ?? 0)) }
    }
    if (c.stage.id === toStageId) {
      const deals = [...next.deals]
      deals.splice(Math.min(Math.max(0, opts.index ?? 0), deals.length), 0, moved)
      next = { ...next, deals, total: next.total + 1, declaredCents: next.declaredCents + (moved.amountCents ?? 0) }
    }
    return next
  })
}

function patchCard(columns: BoardColumn[], dealId: string, deal: CrmDeal): BoardColumn[] {
  return columns.map((c) => (c.deals.some((d) => d.id === dealId) ? { ...c, deals: c.deals.map((d) => (d.id === dealId ? { ...d, ...deal } : d)) } : c))
}

function nextStep(deal: DealCard): { text: string; at: string | null } | null {
  if (deal.nextAction?.trim()) return { text: deal.nextAction.trim(), at: deal.nextActionAt }
  if (deal.nextTask) return { text: deal.nextTask.title, at: deal.nextTask.dueAt }
  if (deal.nextActionAt) return { text: 'Próxima ação', at: deal.nextActionAt }
  return null
}

/** Setas para os lados pulam de uma etapa para a vizinha (o padrão do dnd-kit anda 25 px). */
const columnJump: KeyboardCoordinateGetter = (event, { context }) => {
  const dir = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0
  if (!dir) return undefined
  event.preventDefault()
  const rect = context.collisionRect
  if (!rect) return undefined
  const center = rect.left + rect.width / 2
  const rects = Array.from(context.droppableRects.values()).sort((a, b) => a.left - b.left)
  const target = dir > 0 ? rects.find((r) => r.left > center) : [...rects].reverse().find((r) => r.left + r.width < center)
  if (!target) return undefined
  return { x: target.left + 12, y: target.top + 48 }
}

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : rectIntersection(args)
}

function DealValue({ deal }: { deal: Pick<CrmDeal, 'amountCents' | 'estimatedAmountCents'> }) {
  if (deal.amountCents !== null) return <span className="crm-cartao__valor">{formatCents(deal.amountCents)}</span>
  if (deal.estimatedAmountCents !== null) {
    return (
      <span className="crm-estimado" title="Estimativa tirada da conversa. Não é receita.">
        Estimado: {formatCents(deal.estimatedAmountCents)}
        <span className="sr-only"> (estimativa, não é receita)</span>
      </span>
    )
  }
  return <span className="suave">Valor não informado</span>
}

function StageColumn(props: { col: BoardColumn; dragActive: boolean; loadingMore: boolean; onLoadMore: () => void; children: ReactNode }) {
  const { col, dragActive, loadingMore, onLoadMore, children } = props
  const { setNodeRef, isOver } = useDroppable({ id: col.stage.id, data: { name: col.stage.name } })
  const anyDeclared = col.declaredCents > 0 || col.deals.some((d) => d.amountCents !== null)
  const titleId = `crm-etapa-${col.stage.id}`
  return (
    <section ref={setNodeRef} className={cn('crm-coluna', isOver && dragActive && 'crm-coluna--alvo')} aria-labelledby={titleId}>
      <div className="crm-coluna__cab">
        <div className="crm-coluna__titulo">
          <h2 id={titleId}>{col.stage.name}</h2>
          <span className="contador-pill contador-pill--cinza">
            {col.total}
            <span className="sr-only"> {col.total === 1 ? 'negócio' : 'negócios'}</span>
          </span>
        </div>
        <p className="crm-coluna__total">{anyDeclared ? `${formatCents(col.declaredCents)} declarado` : 'Sem valor declarado'}</p>
        {isOver && dragActive && <span className="crm-coluna__soltar">Soltar aqui</span>}
      </div>
      <ul className="crm-coluna__lista" aria-labelledby={titleId}>
        {col.deals.length === 0 ? <li className="crm-coluna__vazia">Nenhum negócio nesta etapa</li> : children}
      </ul>
      {col.nextCursor && (
        <button type="button" className="btn btn--sm crm-coluna__mais" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? (
            'Carregando…'
          ) : (
            <>
              Carregar mais<span className="sr-only"> em {col.stage.name}</span>
            </>
          )}
        </button>
      )}
    </section>
  )
}

function BoardCard(props: {
  deal: DealCard
  ownerName: string | null
  stages: BoardColumn['stage'][]
  canManage: boolean
  first: boolean
  now: number
  onOpen: (id: string) => void
  onMove: (id: string, stageId: string) => void
}) {
  const { deal, ownerName, stages, canManage, first, now, onOpen, onMove } = props
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: deal.id,
    data: { title: deal.title, stageId: deal.stageId },
    disabled: !canManage,
    attributes: { roleDescription: 'negócio arrastável' },
  })
  const next = nextStep(deal)
  const late = !!next?.at && new Date(next.at).getTime() < now
  const others = stages.filter((s) => s.id !== deal.stageId)
  return (
    <li ref={setNodeRef} className={cn('crm-cartao', isDragging && 'crm-cartao--arrastando')}>
      <div className="crm-cartao__topo">
        <h3 className="crm-cartao__titulo">
          <button type="button" className="crm-link" onClick={() => onOpen(deal.id)}>
            {deal.title}
          </button>
        </h3>
        {canManage && (
          // a alça é a única origem do arraste (ponteiro e teclado): o <li> não recebe evento nenhum
          <button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" className="crm-cartao__alca" aria-label={`Arrastar ${deal.title}`}>
            <GripVertical className="ic" aria-hidden="true" />
          </button>
        )}
      </div>
      {deal.person && (
        <p className="crm-cartao__linha">
          <User className="ic" aria-hidden="true" />
          <span>{deal.person.name}</span>
          {deal.person.phoneLast4 && <span className="crm-fone suave">•••• {deal.person.phoneLast4}</span>}
        </p>
      )}
      <p className="crm-cartao__linha">
        <DealValue deal={deal} />
      </p>
      <p className="crm-cartao__linha">
        <span className="suave">Responsável:</span>
        <span>{deal.ownerMemberId ? (ownerName ?? 'Membro da equipe') : 'Sem responsável'}</span>
      </p>
      {next && (
        <p className="crm-cartao__linha">
          <CalendarClock className="ic" aria-hidden="true" />
          <span className="crm-cartao__texto">
            {next.text}
            {next.at ? ` · ${fmtDate(next.at)}` : ''}
          </span>
          {late && (
            <span className="tag tag--vermelho">
              <TriangleAlert className="ic" aria-hidden="true" />
              Atrasado
            </span>
          )}
        </p>
      )}
      {canManage && others.length > 0 && (
        <div className="crm-cartao__rodape">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                id={`crm-mover-${deal.id}`}
                type="button"
                className="btn btn--sm"
                aria-label={`Mover ${deal.title} para outra etapa`}
                data-tour={first ? 'crm-card-move' : undefined}
              >
                <ArrowRightLeft className="ic" aria-hidden="true" />
                Mover
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Mover para a etapa</DropdownMenuLabel>
              {others.map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => onMove(deal.id, s.id)}>
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  )
}

function CardPreview({ deal }: { deal: DealCard }) {
  return (
    <div className="crm-cartao crm-cartao--sobreposicao" aria-hidden="true">
      <div className="crm-cartao__topo">
        <span className="crm-cartao__titulo">{deal.title}</span>
        <GripVertical className="ic" />
      </div>
      {deal.person && <p className="crm-cartao__linha">{deal.person.name}</p>}
      <p className="crm-cartao__linha">
        <DealValue deal={deal} />
      </p>
    </div>
  )
}

export default function CrmDealsView() {
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const setView = useAppStore((s) => s.setView)
  const role = me?.role
  const canManage = can(role, 'crm.deals.manage')
  const seesTeam = can(role, 'members.view')
  const canSettings = canOpenView(role, 'crm-settings')

  const [vista, setVista] = useState<'quadro' | 'lista'>('quadro')
  const [pipelineId, setPipelineId] = useState('')
  const [owner, setOwner] = useState('')
  const [busca, setBusca] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ListStatus>('open')
  const [creating, setCreating] = useState(false)
  // enquanto o "Criar negócio" está enviando, Esc e clique fora não fecham o diálogo
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [now] = useState(() => Date.now())

  // busca com espera de 300 ms (a URL só muda quando a pessoa para de digitar)
  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim().slice(0, 120)), 300)
    return () => clearTimeout(t)
  }, [busca])

  const pipelinesQ = useCrmQuery<{ pipelines: CrmPipeline[] }>('/api/crm/pipelines?includeInactive=1')
  const membersQ = useCrmQuery<{ members: MemberRow[] }>(seesTeam ? '/api/members' : null)
  const allPipelines = pipelinesQ.data?.pipelines ?? []
  const activePipelines = allPipelines.filter((p) => p.status === 'active').map((p) => ({ ...p, stages: p.stages.filter((s) => s.status === 'active') }))
  const defaultPipeline = activePipelines.find((p) => p.isDefault) ?? activePipelines[0] ?? null
  const stageNames = new Map(allPipelines.flatMap((p) => p.stages.map((s) => [s.id, s.name] as const)))

  const filters = new URLSearchParams()
  if (pipelineId) filters.set('pipelineId', pipelineId)
  if (owner) filters.set('ownerMemberId', owner)
  if (q) filters.set('q', q)
  const filterString = filters.toString()
  const boardUrl = `/api/crm/deals?view=board${filterString ? `&${filterString}` : ''}`

  // a página volta para 1 quando o filtro muda (a página guardada vale só para o filtro em que nasceu)
  const listKey = `${filterString}|${status}`
  const [pageState, setPageState] = useState({ key: listKey, page: 1 })
  const page = pageState.key === listKey ? pageState.page : 1
  const listParams = new URLSearchParams(filters)
  listParams.set('view', 'list')
  if (status) listParams.set('status', status)
  if (page > 1) listParams.set('page', String(page))
  const listUrl = `/api/crm/deals?${listParams.toString()}`

  const board = useCrmQuery<BoardResponse>(vista === 'quadro' ? boardUrl : null)
  const list = useCrmQuery<ListResponse>(vista === 'lista' ? listUrl : null)

  // cópia local do quadro: mover e "Carregar mais" mexem nela sem recarregar tudo
  const [local, setLocal] = useState<{ from: BoardResponse | null; columns: BoardColumn[]; members: Member[] }>({ from: null, columns: [], members: [] })
  if (board.data && local.from !== board.data) {
    setLocal({ from: board.data, columns: board.data.columns, members: board.data.members })
  }
  const columns = board.data ? (local.from === board.data ? local.columns : board.data.columns) : []
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({})
  const [dragging, setDragging] = useState<DealCard | null>(null)

  const team = assignableMembers(membersQ.data?.members, me)
  const names = new Map<string, string>()
  for (const m of membersQ.data?.members ?? []) names.set(m.id, m.name)
  for (const m of board.data ? local.members : []) names.set(m.id, m.name)
  for (const m of list.data?.members ?? []) names.set(m.id, m.name)
  if (me?.id) names.set(me.id, me.name)
  // filtro de responsável: quem pode ter negócio (ativo, vê negócios, da equipe do supervisor) mais quem já é dono de
  // um negócio na tela (pode estar inativo). Não lista membro que nunca seria responsável (analista, só leitura).
  const ownerIds = new Set<string>(team.map((m) => m.id))
  for (const m of board.data ? local.members : []) ownerIds.add(m.id)
  for (const m of list.data?.members ?? []) ownerIds.add(m.id)
  if (owner) ownerIds.add(owner)
  if (me?.id && can(role, 'crm.deals.view')) ownerIds.add(me.id)
  const ownerOptions = [...ownerIds].map((id) => ({ id, name: names.get(id) ?? 'Membro da equipe' })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const filtersActive = !!q || !!owner
  const refetchCurrent = vista === 'quadro' ? board.refetch : list.refetch

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: columnJump }))

  function clearFilters() {
    setBusca('')
    setQ('')
    setOwner('')
    setStatus('open')
  }

  function findDeal(id: UniqueIdentifier): DealCard | undefined {
    for (const c of columns) {
      const d = c.deals.find((x) => x.id === String(id))
      if (d) return d
    }
    return undefined
  }

  function stageName(id: UniqueIdentifier | null | undefined): string {
    return columns.find((c) => c.stage.id === String(id))?.stage.name ?? 'etapa'
  }

  async function moveDeal(dealId: string, toStageId: string, refocus = false) {
    const fromCol = columns.find((c) => c.deals.some((d) => d.id === dealId))
    const original = fromCol?.deals.find((d) => d.id === dealId)
    if (!fromCol || !original || fromCol.stage.id === toStageId) return
    const index = fromCol.deals.indexOf(original)
    const toName = stageName(toStageId)
    setLocal((s) => ({ ...s, columns: relocate(s.columns, dealId, toStageId) }))
    // o cartão muda de coluna (é montado de novo): o foco volta ao botão Mover dele
    if (refocus) window.setTimeout(() => document.getElementById(`crm-mover-${dealId}`)?.focus(), 60)
    try {
      const r = await crmSend<{ deal: CrmDeal }>(`/api/crm/deals/${encodeURIComponent(dealId)}/stage`, { json: { stageId: toStageId, version: original.version } })
      setLocal((s) => ({ ...s, columns: patchCard(s.columns, dealId, r.deal) }))
      toast.success(`Negócio movido para ${toName}.`)
    } catch (e) {
      setLocal((s) => ({ ...s, columns: relocate(s.columns, dealId, fromCol.stage.id, { patch: original, index }) }))
      if (e instanceof CrmApiError && (e.code === 'crm_version_conflict' || e.code === 'crm_not_found' || e.code === 'crm_invalid_transition')) board.refetch()
      toast.error(crmErrorMessage(e))
    }
  }

  async function loadMore(col: BoardColumn) {
    if (!col.nextCursor) return
    const stageId = col.stage.id
    setLoadingMore((s) => ({ ...s, [stageId]: true }))
    try {
      const p = new URLSearchParams(filters)
      p.set('view', 'board')
      if (board.data?.pipeline) p.set('pipelineId', board.data.pipeline.id)
      p.set('stageId', stageId)
      p.set('cursor', col.nextCursor)
      const res = await crmGet<BoardResponse>(`/api/crm/deals?${p.toString()}`)
      const more = res.columns.find((c) => c.stage.id === stageId)
      if (more) {
        setLocal((s) => ({
          ...s,
          members: [...s.members, ...res.members.filter((m) => !s.members.some((x) => x.id === m.id))],
          columns: s.columns.map((c) =>
            c.stage.id === stageId
              ? { ...c, deals: [...c.deals, ...more.deals.filter((d) => !c.deals.some((x) => x.id === d.id))], nextCursor: more.nextCursor, total: more.total, declaredCents: more.declaredCents }
              : c,
          ),
        }))
      }
    } catch (e) {
      toast.error(crmErrorMessage(e))
    } finally {
      setLoadingMore((s) => ({ ...s, [stageId]: false }))
    }
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(findDeal(e.active.id) ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    if (e.over) void moveDeal(String(e.active.id), String(e.over.id))
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Movendo ${findDeal(active.id)?.title ?? 'negócio'}. Use as setas para a esquerda e para a direita para escolher a etapa; Espaço ou Enter solta e Esc cancela.`,
    onDragOver: ({ active, over }) => (over ? `${findDeal(active.id)?.title ?? 'Negócio'} sobre a etapa ${stageName(over.id)}.` : `${findDeal(active.id)?.title ?? 'Negócio'} fora das etapas.`),
    onDragEnd: ({ active, over }) =>
      over ? `${findDeal(active.id)?.title ?? 'Negócio'} solto na etapa ${stageName(over.id)}.` : `${findDeal(active.id)?.title ?? 'Negócio'} solto fora das etapas. Nada mudou.`,
    onDragCancel: ({ active }) => `Movimento cancelado. ${findDeal(active.id)?.title ?? 'O negócio'} continua na mesma etapa.`,
  }

  function handleCreated(deal: CrmDeal) {
    setCreating(false)
    toast.success('Negócio criado.', { action: { label: 'Abrir negócio', onClick: () => openCrm('deal', deal.id) } })
    refetchCurrent()
  }

  const header = (
    <header className="cab-pagina">
      <div className="cab-pagina__titulo">
        <BriefcaseBusiness className="ic cab-pagina__icone" aria-hidden="true" />
        <div>
          <h1>Negócios</h1>
          <p>Vendas em andamento, etapa por etapa do funil. Valor declarado é o combinado com o cliente; estimativa não é receita.</p>
        </div>
      </div>
      {canManage && (
        <div className="cab-pagina__acoes">
          <button type="button" className="btn btn--primario" data-tour="crm-new-deal" onClick={() => setCreating(true)}>
            <Plus className="ic" aria-hidden="true" />
            Novo negócio
          </button>
        </div>
      )}
    </header>
  )

  const filterBar = (
    <section className="cartao crm-negocios-filtros" aria-label="Filtros de negócios">
      <div className="campo crm-negocios-filtros__busca">
        <label htmlFor="crm-neg-busca">Buscar</label>
        <div className="entrada-ic">
          <Search className="ic" aria-hidden="true" />
          <input id="crm-neg-busca" className="entrada" type="search" maxLength={120} placeholder="Título do negócio" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      {activePipelines.length > 1 && (
        <div className="campo">
          <label htmlFor="crm-neg-funil">Funil</label>
          <select
            id="crm-neg-funil"
            className="selecao"
            value={pipelineId || defaultPipeline?.id || ''}
            onChange={(e) => setPipelineId(e.target.value === defaultPipeline?.id ? '' : e.target.value)}
          >
            {activePipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? ' (padrão)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {seesTeam && (
        <div className="campo">
          <label htmlFor="crm-neg-responsavel">Responsável</label>
          <select id="crm-neg-responsavel" className="selecao" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {ownerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me?.id ? `Eu (${m.name})` : m.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {vista === 'lista' && (
        <div className="campo">
          <label htmlFor="crm-neg-situacao">Situação</label>
          <select id="crm-neg-situacao" className="selecao" value={status} onChange={(e) => setStatus(e.target.value as ListStatus)}>
            <option value="open">Abertos</option>
            <option value="won">Ganhos</option>
            <option value="lost">Perdidos</option>
            <option value="archived">Arquivados</option>
            <option value="">Todos, menos arquivados</option>
          </select>
        </div>
      )}
      <div className="crm-negocios-filtros__vista">
        <span className="rotulo" id="crm-neg-vista">
          Exibir
        </span>
        <div className="segmentado" role="group" aria-labelledby="crm-neg-vista">
          <button type="button" aria-pressed={vista === 'quadro'} onClick={() => setVista('quadro')}>
            <LayoutGrid className="ic" aria-hidden="true" />
            Quadro
          </button>
          <button type="button" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>
            <List className="ic" aria-hidden="true" />
            Lista
          </button>
        </div>
      </div>
    </section>
  )

  const createFirst = canManage ? (
    <button type="button" className="btn btn--primario mt-3" onClick={() => setCreating(true)}>
      <Plus className="ic" aria-hidden="true" />
      Criar o primeiro negócio
    </button>
  ) : null

  const emptyAll = (
    <div className="cartao vazio">
      <BriefcaseBusiness className="ic" aria-hidden="true" />
      <strong>Nenhum negócio aberto</strong>
      <p>
        Negócio é uma venda em andamento com uma pessoa: tem etapa no funil, valor combinado e a próxima ação. Crie um à mão ou aceite uma sugestão vinda das
        conversas.
      </p>
      {createFirst}
    </div>
  )

  const emptyFiltered = (
    <div className="cartao vazio">
      <Search className="ic" aria-hidden="true" />
      <strong>Nenhum negócio encontrado</strong>
      <p>Nenhum negócio combina com a busca e os filtros escolhidos.</p>
      <button type="button" className="btn mt-3" onClick={clearFilters}>
        Limpar filtros
      </button>
    </div>
  )

  function errorCard(error: CrmApiError, retry: () => void) {
    return (
      <div className="cartao vazio" role="alert">
        <TriangleAlert className="ic" aria-hidden="true" />
        <strong>Não foi possível carregar os negócios.</strong>
        <p>{crmErrorMessage(error, 'Verifique a conexão e tente novamente.')}</p>
        <div className="linha-flex envolve mt-3 justify-center">
          <button type="button" className="btn" onClick={retry}>
            Tentar novamente
          </button>
          {error.code === 'crm_not_found' && pipelineId && (
            <button type="button" className="btn btn--link" onClick={() => setPipelineId('')}>
              Ver o funil padrão
            </button>
          )}
        </div>
      </div>
    )
  }

  function staleNotice(retry: () => void) {
    return (
      <div className="aviso aviso--ambar" role="alert">
        <TriangleAlert className="ic aviso__ic" aria-hidden="true" />
        <span>
          Não foi possível atualizar agora. Você está vendo a última versão carregada.{' '}
          <button type="button" className="btn btn--sm btn--link" onClick={retry}>
            Tentar novamente
          </button>
        </span>
      </div>
    )
  }

  function renderBoard() {
    if (board.loading || (!board.data && !board.error)) {
      return (
        <div className="crm-quadro" aria-busy="true">
          <span className="sr-only">Carregando o quadro de negócios…</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-72 w-[300px] shrink-0 rounded-xl" />
          ))}
        </div>
      )
    }
    if (!board.data) return errorCard(board.error!, board.refetch)
    if (!board.data.pipeline) {
      return (
        <div className="cartao vazio">
          <LayoutGrid className="ic" aria-hidden="true" />
          <strong>Nenhum funil ativo</strong>
          <p>
            O quadro mostra os negócios por etapa de um funil.{' '}
            {canSettings ? 'Crie ou ative um funil nos ajustes do CRM.' : 'Peça ao gestor para criar ou ativar um funil nos ajustes do CRM.'}
          </p>
          {canSettings && (
            <button type="button" className="btn btn--primario mt-3" onClick={() => setView('crm-settings')}>
              Abrir ajustes do CRM
            </button>
          )}
        </div>
      )
    }
    const totalOpen = columns.reduce((n, c) => n + c.total, 0)
    if (totalOpen === 0 && !dragging) return filtersActive ? emptyFiltered : emptyAll
    const stages = columns.map((c) => c.stage)
    const firstDealId = columns.find((c) => c.deals.length > 0)?.deals[0]?.id
    return (
      <>
        {board.error && staleNotice(board.refetch)}
        {canManage && <p className="crm-quadro__dica">Arraste pela alça ou use o botão Mover para trocar a etapa.</p>}
        <DndContext
          id="crm-board-dnd"
          sensors={sensors}
          collisionDetection={collision}
          accessibility={{ announcements, screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS } }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="crm-quadro" data-tour="crm-board" role="region" aria-label="Quadro de negócios" tabIndex={0}>
            {columns.map((col) => (
              <StageColumn key={col.stage.id} col={col} dragActive={!!dragging} loadingMore={!!loadingMore[col.stage.id]} onLoadMore={() => void loadMore(col)}>
                {col.deals.map((deal) => (
                  <BoardCard
                    key={deal.id}
                    deal={deal}
                    ownerName={deal.ownerMemberId ? (names.get(deal.ownerMemberId) ?? null) : null}
                    stages={stages}
                    canManage={canManage}
                    first={deal.id === firstDealId}
                    now={now}
                    onOpen={(id) => openCrm('deal', id)}
                    onMove={(id, stageId) => void moveDeal(id, stageId, true)}
                  />
                ))}
              </StageColumn>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>{dragging ? <CardPreview deal={dragging} /> : null}</DragOverlay>
        </DndContext>
      </>
    )
  }

  function renderList() {
    if (list.loading || (!list.data && !list.error)) {
      return (
        <div className="cartao cartao--pad grid gap-3" aria-busy="true">
          <span className="sr-only">Carregando a lista de negócios…</span>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      )
    }
    if (!list.data) return errorCard(list.error!, list.refetch)
    const { items, total, limit } = list.data
    const current = list.data.page
    if (total === 0) return filtersActive || status !== 'open' ? emptyFiltered : emptyAll
    const pages = Math.max(1, Math.ceil(total / limit))
    const start = Math.max(1, Math.min(current - 2, pages - 4))
    const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i)
    const goTo = (n: number) => setPageState({ key: listKey, page: Math.min(Math.max(1, n), pages) })
    return (
      <>
        {list.error && staleNotice(list.refetch)}
        <section className="cartao" aria-labelledby="crm-neg-lista-titulo">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-neg-lista-titulo">Lista de negócios</h2>
              <p aria-live="polite">
                {total} {total === 1 ? 'negócio' : 'negócios'}
              </p>
            </div>
          </div>
          <div className="tabela-wrap crm-tabela-rola" role="region" tabIndex={0} aria-label="Negócios">
            <table className="tabela tabela--folgada">
              <thead>
                <tr>
                  <th scope="col">Negócio</th>
                  <th scope="col">Pessoa</th>
                  <th scope="col">Etapa</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Responsável</th>
                  <th scope="col">Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button type="button" className="crm-link" onClick={() => openCrm('deal', d.id)}>
                        {d.title}
                      </button>
                    </td>
                    <td>
                      {d.person ? (
                        <span className="pilha">
                          {d.person.name}
                          {d.person.phoneLast4 && <small className="crm-fone">•••• {d.person.phoneLast4}</small>}
                        </span>
                      ) : (
                        <span className="suave">Sem pessoa</span>
                      )}
                    </td>
                    <td>{stageNames.get(d.stageId) ?? <span className="suave">—</span>}</td>
                    <td>
                      <span className={cn('tag', DEAL_STATUS_TAG[d.status] ?? 'tag--cinza')}>
                        <span className="ponto" aria-hidden="true" />
                        {DEAL_STATUS_LABEL[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="num">
                      <DealValue deal={d} />
                    </td>
                    <td>{d.ownerMemberId ? (names.get(d.ownerMemberId) ?? 'Membro da equipe') : <span className="suave">Sem responsável</span>}</td>
                    <td className="num">{fmtDateTime(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="paginacao" aria-label="Páginas de negócios">
            <span className="suave">
              Mostrando {(current - 1) * limit + 1}–{Math.min(current * limit, total)} de {total}
            </span>
            {pages > 1 && (
              <div className="linha-flex envolve">
                <button type="button" className="pag" aria-label="Página anterior" disabled={current <= 1} onClick={() => goTo(current - 1)}>
                  <ChevronLeft className="ic" aria-hidden="true" />
                </button>
                {nums.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={cn('pag', n === current && 'pag--atual')}
                    aria-current={n === current ? 'page' : undefined}
                    aria-label={`Página ${n}`}
                    onClick={() => goTo(n)}
                  >
                    {n}
                  </button>
                ))}
                <button type="button" className="pag" aria-label="Próxima página" disabled={current >= pages} onClick={() => goTo(current + 1)}>
                  <ChevronRight className="ic" aria-hidden="true" />
                </button>
              </div>
            )}
          </nav>
        </section>
      </>
    )
  }

  return (
    <>
      {header}
      <SuggestionsPanel onChanged={refetchCurrent} />
      {filterBar}
      {vista === 'quadro' ? renderBoard() : renderList()}
      {canManage && (
        <Dialog open={creating} onOpenChange={(o) => (o || !creatingBusy) && setCreating(o)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <NewDealForm
              pipelines={activePipelines}
              pipelinesLoading={pipelinesQ.loading}
              pipelinesError={pipelinesQ.error}
              onRetryPipelines={pipelinesQ.refetch}
              defaultPipelineId={pipelineId || defaultPipeline?.id || ''}
              owners={seesTeam ? team : null}
              ownersLoading={membersQ.loading}
              me={me?.id ? { id: me.id, name: me.name } : null}
              onCancel={() => setCreating(false)}
              onCreated={handleCreated}
              onBusyChange={setCreatingBusy}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function NewDealForm(props: {
  pipelines: CrmPipeline[]
  pipelinesLoading: boolean
  pipelinesError: CrmApiError | null
  onRetryPipelines: () => void
  defaultPipelineId: string
  owners: Member[] | null
  ownersLoading: boolean
  me: Member | null
  onCancel: () => void
  onCreated: (deal: CrmDeal) => void
  onBusyChange: (busy: boolean) => void
}) {
  const { pipelines, pipelinesLoading, pipelinesError, onRetryPipelines, defaultPipelineId, owners, ownersLoading, me, onCancel, onCreated, onBusyChange } = props
  const [title, setTitle] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [amount, setAmount] = useState('')
  const [ownerId, setOwnerId] = useState(me?.id ?? '')
  const [priority, setPriority] = useState('normal')
  const [expected, setExpected] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [person, setPerson] = useState<PersonHit | null>(null)
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<{ term: string; items: PersonHit[]; error: boolean } | null>(null)
  const [searchTick, setSearchTick] = useState(0)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines.find((p) => p.id === defaultPipelineId) ?? pipelines[0] ?? null
  const stage = pipeline?.stages.find((s) => s.id === stageId) ?? pipeline?.stages[0] ?? null
  const cleanTerm = term.trim().slice(0, 120)

  // busca de pessoa com espera de 300 ms; o resultado guarda o termo a que pertence
  useEffect(() => {
    if (!cleanTerm || person) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      crmGet<{ items: PersonHit[] }>(`/api/crm/contacts?q=${encodeURIComponent(cleanTerm)}&limit=8`, ctrl.signal)
        .then((r) => setHits({ term: cleanTerm, items: r.items, error: false }))
        .catch(() => {
          if (!ctrl.signal.aborted) setHits({ term: cleanTerm, items: [], error: true })
        })
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [cleanTerm, person, searchTick])
  const result = hits && hits.term === cleanTerm ? hits : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) {
      setFormError('Informe o título do negócio.')
      return
    }
    if (!pipeline || !stage) {
      setFormError('Não há funil ativo para criar o negócio.')
      return
    }
    const cents = centsFromInput(amount)
    if (cents !== null && cents > MAX_AMOUNT_CENTS) {
      setFormError(AMOUNT_LIMIT_MSG)
      return
    }
    const json: Record<string, unknown> = { title: t.slice(0, 160), pipelineId: pipeline.id, stageId: stage.id }
    if (person) json.personId = person.id
    if (cents !== null) json.amountCents = cents
    if (owners) json.ownerMemberId = ownerId || null
    if (priority !== 'normal') json.priority = priority
    const exp = isoFromDate(expected, 12, 0)
    if (exp) json.expectedCloseAt = exp
    const na = nextAction.trim()
    if (na) json.nextAction = na.slice(0, 200)
    const naAt = isoFromDate(nextDate, 23, 59)
    if (naAt) json.nextActionAt = naAt
    setFormError(null)
    setSending(true)
    onBusyChange(true)
    try {
      const r = await crmSend<{ deal: CrmDeal }>('/api/crm/deals', { json, idempotent: true })
      onCreated(r.deal)
    } catch (err) {
      toast.error(crmErrorMessage(err))
    } finally {
      setSending(false)
      onBusyChange(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Novo negócio</DialogTitle>
        <DialogDescription>Uma venda em andamento. Só o título é obrigatório; o resto dá para completar depois.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="crm-nd-titulo">Título</Label>
        <Input
          id="crm-nd-titulo"
          value={title}
          maxLength={160}
          required
          aria-invalid={formError === 'Informe o título do negócio.'}
          placeholder="Ex.: Orçamento de 10 cestas para Maria Silva"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={person ? undefined : 'crm-nd-pessoa'}>Pessoa (opcional)</Label>
        {person ? (
          <div className="flex items-center gap-2 rounded-[var(--raio-sm)] border border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-sm">
            <User className="size-4 shrink-0 text-[var(--suave)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {person.name}
              {person.phoneLast4 ? ` · •••• ${person.phoneLast4}` : ''}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover pessoa"
              onClick={() => {
                setPerson(null)
                setTerm('')
                window.setTimeout(() => searchRef.current?.focus(), 0)
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <>
            <Input
              ref={searchRef}
              id="crm-nd-pessoa"
              type="search"
              autoComplete="off"
              value={term}
              maxLength={120}
              placeholder="Nome ou os 4 últimos dígitos do telefone"
              aria-describedby="crm-nd-pessoa-dica"
              onChange={(e) => setTerm(e.target.value)}
            />
            <p id="crm-nd-pessoa-dica" className="text-xs text-[var(--suave)]">
              Busque um contato já cadastrado, como Maria Silva ou 5678.
            </p>
            {cleanTerm &&
              (result === null ? (
                <div className="grid gap-2" aria-busy="true">
                  <span className="sr-only">Buscando contatos…</span>
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-2/3" />
                </div>
              ) : result.error ? (
                <p role="alert" className="text-sm text-[var(--vermelho)]">
                  Não foi possível buscar os contatos.{' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      setHits(null)
                      setSearchTick((n) => n + 1)
                    }}
                  >
                    Tentar novamente
                  </button>
                </p>
              ) : result.items.length === 0 ? (
                <p className="text-sm text-[var(--suave)]">Nenhum contato encontrado. Cadastre a pessoa em Contatos ou crie o negócio sem pessoa.</p>
              ) : (
                <ul className="grid gap-1" aria-label="Contatos encontrados">
                  {result.items.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full rounded-[var(--raio-sm)] border border-[var(--borda)] px-3 py-2 text-left text-sm hover:bg-[var(--superficie-2)] focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
                        onClick={() => setPerson({ id: p.id, name: p.name, phoneLast4: p.phoneLast4 })}
                      >
                        {p.name}
                        {p.phoneLast4 ? ` · •••• ${p.phoneLast4}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </>
        )}
      </div>

      {pipelinesLoading ? (
        <div className="grid gap-2" aria-busy="true">
          <span className="sr-only">Carregando funis…</span>
          <Skeleton className="h-10 w-full" />
        </div>
      ) : pipelinesError && pipelines.length === 0 ? (
        <p role="alert" className="text-sm text-[var(--vermelho)]">
          Não foi possível carregar os funis.{' '}
          <button type="button" className="font-semibold underline" onClick={onRetryPipelines}>
            Tentar novamente
          </button>
        </p>
      ) : !pipeline ? (
        <p className="text-sm text-[var(--suave)]">Nenhum funil ativo. Peça ao gestor para criar um funil nos ajustes do CRM.</p>
      ) : (
        <div className={pipelines.length > 1 ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'grid gap-3'}>
          {pipelines.length > 1 && (
            <div className="grid gap-2">
              <Label htmlFor="crm-nd-funil">Funil</Label>
              <select
                id="crm-nd-funil"
                className={SELECT_CLASS}
                value={pipeline.id}
                onChange={(e) => {
                  setPipelineId(e.target.value)
                  setStageId('')
                }}
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="crm-nd-etapa">Etapa</Label>
            <select id="crm-nd-etapa" className={SELECT_CLASS} value={stage?.id ?? ''} onChange={(e) => setStageId(e.target.value)}>
              {pipeline.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="crm-nd-valor">Valor declarado (opcional)</Label>
          <Input id="crm-nd-valor" placeholder="0,00" aria-invalid={formError === AMOUNT_LIMIT_MSG} aria-describedby="crm-nd-valor-dica" {...moneyProps(amount, setAmount)} />
          <p id="crm-nd-valor-dica" className="text-xs text-[var(--suave)]">
            Em reais, o combinado com o cliente. Em branco fica como não informado.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="crm-nd-prioridade">Prioridade</Label>
          <select id="crm-nd-prioridade" className={SELECT_CLASS} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={owners ? 'grid grid-cols-1 items-start gap-3 sm:grid-cols-2' : 'grid gap-3'}>
        {owners && (
          <div className="grid gap-2">
            <Label htmlFor="crm-nd-responsavel">Responsável</Label>
            <select id="crm-nd-responsavel" className={SELECT_CLASS} value={ownerId} disabled={ownersLoading} onChange={(e) => setOwnerId(e.target.value)}>
              {me && <option value={me.id}>Eu ({me.name})</option>}
              {owners
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
        <div className="grid gap-2">
          <Label htmlFor="crm-nd-previsao">Previsão de fechamento (opcional)</Label>
          <Input id="crm-nd-previsao" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="crm-nd-proxima">Próxima ação (opcional)</Label>
          <Input id="crm-nd-proxima" value={nextAction} maxLength={200} placeholder="Ex.: Enviar a proposta" onChange={(e) => setNextAction(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="crm-nd-proxima-data">Data da próxima ação (opcional)</Label>
          <Input id="crm-nd-proxima-data" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </div>
      </div>

      {formError && (
        <p role="alert" className="text-sm text-[var(--vermelho)]">
          {formError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={sending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={sending || !pipeline}>
          {sending ? 'Criando…' : 'Criar negócio'}
        </Button>
      </DialogFooter>
    </form>
  )
}
