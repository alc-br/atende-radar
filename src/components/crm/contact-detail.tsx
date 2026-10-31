'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Archive, ArrowLeft, ContactRound, ExternalLink, GitMerge, Handshake, Info, MessageSquare, Pencil, Search, TriangleAlert } from 'lucide-react'
import { ActivityList } from '@/components/crm/activity-list'
import { STATUS_TAG } from '@/components/conversations/tags'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CrmApiError, crmErrorMessage, crmSend, useCrmQuery, type CrmActivity, type CrmCompany, type CrmDeal, type CrmPerson } from '@/lib/crm/client'
import { DEAL_STATUS_LABEL, DEAL_STATUS_TAG } from '@/lib/crm/labels'
import { formatCents } from '@/lib/crm/money'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'
import { cn, getStatusLabel } from '@/lib/utils'

// Detalhe de um contato comercial: dados (edição com versão), negócios, conversas do WhatsApp ligadas e tarefas.
// O telefone vem só com os 4 últimos dígitos; o número completo só existe no campo "Novo telefone" da edição.

const PHONE_RE = /^[+\d\s().-]*$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type MemberName = { id: string; name: string }
type CompanyRef = { id: string; name: string }
type ConversationLink = { id: string; operationalStatus: string; openedAt: string | null; lastInboundAt: string | null; closedAt: string | null }
type DetailPerson = CrmPerson & { company: CompanyRef | null }
type PersonDetail = { person: DetailPerson; deals: CrmDeal[]; activities: CrmActivity[]; conversations: ConversationLink[]; members: MemberName[] }
type PersonRow = CrmPerson & { company: CompanyRef | null; dealCount: number }
type PeopleList = { items: PersonRow[]; total: number; page: number; limit: number }
type CompanyOptions = { items: CrmCompany[]; total: number }
type OrgMember = { id: string; name: string | null; email: string; role: string; team: string | null; status: string }
type MembersResponse = { members: OrgMember[] }
type Me = ReturnType<typeof useAppStore.getState>['me']

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Cadastrado à mão',
  whatsapp: 'Veio do WhatsApp',
  import: 'Importado de planilha',
}

const numero = new Intl.NumberFormat('pt-BR')
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function fmtDataHora(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : dataHora.format(d)
}

function plural(n: number, um: string, varios: string): string {
  return `${numero.format(n)} ${n === 1 ? um : varios}`
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function memberLabel(m: OrgMember): string {
  return m.name?.trim() || m.email.split('@')[0]
}

function membersInReach(members: OrgMember[] | undefined, me: Me): OrgMember[] {
  const list = members ?? []
  const team = me?.role === 'supervisor' ? me.team?.trim() : ''
  return team ? list.filter((m) => m.team?.trim() === team) : list
}

function ownerName(id: string | null, names: MemberName[], me: Me): string {
  if (!id) return 'Sem responsável'
  if (me?.id && id === me.id) return me.name ? `${me.name} (você)` : 'Você'
  return names.find((m) => m.id === id)?.name ?? 'Outro responsável'
}

function phoneText(p: CrmPerson): string {
  return p.phoneLast4 ? `•••• ${p.phoneLast4}` : 'Não informado'
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null
  return (
    <p id={id} className="crm-erro-campo">
      {message}
    </p>
  )
}

function DealItem({ deal, onOpen }: { deal: CrmDeal; onOpen: () => void }) {
  return (
    <li className="crm-lista__item">
      <div className="crm-lista__principal">
        <button type="button" className="crm-link" onClick={onOpen}>
          {deal.title}
        </button>
        <span className="crm-lista__meta">
          <span className={cn('tag', DEAL_STATUS_TAG[deal.status] ?? 'tag--cinza')}>
            <span className="ponto" />
            {DEAL_STATUS_LABEL[deal.status] ?? deal.status}
          </span>
          <span>Atualizado em {fmtDataHora(deal.updatedAt)}</span>
        </span>
      </div>
      <div className="crm-lista__valor">
        <strong>
          <span className="sr-only">Valor declarado: </span>
          {formatCents(deal.amountCents)}
        </strong>
        {deal.estimatedAmountCents !== null && deal.estimatedAmountCents !== undefined && (
          <div className="crm-estimado">Estimado pela análise: {formatCents(deal.estimatedAmountCents)} (não é receita)</div>
        )}
      </div>
    </li>
  )
}

// ── Edição ───────────────────────────────────────────────────────────────────

interface EditProps {
  person: DetailPerson
  ownerLabel: string
  canAssign: boolean
  me: Me
  onCancel: () => void
  onSaved: () => void
  onConflict: () => void
}

function ContactEditForm({ person, ownerLabel, canAssign, me, onCancel, onSaved, onConflict }: EditProps) {
  const openCrm = useAppStore((s) => s.openCrm)
  const companies = useCrmQuery<CompanyOptions>('/api/crm/companies?limit=100')
  const members = useCrmQuery<MembersResponse>(canAssign ? '/api/members' : null)
  const [name, setName] = useState(person.name)
  const [phone, setPhone] = useState('')
  const [clearPhone, setClearPhone] = useState(false)
  const [email, setEmail] = useState(person.email ?? '')
  const [companyId, setCompanyId] = useState(person.companyId ?? '')
  const [ownerId, setOwnerId] = useState(person.ownerMemberId ?? '')
  const [notes, setNotes] = useState(person.notes ?? '')
  const [tried, setTried] = useState(false)
  const [sending, setSending] = useState(false)
  const [dup, setDup] = useState<{ message: string; existingId: string | null } | null>(null)

  const listed: CompanyRef[] = (companies.data?.items ?? []).map((c) => ({ id: c.id, name: c.name }))
  const companyOptions = person.company && !listed.some((c) => c.id === person.company?.id) ? [person.company, ...listed] : listed
  const reach = membersInReach(members.data?.members, me).filter((m) => m.status === 'active')
  const ownerOptions: CompanyRef[] = reach.map((m) => ({ id: m.id, name: `${memberLabel(m)}${m.id === me?.id ? ' (você)' : ''}` }))
  if (person.ownerMemberId && !ownerOptions.some((o) => o.id === person.ownerMemberId)) ownerOptions.unshift({ id: person.ownerMemberId, name: ownerLabel })

  const errors = {
    name: !name.trim() ? 'Informe o nome.' : name.trim().length > 120 ? 'Use até 120 caracteres.' : null,
    phone: !clearPhone && phone.trim() && (!PHONE_RE.test(phone.trim()) || phone.trim().length > 32) ? 'Telefone inválido.' : null,
    email: email.trim() && !EMAIL_RE.test(email.trim()) ? 'E-mail inválido.' : null,
  }
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null)
  const existingId = dup?.existingId ?? null

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setTried(true)
    if (sending || errors.name || errors.phone || errors.email) return
    const patch: Record<string, unknown> = { version: person.version }
    if (name.trim() !== person.name) patch.name = name.trim()
    if (clearPhone) patch.phone = null
    else if (phone.trim()) patch.phone = phone.trim()
    const nextEmail = email.trim() || null
    if (nextEmail !== (person.email ?? null)) patch.email = nextEmail
    const nextCompany = companyId || null
    if (nextCompany !== (person.companyId ?? null)) patch.companyId = nextCompany
    if (canAssign) {
      const nextOwner = ownerId || null
      if (nextOwner !== (person.ownerMemberId ?? null)) patch.ownerMemberId = nextOwner
    }
    const nextNotes = notes.trim() || null
    if (nextNotes !== (person.notes ?? null)) patch.notes = nextNotes
    if (Object.keys(patch).length === 1) {
      toast.info('Nenhuma alteração para salvar.')
      onCancel()
      return
    }
    setSending(true)
    setDup(null)
    try {
      await crmSend<{ person: CrmPerson }>(`/api/crm/contacts/${encodeURIComponent(person.id)}`, { method: 'PATCH', json: patch })
      toast.success('Contato atualizado.')
      onSaved()
    } catch (err) {
      if (err instanceof CrmApiError && err.code === 'crm_version_conflict') {
        toast.error(crmErrorMessage(err))
        onConflict()
        return
      }
      if (err instanceof CrmApiError && err.code === 'crm_duplicate') {
        setDup({ message: err.message, existingId: typeof err.extra.existingId === 'string' ? err.extra.existingId : null })
      }
      toast.error(crmErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="crm-form" onSubmit={submit} noValidate aria-label="Editar contato">
      <div className="campo">
        <label htmlFor="crm-contato-nome">Nome</label>
        <input
          id="crm-contato-nome"
          className="entrada"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoComplete="off"
          required
          aria-invalid={!!show('name') || undefined}
          aria-describedby={show('name') ? 'crm-contato-nome-erro' : undefined}
        />
        <FieldError id="crm-contato-nome-erro" message={show('name')} />
      </div>
      <div className="campo">
        <span className="rotulo">Telefone salvo</span>
        <p className="crm-fone">{phoneText(person)}</p>
      </div>
      <div className="campo">
        <label htmlFor="crm-contato-telefone">Novo telefone</label>
        <input
          id="crm-contato-telefone"
          className="entrada"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(11) 91234-5678"
          maxLength={32}
          autoComplete="off"
          disabled={clearPhone}
          aria-invalid={!!show('phone') || undefined}
          aria-describedby={show('phone') ? 'crm-contato-telefone-erro' : 'crm-contato-telefone-ajuda'}
        />
        <p id="crm-contato-telefone-ajuda" className="ajuda-campo">
          Deixe em branco para manter o atual.
        </p>
        <FieldError id="crm-contato-telefone-erro" message={show('phone')} />
      </div>
      {person.hasPhone && (
        <label className="crm-checkbox" htmlFor="crm-contato-apagar-fone">
          <input
            id="crm-contato-apagar-fone"
            type="checkbox"
            checked={clearPhone}
            onChange={(e) => {
              setClearPhone(e.target.checked)
              if (e.target.checked) setPhone('')
            }}
          />
          <span>Apagar o telefone salvo</span>
        </label>
      )}
      <div className="campo">
        <label htmlFor="crm-contato-email">E-mail</label>
        <input
          id="crm-contato-email"
          className="entrada"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="maria.silva@exemplo.com.br"
          maxLength={254}
          autoComplete="off"
          aria-invalid={!!show('email') || undefined}
          aria-describedby={show('email') ? 'crm-contato-email-erro' : undefined}
        />
        <FieldError id="crm-contato-email-erro" message={show('email')} />
      </div>
      <div className="campo">
        <label htmlFor="crm-contato-empresa">Empresa</label>
        <select id="crm-contato-empresa" className="selecao" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Sem empresa</option>
          {companyOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {companies.loading && <p className="ajuda-campo">Carregando empresas…</p>}
        {companies.error && (
          <p className="crm-erro-campo" role="alert">
            Não foi possível carregar as empresas.{' '}
            <button type="button" className="btn btn--link btn--sm" onClick={companies.refetch}>
              Tentar novamente
            </button>
          </p>
        )}
      </div>
      {canAssign && (
        <div className="campo">
          <label htmlFor="crm-contato-responsavel">Responsável</label>
          <select id="crm-contato-responsavel" className="selecao" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Sem responsável</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="campo">
        <label htmlFor="crm-contato-obs">Observações</label>
        <textarea id="crm-contato-obs" className="area" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} />
      </div>
      {dup && (
        <div className="aviso aviso--ambar" role="alert">
          <span className="aviso__ic">
            <TriangleAlert className="ic" aria-hidden="true" />
          </span>
          <div>
            <p>{dup.message}</p>
            {existingId && (
              <button type="button" className="btn btn--sm mt-2" onClick={() => openCrm('contact', existingId)}>
                <ExternalLink className="ic" aria-hidden="true" />
                Abrir contato existente
              </button>
            )}
          </div>
        </div>
      )}
      <div className="crm-form__acoes">
        <button type="button" className="btn" onClick={onCancel} disabled={sending}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primario" disabled={sending}>
          {sending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}

// ── Mesclar ──────────────────────────────────────────────────────────────────

interface MergeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  keep: DetailPerson
  onMerged: () => void
  onConflict: () => void
}

function MergeDialog({ open, onOpenChange, keep, onMerged, onConflict }: MergeProps) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim())
  const results = useCrmQuery<PeopleList>(open && dq ? `/api/crm/contacts?q=${encodeURIComponent(dq)}&limit=10` : null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const options = (results.data?.items ?? []).filter((p) => p.id !== keep.id)
  const chosen = options.find((p) => p.id === selectedId) ?? null

  async function merge() {
    if (!chosen || sending) return
    setSending(true)
    try {
      const res = await crmSend<{ person: CrmPerson; moved: { deals: number; activities: number; identityLinks: number } }>('/api/crm/contacts/merge', {
        json: { keepId: keep.id, mergeId: chosen.id, keepVersion: keep.version, mergeVersion: chosen.version },
      })
      toast.success(
        `Contatos mesclados: ${plural(res.moved.deals, 'negócio', 'negócios')}, ${plural(res.moved.activities, 'tarefa', 'tarefas')} e ${plural(res.moved.identityLinks, 'vínculo com o WhatsApp', 'vínculos com o WhatsApp')} vieram para este contato.`,
      )
      onOpenChange(false)
      onMerged()
    } catch (err) {
      if (err instanceof CrmApiError && err.code === 'crm_version_conflict') {
        setSelectedId(null)
        results.refetch()
        onConflict()
      }
      toast.error(crmErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="ar bg-none sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mesclar com outro contato</DialogTitle>
          <DialogDescription>
            Escolha o cadastro repetido de {keep.name}. O outro contato deixa de existir, e os negócios, as tarefas e os vínculos com o WhatsApp
            dele passam para este.
          </DialogDescription>
        </DialogHeader>
        <div className="crm-form">
          <div className="aviso crm-nota">
            <Info className="ic" aria-hidden="true" />
            <p>O que faltar neste contato (e-mail, telefone, empresa, responsável, etiquetas) é copiado do outro. Não dá para desfazer pela tela.</p>
          </div>
          <div className="campo">
            <label htmlFor="crm-mesclar-busca">Buscar o outro contato</label>
            <div className="entrada-ic">
              <Search className="ic" aria-hidden="true" />
              <input
                id="crm-mesclar-busca"
                className="entrada"
                type="search"
                placeholder="Nome, e-mail ou 4 últimos dígitos do telefone"
                maxLength={120}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          {!dq ? (
            <p className="ajuda-campo">Digite para buscar o cadastro repetido.</p>
          ) : results.error && !results.data ? (
            <div className="cartao vazio" role="alert">
              <strong>Não foi possível buscar os contatos.</strong>
              <p>{crmErrorMessage(results.error, 'Confira a sua conexão e tente novamente.')}</p>
              <button type="button" className="btn mt-3" onClick={results.refetch}>
                Tentar novamente
              </button>
            </div>
          ) : !results.data ? (
            <div className="grid gap-2" role="status">
              <span className="sr-only">Buscando contatos…</span>
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : options.length === 0 ? (
            <div className="vazio">
              <strong>Nenhum outro contato encontrado</strong>
              <p>Tente outra parte do nome, o e-mail ou os 4 últimos dígitos do telefone.</p>
            </div>
          ) : (
            <fieldset className="crm-escolha">
              <legend>Contato que vai deixar de existir</legend>
              {options.map((p) => (
                <label key={p.id} htmlFor={`crm-mesclar-${p.id}`}>
                  <input id={`crm-mesclar-${p.id}`} type="radio" name="crm-mesclar" checked={selectedId === p.id} onChange={() => setSelectedId(p.id)} />
                  <span>
                    {p.name}
                    <small>
                      {[p.company?.name, p.phoneLast4 ? `•••• ${p.phoneLast4}` : null, p.email].filter(Boolean).join(' · ') ||
                        'Sem empresa, telefone ou e-mail'}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <DialogFooter>
          <button type="button" className="btn" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </button>
          <button type="button" className="btn btn--perigo" onClick={merge} disabled={!chosen || sending}>
            <GitMerge className="ic" aria-hidden="true" />
            {sending ? 'Mesclando…' : 'Mesclar contatos'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tela ─────────────────────────────────────────────────────────────────────

export default function CrmContactDetail() {
  const id = useAppStore((s) => s.selectedCrmId)
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const selectConversation = useAppStore((s) => s.selectConversation)
  const role = me?.role ?? null
  const canManage = can(role, 'crm.contacts.manage')
  const canMerge = can(role, 'crm.contacts.merge')
  const canAssign = canManage && can(role, 'members.view')
  const canOpenConversation = can(role, 'conversations.view')
  const detail = useCrmQuery<PersonDetail>(id ? `/api/crm/contacts/${encodeURIComponent(id)}` : null)

  const [editing, setEditing] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeKey, setMergeKey] = useState(0)

  const back = () => openCrm('contact', null)
  const backButton = (
    <button type="button" className="voltar" onClick={back}>
      <ArrowLeft className="ic" aria-hidden="true" />
      Voltar para contatos
    </button>
  )

  if (!id) {
    return (
      <>
        {backButton}
        <header className="cab-pagina">
          <div className="cab-pagina__titulo">
            <ContactRound className="ic cab-pagina__icone" aria-hidden="true" />
            <div>
              <h1>Contato</h1>
            </div>
          </div>
        </header>
        <div className="cartao vazio" role="status">
          <strong>Nenhum contato selecionado</strong>
          <p>Escolha um contato na lista para ver os dados, os negócios e as conversas dele.</p>
          <button type="button" className="btn mt-3" onClick={back}>
            Ir para a lista de contatos
          </button>
        </div>
      </>
    )
  }

  if (detail.error && !detail.data) {
    // 404 'crm_disabled' (CRM desligado) não é "não encontrado": cai no aviso com a mensagem do servidor
    const notFound =
      detail.error.code === 'crm_not_found' || (detail.error.status === 404 && detail.error.code !== 'crm_disabled')
    return (
      <>
        {backButton}
        <header className="cab-pagina">
          <div className="cab-pagina__titulo">
            <ContactRound className="ic cab-pagina__icone" aria-hidden="true" />
            <div>{notFound ? <h1>Contato não encontrado</h1> : <h1>Contato</h1>}</div>
          </div>
        </header>
        {notFound ? (
          <div className="cartao vazio" role="status">
            <strong>Este contato não existe ou você não tem acesso a ele.</strong>
            <p>Ele pode ter sido removido ou estar com um responsável fora do seu acesso.</p>
            <button type="button" className="btn mt-3" onClick={back}>
              Ir para a lista de contatos
            </button>
          </div>
        ) : (
          <div className="cartao vazio" role="alert">
            <strong>Não foi possível carregar o contato.</strong>
            <p>{crmErrorMessage(detail.error, 'Confira a sua conexão e tente novamente.')}</p>
            <button type="button" className="btn mt-3" onClick={detail.refetch}>
              Tentar novamente
            </button>
          </div>
        )}
      </>
    )
  }

  if (!detail.data) {
    return (
      <>
        {backButton}
        <header className="cab-pagina">
          <div className="cab-pagina__titulo">
            <ContactRound className="ic cab-pagina__icone" aria-hidden="true" />
            <div>
              <h1>Contato</h1>
              <p>Carregando…</p>
            </div>
          </div>
        </header>
        <div className="grade grade-2 crm-grade" role="status">
          <span className="sr-only">Carregando o contato…</span>
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    )
  }

  const { person, deals, conversations, members } = detail.data
  const active = person.status === 'active'
  const owner = ownerName(person.ownerMemberId, members, me)
  const company = person.company
  const mergedInto = person.mergedIntoId

  async function archive() {
    if (archiving) return
    setArchiving(true)
    try {
      await crmSend<{ person: CrmPerson }>(`/api/crm/contacts/${encodeURIComponent(person.id)}`, { method: 'DELETE', json: { version: person.version } })
      toast.success('Contato arquivado.')
      setArchiveOpen(false)
      openCrm('contact', null)
    } catch (err) {
      if (err instanceof CrmApiError && err.code === 'crm_version_conflict') {
        setArchiveOpen(false)
        detail.refetch()
      }
      toast.error(crmErrorMessage(err))
    } finally {
      setArchiving(false)
    }
  }

  return (
    <>
      {backButton}
      <header className="cab-pagina" data-tour="crm-contact-detail">
        <div className="cab-pagina__titulo">
          <ContactRound className="ic cab-pagina__icone" aria-hidden="true" />
          <div>
            <h1>{person.name}</h1>
            <p>
              {company ? company.name : 'Sem empresa'} · {SOURCE_LABEL[person.source] ?? 'Origem não informada'}
            </p>
          </div>
        </div>
        {active && (canMerge || canManage) && (
          <div className="cab-pagina__acoes">
            {canMerge && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setMergeKey((k) => k + 1)
                  setMergeOpen(true)
                }}
              >
                <GitMerge className="ic" aria-hidden="true" />
                Mesclar com outro contato
              </button>
            )}
            {canManage && (
              <button type="button" className="btn" onClick={() => setArchiveOpen(true)}>
                <Archive className="ic" aria-hidden="true" />
                Arquivar
              </button>
            )}
          </div>
        )}
      </header>

      {detail.error && (
        <div className="aviso aviso--ambar" role="alert">
          <span className="aviso__ic">
            <TriangleAlert className="ic" aria-hidden="true" />
          </span>
          <div>
            <p>Não foi possível atualizar o contato. Os dados abaixo podem estar desatualizados.</p>
            <button type="button" className="btn btn--sm mt-2" onClick={detail.refetch}>
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {person.status === 'archived' && (
        <div className="aviso aviso--ambar" role="status">
          <span className="aviso__ic">
            <Archive className="ic" aria-hidden="true" />
          </span>
          <p>Este contato está arquivado: ele não aparece na lista e não pode ser editado.</p>
        </div>
      )}
      {person.status === 'merged' && (
        <div className="aviso aviso--ambar" role="status">
          <span className="aviso__ic">
            <GitMerge className="ic" aria-hidden="true" />
          </span>
          <div>
            <p>Este contato foi mesclado com outro. Os negócios, as tarefas e os vínculos dele estão no contato mantido.</p>
            {mergedInto && (
              <button type="button" className="btn btn--sm mt-2" onClick={() => openCrm('contact', mergedInto)}>
                <ExternalLink className="ic" aria-hidden="true" />
                Abrir contato mantido
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grade grade-2 crm-grade">
        <section className="cartao" aria-labelledby="crm-contato-dados">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-contato-dados">Dados do contato</h2>
              {editing && <p>Só muda o que você alterar.</p>}
            </div>
            {canManage && active && !editing && (
              <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
                <Pencil className="ic" aria-hidden="true" />
                Editar contato
              </button>
            )}
          </div>
          <div className="cartao__corpo">
            {editing ? (
              <ContactEditForm
                key={person.version}
                person={person}
                ownerLabel={owner}
                canAssign={canAssign}
                me={me}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false)
                  detail.refetch()
                }}
                onConflict={() => {
                  setEditing(false)
                  detail.refetch()
                }}
              />
            ) : (
              <dl className="crm-dados">
                <div>
                  <dt>Telefone</dt>
                  <dd className="crm-fone">{phoneText(person)}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>{person.email ?? 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Empresa</dt>
                  <dd>
                    {company ? (
                      <button type="button" className="crm-link" onClick={() => openCrm('company', company.id)}>
                        {company.name}
                      </button>
                    ) : (
                      'Sem empresa'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{owner}</dd>
                </div>
                <div>
                  <dt>Origem</dt>
                  <dd>{SOURCE_LABEL[person.source] ?? 'Não informada'}</dd>
                </div>
                <div>
                  <dt>Última interação</dt>
                  <dd>{person.lastInteractionAt ? fmtDataHora(person.lastInteractionAt) : 'Sem registro'}</dd>
                </div>
                {person.tags.length > 0 && (
                  <div className="crm-dados__todo">
                    <dt>Etiquetas</dt>
                    <dd className="crm-colunas">
                      {person.tags.map((t) => (
                        <span key={t} className="tag tag--contorno">
                          {t}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {person.notes && (
                  <div className="crm-dados__todo">
                    <dt>Observações</dt>
                    <dd>
                      <p>{person.notes}</p>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </section>

        <section className="cartao" aria-labelledby="crm-contato-negocios">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-contato-negocios">Negócios</h2>
              <p>{plural(deals.length, 'negócio', 'negócios')}</p>
            </div>
          </div>
          <div className="cartao__corpo">
            {deals.length === 0 ? (
              <div className="vazio">
                <Handshake className="ic mx-auto" aria-hidden="true" />
                <strong>Nenhum negócio com este contato</strong>
                <p>Crie o negócio no funil comercial ou a partir de uma conversa do WhatsApp.</p>
                <button type="button" className="btn mt-3" onClick={() => openCrm('deal', null)}>
                  Abrir negócios
                </button>
              </div>
            ) : (
              <ul className="crm-lista">
                {deals.map((d) => (
                  <DealItem key={d.id} deal={d} onOpen={() => openCrm('deal', d.id)} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="grade grade-2 crm-grade">
        <section className="cartao" aria-labelledby="crm-contato-conversas">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-contato-conversas">Conversas no WhatsApp</h2>
              <p>Do contato do WhatsApp ligado a este cadastro.</p>
            </div>
          </div>
          <div className="cartao__corpo">
            {conversations.length === 0 ? (
              <div className="vazio">
                <MessageSquare className="ic mx-auto" aria-hidden="true" />
                <strong>Nenhuma conversa ligada</strong>
                <p>O vínculo aparece quando o contato chega pelo WhatsApp ou quando um negócio dele é criado a partir de uma conversa.</p>
              </div>
            ) : (
              <ul className="crm-lista">
                {conversations.map((c) => {
                  const opened = fmtDataHora(c.openedAt)
                  return (
                    <li key={c.id} className="crm-lista__item">
                      <div className="crm-lista__principal">
                        <strong>Conversa aberta em {opened}</strong>
                        <span className="crm-lista__meta">
                          <span className={cn('tag', STATUS_TAG[c.operationalStatus] ?? 'tag--cinza')}>
                            <span className="ponto" />
                            {getStatusLabel(c.operationalStatus)}
                          </span>
                          {c.lastInboundAt && <span>Última mensagem do cliente: {fmtDataHora(c.lastInboundAt)}</span>}
                        </span>
                      </div>
                      {canOpenConversation && (
                        <button
                          type="button"
                          className="btn btn--sm btn--contorno-verde"
                          aria-label={`Abrir conversa de ${opened}`}
                          onClick={() => selectConversation(c.id)}
                        >
                          <MessageSquare className="ic" aria-hidden="true" />
                          Abrir conversa
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="cartao" aria-labelledby="crm-contato-tarefas">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-contato-tarefas">Tarefas</h2>
              <p>Retornos, ligações e reuniões com este contato.</p>
            </div>
          </div>
          <div className="cartao__corpo">
            <ActivityList personId={person.id} compact framed={false} />
          </div>
        </section>
      </div>

      {canManage && (
        <Dialog open={archiveOpen} onOpenChange={(o) => !archiving && setArchiveOpen(o)}>
          <DialogContent className="ar bg-none sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Arquivar contato</DialogTitle>
              <DialogDescription>
                {person.name} sai da lista e da busca. Os negócios e o histórico continuam guardados, e o telefone e o e-mail ficam livres para um novo
                cadastro.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button type="button" className="btn" onClick={() => setArchiveOpen(false)} disabled={archiving}>
                Cancelar
              </button>
              <button type="button" className="btn btn--perigo" onClick={archive} disabled={archiving}>
                <Archive className="ic" aria-hidden="true" />
                {archiving ? 'Arquivando…' : 'Arquivar contato'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canMerge && active && (
        <MergeDialog
          key={`mesclar-${mergeKey}`}
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          keep={person}
          onMerged={detail.refetch}
          onConflict={detail.refetch}
        />
      )}
    </>
  )
}
