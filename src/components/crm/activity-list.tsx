'use client'

import { useId, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarClock, ChevronLeft, ChevronRight, ListTodo, Mail, MessageCircle, NotebookPen, Phone, Plus, RotateCcw, TriangleAlert, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { browserZoneDiffers, formatZoned, isoFromZonedParts, safeTimezone, timezoneLabel, zonedDate, zonedParts, type DueWindow } from '@/lib/crm/agenda'
import { CrmApiError, crmErrorMessage, crmSend, useCrmQuery, type CrmActivity } from '@/lib/crm/client'
import { ACTIVITY_STATUS_LABEL, ACTIVITY_TYPE_LABEL, PRIORITY_LABEL } from '@/lib/crm/labels'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'

// Tarefas e próximas ações do CRM. Nenhum tipo envia mensagem (D3): "WhatsApp (fora do AtendeRadar)" só registra um
// contato feito por fora. Toda alteração manda a `version` lida; a criação vai com Idempotency-Key.

/** "pending" = aberta ou em andamento (o que ainda falta fazer). */
export type ActivityStatusFilter = 'pending' | 'open' | 'in_progress' | 'done' | 'cancelled'

export interface ActivityListProps {
  /** Só as tarefas deste negócio. */
  dealId?: string
  /** Só as tarefas desta pessoa. */
  personId?: string
  /** Versão curta para o detalhe do negócio ou do contato. */
  compact?: boolean
  /** Filtro de situação. No modo compacto, sem ele, mostra só as pendentes (abertas e em andamento). */
  status?: ActivityStatusFilter
  /** Só as atrasadas (abertas ou em andamento com prazo vencido). */
  overdue?: boolean
  /** Janela da agenda ("Hoje", "Próximos 7 dias"), no fuso da empresa (o servidor calcula). */
  due?: DueWindow
  /** Só as deste responsável (id do membro). */
  ownerMemberId?: string
  /** Só as de quem está logado (ignorado quando `ownerMemberId` vem). */
  onlyMine?: boolean
  /** Chamado depois de criar ou alterar uma tarefa. */
  onChanged?: () => void
  /** Título do cartão (padrão "Tarefas"). */
  title?: string
  /** Estado vazio (tela inteira): título e explicação. */
  emptyTitle?: string
  emptyText?: string
  /** Itens por página (padrão 25; compacto 5). */
  limit?: number
  /** Com cartão e título próprios (padrão: sim). Quem já põe a lista dentro de um cartão "Tarefas" passa false. */
  framed?: boolean
}

export type ActivitiesFilterPreset = 'open' | 'today' | 'next7' | 'overdue' | 'done' | 'all'

// A Visão comercial abre Tarefas já em "Atrasadas": o filtro inicial passa por aqui (o store não tem esse campo).
let presetFilter: ActivitiesFilterPreset | null = null
/** Define o filtro com que a tela de Tarefas abre na próxima vez. */
export function presetActivitiesFilter(filter: ActivitiesFilterPreset) {
  presetFilter = filter
}
/** Lê o filtro pedido (sem apagar: o StrictMode chama o inicializador duas vezes). */
export function peekActivitiesFilterPreset(): ActivitiesFilterPreset | null {
  return presetFilter
}
/** Apaga o filtro pedido depois que a tela montou. */
export function clearActivitiesFilterPreset() {
  presetFilter = null
}

type BusyAction = 'done' | 'cancelled' | 'open' | 'reschedule' | 'edit' | 'undo'

type ActivityItem = CrmActivity & {
  deal: { id: string; title: string; status: string } | null
  person: { id: string; name: string } | null
  overdue: boolean
}

interface ActivitiesResponse {
  items: ActivityItem[]
  total: number
  page: number
  limit: number
  members: { id: string; name: string }[]
  /** Fuso da empresa (IANA), em que valem "Hoje" e "Próximos 7 dias". */
  timezone?: string
}

interface MemberRow {
  id: string
  name: string
  role: string
  team: string | null
  status: string
}

const TYPES = Object.entries(ACTIVITY_TYPE_LABEL) as [keyof typeof ACTIVITY_TYPE_LABEL, string][]
const PRIORITIES = Object.entries(PRIORITY_LABEL) as [keyof typeof PRIORITY_LABEL, string][]
const TYPE_ICON: Record<string, LucideIcon> = {
  follow_up: RotateCcw,
  call: Phone,
  whatsapp_external: MessageCircle,
  email: Mail,
  meeting: Users,
  internal: NotebookPen,
}
const STATUS_TAG: Record<string, string> = { open: 'tag--azul', in_progress: 'tag--ambar', done: 'tag--verde', cancelled: 'tag--cinza' }
const CLOSED = ['done', 'cancelled']
/** Situações que o "Editar" oferece: a tarefa pendente fica aberta ou em andamento (concluir e cancelar têm botão). */
const EDIT_STATUSES = ['open', 'in_progress'] as const
const TITLE_REQUIRED = 'Informe o título.'
const SELECT_CLASS = 'flex h-10 w-full rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie)] px-3 text-sm text-[var(--texto)]'
const D3_HINT = 'Nenhum tipo envia mensagem. “WhatsApp (fora do AtendeRadar)” só registra um contato feito por fora: o AtendeRadar não envia nada ao cliente.'

function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  return key ? (map[key] ?? key) : '—'
}

/** Amanhã às 09:00 no fuso da empresa (padrão dos campos de prazo). */
function tomorrowNine(tz: string): { date: string; time: string } {
  return { date: zonedDate(1, tz), time: '09:00' }
}

export function ActivityList(props: ActivityListProps) {
  const { dealId, personId, compact = false, status, overdue, due, ownerMemberId, onlyMine, onChanged, title = 'Tarefas', emptyTitle, emptyText } = props
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const setView = useAppStore((s) => s.setView)
  const canView = !!me?.crm?.enabled && can(me?.role, 'crm.activities.view')
  const canManage = can(me?.role, 'crm.activities.manage')
  // quem enxerga a equipe pode escolher o responsável; atendente cria sempre para si
  const canAssign = canManage && can(me?.role, 'members.view')
  const pageSize = Math.min(100, Math.max(1, props.limit ?? (compact ? 5 : 25)))

  const base = new URLSearchParams()
  const effectiveStatus = status ?? (compact && !overdue ? 'pending' : undefined)
  if (effectiveStatus) base.set('status', effectiveStatus)
  if (overdue) base.set('overdue', '1')
  if (due) base.set('due', due)
  const owner = ownerMemberId ?? (onlyMine ? me?.id : undefined)
  if (owner) base.set('ownerMemberId', owner)
  if (dealId) base.set('dealId', dealId)
  if (personId) base.set('personId', personId)
  base.set('limit', String(pageSize))
  const filterKey = base.toString()

  // a página volta para 1 quando o filtro muda (sem efeito: a página guardada vale só para o filtro em que nasceu)
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const page = pageState.key === filterKey ? pageState.page : 1
  const params = new URLSearchParams(base)
  if (page > 1) params.set('page', String(page))
  const url = canView ? `/api/crm/activities?${params.toString()}` : null
  const q = useCrmQuery<ActivitiesResponse>(url)
  // prazos na tela e nos campos no fuso da empresa, o mesmo de "Hoje" e "Próximos 7 dias" (antes da lista, o do /api/me)
  const tz = safeTimezone(q.data?.timezone ?? me?.crm?.timezone)
  const zoneHint = browserZoneDiffers(tz) ? `Data e hora no ${timezoneLabel(tz)}.` : null

  const listTitleId = useId()
  const [busy, setBusy] = useState<{ id: string; action: BusyAction } | null>(null)
  const [reschedule, setReschedule] = useState<ActivityItem | null>(null)
  const [rDate, setRDate] = useState('')
  const [rTime, setRTime] = useState('')
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({ type: 'follow_up', title: '', date: '', time: '', priority: 'normal', owner: '', notes: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ActivityItem | null>(null)
  const [editForm, setEditForm] = useState({ title: '', owner: '', priority: 'normal', status: 'open', notes: '' })
  const [editError, setEditError] = useState<string | null>(null)

  // equipe só para quem pode atribuir, e só com um formulário aberto
  const membersQ = useCrmQuery<{ members: MemberRow[] }>((creating || editing !== null) && canAssign ? '/api/members' : null)
  // supervisor com equipe só atribui à própria equipe (o servidor confere o mesmo)
  const myTeam = me?.role === 'supervisor' ? (me.team ?? '').trim() : ''
  const assignable = (membersQ.data?.members ?? []).filter(
    (m) => m.status === 'active' && can(m.role, 'crm.activities.view') && (!myTeam || (m.team ?? '').trim() === myTeam || m.id === me?.id),
  )

  // a página ficou vazia porque as últimas tarefas dela saíram do filtro (concluídas, canceladas): volta para a última com itens
  if (q.data && page > 1 && q.data.items.length === 0 && q.data.total > 0) {
    const last = Math.max(1, Math.ceil(q.data.total / pageSize))
    if (last < page) setPageState({ key: filterKey, page: last })
  }

  if (!url) return null

  const names = new Map((q.data?.members ?? []).map((m) => [m.id, m.name]))
  const items = q.data?.items ?? []
  const total = q.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const anyBusy = busy !== null

  function changed() {
    q.refetch()
    onChanged?.()
  }

  function setPage(next: number) {
    setPageState({ key: filterKey, page: Math.min(Math.max(1, next), pages) })
  }

  /** PATCH (activityUpdate) com a `version` lida. 'stale' = conflito de versão ou tarefa que sumiu: a lista recarrega. */
  async function patch(
    a: { id: string; version: number },
    changes: Record<string, unknown>,
    okMessage: string,
    action: BusyAction,
    undo?: Record<string, unknown>,
  ): Promise<'ok' | 'stale' | 'error'> {
    setBusy({ id: a.id, action })
    try {
      const r = await crmSend<{ activity: CrmActivity }>(`/api/crm/activities/${encodeURIComponent(a.id)}`, { method: 'PATCH', json: { ...changes, version: a.version } })
      toast.success(
        okMessage,
        undo ? { action: { label: 'Desfazer', onClick: () => void patch({ id: r.activity.id, version: r.activity.version }, undo, 'Alteração desfeita.', 'undo') } } : undefined,
      )
      changed()
      return 'ok'
    } catch (e) {
      toast.error(crmErrorMessage(e))
      if (e instanceof CrmApiError && (e.code === 'crm_version_conflict' || e.code === 'crm_not_found')) {
        q.refetch()
        return 'stale'
      }
      return 'error'
    } finally {
      setBusy(null)
    }
  }

  function openReschedule(a: ActivityItem) {
    const p = a.dueAt ? zonedParts(new Date(a.dueAt), tz) : tomorrowNine(tz)
    setRDate(p.date)
    setRTime(p.time)
    setFormError(null)
    setReschedule(a)
  }

  async function submitReschedule() {
    if (!reschedule) return
    const dueAt = rDate ? isoFromZonedParts(rDate, rTime, tz) : null
    if (!dueAt) {
      setFormError('Escolha a nova data.')
      return
    }
    // em conflito a versão guardada no diálogo ficou velha: fecha, e a pessoa reabre com a tarefa recarregada
    const r = await patch(reschedule, { dueAt }, 'Tarefa reagendada.', 'reschedule')
    if (r !== 'error') setReschedule(null)
  }

  function openEdit(a: ActivityItem) {
    setEditForm({
      title: a.title,
      owner: a.ownerMemberId ?? '',
      priority: a.priority || 'normal',
      status: a.status === 'in_progress' ? 'in_progress' : 'open',
      notes: a.notes ?? '',
    })
    setEditError(null)
    setEditing(a)
  }

  /** Manda só o que mudou (com a versão lida). O servidor confere de novo título, escopo e quem troca o responsável. */
  async function submitEdit() {
    if (!editing) return
    const t = editForm.title.trim()
    if (!t) {
      setEditError(TITLE_REQUIRED)
      document.getElementById('crm-editar-titulo')?.focus()
      return
    }
    const changes: Record<string, unknown> = {}
    if (t !== editing.title) changes.title = t.slice(0, 160)
    if (editForm.priority !== editing.priority) changes.priority = editForm.priority
    if (editForm.status !== editing.status) changes.status = editForm.status
    const notes = editForm.notes.trim()
    if ((notes || null) !== (editing.notes || null)) changes.notes = notes ? notes.slice(0, 5000) : null
    const owner = editForm.owner || null
    if (canAssign && owner !== editing.ownerMemberId) changes.ownerMemberId = owner
    setEditError(null)
    if (!Object.keys(changes).length) {
      // nada mudou: não gasta uma versão nem grava auditoria
      toast('Nenhuma alteração para salvar.')
      setEditing(null)
      return
    }
    // conflito de versão: fecha e a lista recarrega (a pessoa reabre com a tarefa atual)
    const r = await patch(editing, changes, 'Tarefa atualizada.', 'edit')
    if (r !== 'error') setEditing(null)
  }

  function openCreate() {
    const p = tomorrowNine(tz)
    setForm({ type: 'follow_up', title: '', date: p.date, time: p.time, priority: 'normal', owner: me?.id ?? '', notes: '' })
    setFormError(null)
    setCreating(true)
  }

  async function submitCreate() {
    const t = form.title.trim()
    if (!t) {
      setFormError('Informe o título.')
      return
    }
    const body: Record<string, unknown> = { type: form.type, title: t.slice(0, 160), priority: form.priority }
    if (form.date) {
      const dueAt = isoFromZonedParts(form.date, form.time, tz)
      if (!dueAt) {
        setFormError('Data inválida.')
        return
      }
      body.dueAt = dueAt
    }
    const notes = form.notes.trim()
    if (notes) body.notes = notes.slice(0, 5000)
    if (dealId) body.dealId = dealId
    if (personId) body.personId = personId
    if (canAssign && form.owner !== (me?.id ?? '')) body.ownerMemberId = form.owner || null
    setFormError(null)
    setSending(true)
    try {
      await crmSend('/api/crm/activities', { json: body, idempotent: true })
      toast.success('Tarefa criada.')
      setCreating(false)
      changed()
    } catch (e) {
      toast.error(crmErrorMessage(e))
    } finally {
      setSending(false)
    }
  }

  // o detalhe do negócio usa o compacto solto na coluna lateral: o cartão é o padrão; o contato (que já tem o seu) passa framed={false}
  const framed = props.framed ?? true

  if (q.error && !q.data) {
    return (
      <div className={framed ? 'cartao vazio' : 'vazio crm-tarefas__erro'} role="alert">
        <strong>Não foi possível carregar as tarefas.</strong>
        <button type="button" className="btn mt-3" onClick={q.refetch}>
          Tentar novamente
        </button>
      </div>
    )
  }

  const empty = !q.loading && items.length === 0
  // navegador em outro fuso: a lista diz em que fuso estão os prazos (os dias e as horas são os da empresa)
  const tzNote = !compact && zoneHint ? `Prazos no ${timezoneLabel(tz)}, o fuso da empresa.` : null
  const newTaskButton = canManage ? (
    <button type="button" className="btn btn--sm btn--primario" data-tour="crm-new-task" onClick={openCreate}>
      <Plus className="ic" aria-hidden="true" />
      Nova tarefa
    </button>
  ) : null

  return (
    <section
      className={`crm-tarefas${framed ? ' cartao' : ' crm-tarefas--solta'}${compact ? ' crm-tarefas--compacta' : ''}`}
      aria-labelledby={framed ? listTitleId : undefined}
      data-tour="crm-activities"
    >
      {framed ? (
        <div className="cartao__cab">
          <div>
            <h2 id={listTitleId}>
              <ListTodo className="ic" aria-hidden="true" />
              {title}
            </h2>
            {!compact && !q.loading && total > 0 && (
              <p>
                {total} {total === 1 ? 'tarefa' : 'tarefas'}
              </p>
            )}
          </div>
          {!empty && newTaskButton}
        </div>
      ) : (
        !empty && newTaskButton && <div className="crm-tarefas__barra">{newTaskButton}</div>
      )}

      <div className={framed ? 'cartao__corpo' : 'crm-tarefas__corpo'}>
        {tzNote && <p className="crm-tarefas__fuso">{tzNote}</p>}
        {q.loading ? (
          <div className="crm-tarefas__carregando" role="status" aria-busy="true" aria-label="Carregando tarefas">
            {Array.from({ length: compact ? 3 : 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : empty ? (
          <div className="vazio crm-tarefas__vazio">
            <ListTodo className="ic mx-auto" aria-hidden="true" />
            <strong>{compact ? 'Nenhuma tarefa' : (emptyTitle ?? 'Nenhuma tarefa por aqui')}</strong>
            {!compact && <p>{emptyText ?? 'Tarefas lembram o próximo passo de cada negócio: retornar ao cliente, ligar, mandar a proposta.'}</p>}
            {newTaskButton && <div className="crm-tarefas__vazio-acao">{newTaskButton}</div>}
          </div>
        ) : (
          <ul className="crm-tarefas__lista">
            {items.map((a) => {
              const Icon = TYPE_ICON[a.type] ?? ListTodo
              const closed = CLOSED.includes(a.status)
              const itemTitleId = `${listTitleId}-item-${a.id}`
              const itemBusy = busy?.id === a.id ? busy.action : null
              const ownerName = a.ownerMemberId ? (names.get(a.ownerMemberId) ?? 'Responsável') : 'Sem responsável'
              return (
                <li key={a.id} className={`crm-tarefa${a.overdue ? ' crm-tarefa--atrasada' : ''}${closed ? ' crm-tarefa--fechada' : ''}`}>
                  <span className="crm-tarefa__icone" aria-hidden="true">
                    <Icon className="ic" />
                  </span>
                  <div className="crm-tarefa__texto">
                    <strong id={itemTitleId}>{a.title}</strong>
                    <div className="crm-tarefa__tags">
                      <span className="tag tag--contorno">{labelOf(ACTIVITY_TYPE_LABEL, a.type)}</span>
                      <span className={`tag ${STATUS_TAG[a.status] ?? 'tag--cinza'}`}>{labelOf(ACTIVITY_STATUS_LABEL, a.status)}</span>
                      {a.priority && a.priority !== 'normal' && (
                        <span className={`tag ${a.priority === 'high' ? 'tag--laranja' : 'tag--cinza'}`}>Prioridade {labelOf(PRIORITY_LABEL, a.priority).toLowerCase()}</span>
                      )}
                      {a.overdue && (
                        <span className="tag tag--vermelho">
                          <TriangleAlert className="ic" aria-hidden="true" />
                          Atrasada
                        </span>
                      )}
                    </div>
                    <div className="crm-tarefa__info">
                      <span>
                        <CalendarClock className="ic" aria-hidden="true" />
                        {a.dueAt ? `Prazo: ${formatZoned(new Date(a.dueAt), tz)}` : 'Sem prazo'}
                      </span>
                      <span>
                        <User className="ic" aria-hidden="true" />
                        {ownerName}
                      </span>
                      {!dealId && a.deal && (
                        <button type="button" className="btn btn--sm btn--link crm-tarefa__vinculo" onClick={() => openCrm('deal', a.deal!.id)}>
                          Negócio: {a.deal.title}
                        </button>
                      )}
                      {!dealId && !personId && !a.deal && a.person && (
                        <button type="button" className="btn btn--sm btn--link crm-tarefa__vinculo" onClick={() => openCrm('contact', a.person!.id)}>
                          Contato: {a.person.name}
                        </button>
                      )}
                    </div>
                    {!compact && a.notes && <p className="crm-tarefa__nota">{a.notes}</p>}
                  </div>
                  {canManage && (
                    <div className="crm-tarefa__acoes">
                      {closed ? (
                        <button type="button" className="btn btn--sm" aria-describedby={itemTitleId} disabled={anyBusy} onClick={() => void patch(a, { status: 'open' }, 'Tarefa reaberta.', 'open')}>
                          {itemBusy === 'open' ? 'Reabrindo…' : 'Reabrir'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn--sm btn--contorno-verde"
                            aria-describedby={itemTitleId}
                            disabled={anyBusy}
                            onClick={() => void patch(a, { status: 'done' }, 'Tarefa concluída.', 'done', { status: a.status })}
                          >
                            {itemBusy === 'done' ? 'Concluindo…' : 'Concluir'}
                          </button>
                          <button type="button" className="btn btn--sm" aria-describedby={itemTitleId} disabled={anyBusy} onClick={() => openReschedule(a)}>
                            Reagendar
                          </button>
                          <button type="button" className="btn btn--sm" aria-describedby={itemTitleId} disabled={anyBusy} onClick={() => openEdit(a)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--link"
                            aria-describedby={itemTitleId}
                            disabled={anyBusy}
                            onClick={() => void patch(a, { status: 'cancelled' }, 'Tarefa cancelada.', 'cancelled', { status: a.status })}
                          >
                            {itemBusy === 'cancelled' ? 'Cancelando…' : 'Cancelar'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {!q.loading && !empty && compact && (
        <div className="crm-tarefas__rodape">
          <span className="suave">
            {total > items.length ? `${items.length} de ${total}` : `${total} ${total === 1 ? 'tarefa' : 'tarefas'}`}
          </span>
          <button type="button" className="btn btn--sm btn--link" onClick={() => setView('crm-activities')}>
            Ver todas as tarefas
          </button>
        </div>
      )}

      {!q.loading && !empty && !compact && pages > 1 && (
        <nav className="paginacao" aria-label="Páginas de tarefas">
          <span className="suave">
            Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
          </span>
          <div className="linha-flex">
            <button type="button" className="pag" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="ic" aria-hidden="true" />
            </button>
            <span className="num" aria-current="page">
              {page} / {pages}
            </span>
            <button type="button" className="pag" aria-label="Próxima página" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="ic" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      <Dialog
        open={reschedule !== null}
        onOpenChange={(open) => {
          if (!open && !anyBusy) setReschedule(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitReschedule()
            }}
            className="grid gap-4"
            noValidate
          >
            <DialogHeader>
              <DialogTitle>Reagendar tarefa</DialogTitle>
              <DialogDescription>{reschedule ? `Novo prazo para “${reschedule.title}”.` : 'Novo prazo da tarefa.'}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="crm-reagendar-data">Data</Label>
                <Input
                  id="crm-reagendar-data"
                  type="date"
                  required
                  value={rDate}
                  aria-describedby={zoneHint ? 'crm-reagendar-fuso' : undefined}
                  onChange={(e) => setRDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="crm-reagendar-hora">Hora</Label>
                <Input id="crm-reagendar-hora" type="time" value={rTime} aria-describedby={zoneHint ? 'crm-reagendar-fuso' : undefined} onChange={(e) => setRTime(e.target.value)} />
              </div>
              {zoneHint && (
                <p id="crm-reagendar-fuso" className="col-span-2 text-xs text-[var(--suave)]">
                  {zoneHint}
                </p>
              )}
            </div>
            {formError && (
              <p role="alert" className="text-sm text-[var(--vermelho)]">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={anyBusy} onClick={() => setReschedule(null)}>
                Voltar
              </Button>
              <Button type="submit" disabled={anyBusy}>
                {busy?.action === 'reschedule' ? 'Salvando…' : 'Salvar novo prazo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open && !sending) setCreating(false)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitCreate()
            }}
            className="grid gap-4"
            noValidate
          >
            <DialogHeader>
              <DialogTitle>Nova tarefa</DialogTitle>
              <DialogDescription>
                {dealId ? 'A tarefa fica ligada a este negócio.' : personId ? 'A tarefa fica ligada a este contato.' : 'Um lembrete do próximo passo com o cliente.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="crm-tarefa-tipo">Tipo</Label>
              <select id="crm-tarefa-tipo" className={SELECT_CLASS} value={form.type} aria-describedby="crm-tarefa-tipo-dica" onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {TYPES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <p id="crm-tarefa-tipo-dica" className="text-xs text-[var(--suave)]">
                {D3_HINT}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="crm-tarefa-titulo">Título</Label>
              <Input
                id="crm-tarefa-titulo"
                value={form.title}
                maxLength={160}
                required
                aria-invalid={formError === TITLE_REQUIRED}
                aria-describedby={formError === TITLE_REQUIRED ? 'crm-tarefa-erro' : undefined}
                placeholder="Ex.: Ligar para confirmar o orçamento"
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="crm-tarefa-data">Prazo</Label>
                <Input id="crm-tarefa-data" type="date" value={form.date} aria-describedby="crm-tarefa-data-dica" onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="crm-tarefa-hora">Hora</Label>
                <Input id="crm-tarefa-hora" type="time" value={form.time} disabled={!form.date} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
              </div>
              <p id="crm-tarefa-data-dica" className="col-span-2 text-xs text-[var(--suave)]">
                Apague a data para criar sem prazo.{zoneHint && ` ${zoneHint}`}
              </p>
            </div>
            {/* no celular um embaixo do outro: lado a lado, nomes longos e "Prioridade" eram cortados em 320 px */}
            <div className={canAssign ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
              <div className="grid gap-2">
                <Label htmlFor="crm-tarefa-prioridade">Prioridade</Label>
                <select id="crm-tarefa-prioridade" className={SELECT_CLASS} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {canAssign && (
                <div className="grid gap-2">
                  <Label htmlFor="crm-tarefa-responsavel">Responsável</Label>
                  <select
                    id="crm-tarefa-responsavel"
                    className={SELECT_CLASS}
                    value={form.owner}
                    disabled={membersQ.loading}
                    onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                  >
                    {me?.id && <option value={me.id}>Eu ({me.name})</option>}
                    {assignable
                      .filter((m) => m.id !== me?.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    <option value="">Sem responsável</option>
                  </select>
                  {membersQ.error && <p className="text-xs text-[var(--suave)]">Não foi possível carregar a equipe. A tarefa pode ficar com você.</p>}
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="crm-tarefa-notas">Observação (opcional)</Label>
              <Textarea id="crm-tarefa-notas" rows={3} maxLength={5000} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {formError && (
              <p id="crm-tarefa-erro" role="alert" className="text-sm text-[var(--vermelho)]">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={sending} onClick={() => setCreating(false)}>
                Voltar
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? 'Criando…' : 'Criar tarefa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !anyBusy) setEditing(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitEdit()
            }}
            className="grid gap-4"
            noValidate
          >
            <DialogHeader>
              <DialogTitle>Editar tarefa</DialogTitle>
              <DialogDescription>Para mudar o prazo, use “Reagendar”. Concluir e cancelar ficam nos botões da tarefa.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="crm-editar-titulo">Título</Label>
              <Input
                id="crm-editar-titulo"
                value={editForm.title}
                maxLength={160}
                required
                aria-invalid={editError === TITLE_REQUIRED}
                aria-describedby={editError === TITLE_REQUIRED ? 'crm-editar-titulo-erro' : undefined}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
              {editError === TITLE_REQUIRED && (
                <p id="crm-editar-titulo-erro" role="alert" className="text-sm text-[var(--vermelho)]">
                  {editError}
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="crm-editar-situacao">Situação</Label>
                <select id="crm-editar-situacao" className={SELECT_CLASS} value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                  {EDIT_STATUSES.map((code) => (
                    <option key={code} value={code}>
                      {ACTIVITY_STATUS_LABEL[code]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="crm-editar-prioridade">Prioridade</Label>
                <select id="crm-editar-prioridade" className={SELECT_CLASS} value={editForm.priority} onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {canAssign && (
              <div className="grid gap-2">
                <Label htmlFor="crm-editar-responsavel">Responsável</Label>
                <select
                  id="crm-editar-responsavel"
                  className={SELECT_CLASS}
                  value={editForm.owner}
                  disabled={membersQ.loading}
                  onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}
                >
                  {me?.id && <option value={me.id}>Eu ({me.name})</option>}
                  {/* o responsável de agora fica na lista mesmo fora da equipe que dá para escolher (inativo, outra equipe) */}
                  {editing?.ownerMemberId && editing.ownerMemberId !== me?.id && !assignable.some((m) => m.id === editing.ownerMemberId) && (
                    <option value={editing.ownerMemberId}>{names.get(editing.ownerMemberId) ?? 'Responsável atual'}</option>
                  )}
                  {assignable
                    .filter((m) => m.id !== me?.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  <option value="">Sem responsável</option>
                </select>
                {membersQ.error && <p className="text-xs text-[var(--suave)]">Não foi possível carregar a equipe. O responsável pode ficar como está.</p>}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="crm-editar-notas">Observações (opcional)</Label>
              <Textarea id="crm-editar-notas" rows={3} maxLength={5000} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={anyBusy} onClick={() => setEditing(null)}>
                Voltar
              </Button>
              <Button type="submit" disabled={anyBusy}>
                {busy?.action === 'edit' ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
