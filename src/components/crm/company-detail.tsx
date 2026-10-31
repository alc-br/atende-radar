'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Archive, ArrowLeft, Building2, ContactRound, Handshake, Pencil, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CrmApiError, crmErrorMessage, crmSend, useCrmQuery, type CrmCompany, type CrmDeal, type CrmPerson } from '@/lib/crm/client'
import { DEAL_STATUS_LABEL, DEAL_STATUS_TAG } from '@/lib/crm/labels'
import { formatCents } from '@/lib/crm/money'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// Detalhe de uma empresa (cliente PJ): dados (edição com versão), pessoas ligadas a ela e negócios.

const CNPJ_RE = /^\d{14}$/
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i

type MemberName = { id: string; name: string }
type CompanyDetail = { company: CrmCompany; people: CrmPerson[]; deals: CrmDeal[]; members?: MemberName[] }
type OrgMember = { id: string; name: string | null; email: string; role: string; team: string | null; status: string }
type MembersResponse = { members: OrgMember[] }
type Me = ReturnType<typeof useAppStore.getState>['me']

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

function formatCnpj(taxId: string | null): string | null {
  if (!taxId) return null
  const d = taxId.replace(/\D/g, '')
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : taxId
}

function cleanDomain(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
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
  company: CrmCompany
  ownerLabel: string
  canAssign: boolean
  me: Me
  members: OrgMember[]
  onCancel: () => void
  onSaved: () => void
  onConflict: () => void
}

function CompanyEditForm({ company, ownerLabel, canAssign, me, members, onCancel, onSaved, onConflict }: EditProps) {
  const [name, setName] = useState(company.name)
  const [taxId, setTaxId] = useState(formatCnpj(company.taxId) ?? '')
  const [domain, setDomain] = useState(company.domain ?? '')
  const [segment, setSegment] = useState(company.segment ?? '')
  const [ownerId, setOwnerId] = useState(company.ownerMemberId ?? '')
  const [notes, setNotes] = useState(company.notes ?? '')
  const [tried, setTried] = useState(false)
  const [sending, setSending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const ownerOptions: MemberName[] = membersInReach(members, me)
    .filter((m) => m.status === 'active')
    .map((m) => ({ id: m.id, name: `${memberLabel(m)}${m.id === me?.id ? ' (você)' : ''}` }))
  if (company.ownerMemberId && !ownerOptions.some((o) => o.id === company.ownerMemberId)) ownerOptions.unshift({ id: company.ownerMemberId, name: ownerLabel })

  const taxDigits = taxId.replace(/\D/g, '')
  const domainClean = cleanDomain(domain)
  const errors = {
    name: !name.trim() ? 'Informe o nome.' : name.trim().length > 120 ? 'Use até 120 caracteres.' : null,
    taxId: taxId.trim() && !CNPJ_RE.test(taxDigits) ? 'CNPJ inválido: são 14 números.' : null,
    domain: domainClean && (!DOMAIN_RE.test(domainClean) || domainClean.length > 253) ? 'Site inválido. Use só o endereço, como exemplo.com.br.' : null,
  }
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setTried(true)
    if (sending || errors.name || errors.taxId || errors.domain) return
    const patch: Record<string, unknown> = { version: company.version }
    if (name.trim() !== company.name) patch.name = name.trim()
    const nextTax = taxDigits || null
    if (nextTax !== (company.taxId ?? null)) patch.taxId = nextTax
    const nextDomain = domainClean || null
    if (nextDomain !== (company.domain ?? null)) patch.domain = nextDomain
    const nextSegment = segment.trim() || null
    if (nextSegment !== (company.segment ?? null)) patch.segment = nextSegment
    if (canAssign) {
      const nextOwner = ownerId || null
      if (nextOwner !== (company.ownerMemberId ?? null)) patch.ownerMemberId = nextOwner
    }
    const nextNotes = notes.trim() || null
    if (nextNotes !== (company.notes ?? null)) patch.notes = nextNotes
    if (Object.keys(patch).length === 1) {
      toast.info('Nenhuma alteração para salvar.')
      onCancel()
      return
    }
    setSending(true)
    setServerError(null)
    try {
      await crmSend<{ company: CrmCompany }>(`/api/crm/companies/${encodeURIComponent(company.id)}`, { method: 'PATCH', json: patch })
      toast.success('Empresa atualizada.')
      onSaved()
    } catch (err) {
      if (err instanceof CrmApiError && err.code === 'crm_version_conflict') {
        toast.error(crmErrorMessage(err))
        onConflict()
        return
      }
      setServerError(crmErrorMessage(err))
      toast.error(crmErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="crm-form" onSubmit={submit} noValidate aria-label="Editar empresa">
      <div className="campo">
        <label htmlFor="crm-empresa-nome">Nome</label>
        <input
          id="crm-empresa-nome"
          className="entrada"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoComplete="off"
          required
          aria-invalid={!!show('name') || undefined}
          aria-describedby={show('name') ? 'crm-empresa-nome-erro' : undefined}
        />
        <FieldError id="crm-empresa-nome-erro" message={show('name')} />
      </div>
      <div className="campo">
        <label htmlFor="crm-empresa-cnpj">CNPJ</label>
        <input
          id="crm-empresa-cnpj"
          className="entrada"
          inputMode="numeric"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          placeholder="00.000.000/0000-00"
          maxLength={18}
          autoComplete="off"
          aria-invalid={!!show('taxId') || undefined}
          aria-describedby={show('taxId') ? 'crm-empresa-cnpj-erro' : 'crm-empresa-cnpj-ajuda'}
        />
        <p id="crm-empresa-cnpj-ajuda" className="ajuda-campo">
          Apague para tirar o CNPJ do cadastro.
        </p>
        <FieldError id="crm-empresa-cnpj-erro" message={show('taxId')} />
      </div>
      <div className="campo">
        <label htmlFor="crm-empresa-site">Site</label>
        <input
          id="crm-empresa-site"
          className="entrada"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="exemplo.com.br"
          maxLength={300}
          autoComplete="off"
          aria-invalid={!!show('domain') || undefined}
          aria-describedby={show('domain') ? 'crm-empresa-site-erro' : undefined}
        />
        <FieldError id="crm-empresa-site-erro" message={show('domain')} />
      </div>
      <div className="campo">
        <label htmlFor="crm-empresa-segmento">Segmento</label>
        <input id="crm-empresa-segmento" className="entrada" value={segment} onChange={(e) => setSegment(e.target.value)} maxLength={80} autoComplete="off" />
      </div>
      {canAssign && (
        <div className="campo">
          <label htmlFor="crm-empresa-responsavel">Responsável</label>
          <select id="crm-empresa-responsavel" className="selecao" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
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
        <label htmlFor="crm-empresa-obs">Observações</label>
        <textarea id="crm-empresa-obs" className="area" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} />
      </div>
      {serverError && (
        <p className="crm-erro-campo" role="alert">
          {serverError}
        </p>
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

// ── Tela ─────────────────────────────────────────────────────────────────────

export default function CrmCompanyDetail() {
  const id = useAppStore((s) => s.selectedCrmId)
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const role = me?.role ?? null
  const canManage = can(role, 'crm.contacts.manage')
  const canSeeMembers = can(role, 'members.view')
  const canAssign = canManage && canSeeMembers
  const detail = useCrmQuery<CompanyDetail>(id ? `/api/crm/companies/${encodeURIComponent(id)}` : null)
  const members = useCrmQuery<MembersResponse>(canSeeMembers ? '/api/members' : null)

  const [editing, setEditing] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const back = () => openCrm('company', null)
  const backButton = (
    <button type="button" className="voltar" onClick={back}>
      <ArrowLeft className="ic" aria-hidden="true" />
      Voltar para empresas
    </button>
  )

  if (!id) {
    return (
      <>
        {backButton}
        <header className="cab-pagina">
          <div className="cab-pagina__titulo">
            <Building2 className="ic cab-pagina__icone" aria-hidden="true" />
            <div>
              <h1>Empresa</h1>
            </div>
          </div>
        </header>
        <div className="cartao vazio" role="status">
          <strong>Nenhuma empresa selecionada</strong>
          <p>Escolha uma empresa na lista para ver os dados, as pessoas e os negócios dela.</p>
          <button type="button" className="btn mt-3" onClick={back}>
            Ir para a lista de empresas
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
            <Building2 className="ic cab-pagina__icone" aria-hidden="true" />
            <div>{notFound ? <h1>Empresa não encontrada</h1> : <h1>Empresa</h1>}</div>
          </div>
        </header>
        {notFound ? (
          <div className="cartao vazio" role="status">
            <strong>Esta empresa não existe ou você não tem acesso a ela.</strong>
            <p>Ela pode ter sido removida ou não ter contatos nem negócios sob a sua responsabilidade.</p>
            <button type="button" className="btn mt-3" onClick={back}>
              Ir para a lista de empresas
            </button>
          </div>
        ) : (
          <div className="cartao vazio" role="alert">
            <strong>Não foi possível carregar a empresa.</strong>
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
            <Building2 className="ic cab-pagina__icone" aria-hidden="true" />
            <div>
              <h1>Empresa</h1>
              <p>Carregando…</p>
            </div>
          </div>
        </header>
        <div className="grade grade-2 crm-grade" role="status">
          <span className="sr-only">Carregando a empresa…</span>
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    )
  }

  const { company, people, deals } = detail.data
  const active = company.status === 'active'
  const orgMembers = members.data?.members ?? []
  const names: MemberName[] = [...(detail.data.members ?? []), ...orgMembers.map((m) => ({ id: m.id, name: memberLabel(m) }))]
  const owner = ownerName(company.ownerMemberId, names, me)
  const cnpj = formatCnpj(company.taxId)

  async function archive() {
    if (archiving) return
    setArchiving(true)
    try {
      await crmSend<{ company: CrmCompany }>(`/api/crm/companies/${encodeURIComponent(company.id)}`, { method: 'DELETE', json: { version: company.version } })
      toast.success('Empresa arquivada.')
      setArchiveOpen(false)
      openCrm('company', null)
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
      <header className="cab-pagina" data-tour="crm-company-detail">
        <div className="cab-pagina__titulo">
          <Building2 className="ic cab-pagina__icone" aria-hidden="true" />
          <div>
            <h1>{company.name}</h1>
            <p>
              {[cnpj ? `CNPJ ${cnpj}` : null, company.segment].filter(Boolean).join(' · ') || 'Cliente pessoa jurídica'} ·{' '}
              {plural(people.length, 'pessoa', 'pessoas')}
            </p>
          </div>
        </div>
        {canManage && active && (
          <div className="cab-pagina__acoes">
            <button type="button" className="btn" onClick={() => setArchiveOpen(true)}>
              <Archive className="ic" aria-hidden="true" />
              Arquivar
            </button>
          </div>
        )}
      </header>

      {detail.error && (
        <div className="aviso aviso--ambar" role="alert">
          <span className="aviso__ic">
            <TriangleAlert className="ic" aria-hidden="true" />
          </span>
          <div>
            <p>Não foi possível atualizar a empresa. Os dados abaixo podem estar desatualizados.</p>
            <button type="button" className="btn btn--sm mt-2" onClick={detail.refetch}>
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!active && (
        <div className="aviso aviso--ambar" role="status">
          <span className="aviso__ic">
            <Archive className="ic" aria-hidden="true" />
          </span>
          <p>Esta empresa está arquivada: ela não aparece na lista e não pode ser editada.</p>
        </div>
      )}

      <div className="grade grade-2 crm-grade">
        <section className="cartao" aria-labelledby="crm-empresa-dados">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-empresa-dados">Dados da empresa</h2>
              {editing && <p>Só muda o que você alterar.</p>}
            </div>
            {canManage && active && !editing && (
              <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
                <Pencil className="ic" aria-hidden="true" />
                Editar empresa
              </button>
            )}
          </div>
          <div className="cartao__corpo">
            {editing ? (
              <CompanyEditForm
                key={company.version}
                company={company}
                ownerLabel={owner}
                canAssign={canAssign}
                me={me}
                members={orgMembers}
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
                  <dt>CNPJ</dt>
                  <dd className="whitespace-nowrap">{cnpj ?? 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Site</dt>
                  <dd>{company.domain ?? 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Segmento</dt>
                  <dd>{company.segment ?? 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{owner}</dd>
                </div>
                <div>
                  <dt>Cadastrada em</dt>
                  <dd>{fmtDataHora(company.createdAt)}</dd>
                </div>
                <div>
                  <dt>Atualizada em</dt>
                  <dd>{fmtDataHora(company.updatedAt)}</dd>
                </div>
                {company.notes && (
                  <div className="crm-dados__todo">
                    <dt>Observações</dt>
                    <dd>
                      <p>{company.notes}</p>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </section>

        <section className="cartao" aria-labelledby="crm-empresa-pessoas">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-empresa-pessoas">Pessoas da empresa</h2>
              <p>{people.length >= 100 ? 'Mostrando as 100 primeiras em ordem alfabética' : plural(people.length, 'pessoa', 'pessoas')}</p>
            </div>
          </div>
          <div className="cartao__corpo">
            {people.length === 0 ? (
              <div className="vazio">
                <ContactRound className="ic mx-auto" aria-hidden="true" />
                <strong>Nenhuma pessoa nesta empresa</strong>
                <p>Para ligar alguém, abra o contato, use “Editar contato” e escolha esta empresa no campo Empresa.</p>
                <button type="button" className="btn mt-3" onClick={() => openCrm('contact', null)}>
                  Abrir contatos
                </button>
              </div>
            ) : (
              <ul className="crm-lista">
                {people.map((p) => (
                  <li key={p.id} className="crm-lista__item">
                    <div className="crm-lista__principal">
                      <button type="button" className="crm-link" onClick={() => openCrm('contact', p.id)}>
                        {p.name}
                      </button>
                      <span className="crm-lista__meta">
                        <span className="crm-fone">{p.phoneLast4 ? `•••• ${p.phoneLast4}` : 'Sem telefone'}</span>
                        <span>{p.email ?? 'Sem e-mail'}</span>
                      </span>
                    </div>
                    <span className="crm-lista__meta">{ownerName(p.ownerMemberId, names, me)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="cartao" aria-labelledby="crm-empresa-negocios">
        <div className="cartao__cab">
          <div>
            <h2 id="crm-empresa-negocios">Negócios</h2>
            <p>{deals.length >= 100 ? 'Mostrando os 100 mais recentes' : plural(deals.length, 'negócio', 'negócios')}</p>
          </div>
        </div>
        <div className="cartao__corpo">
          {deals.length === 0 ? (
            <div className="vazio">
              <Handshake className="ic mx-auto" aria-hidden="true" />
              <strong>Nenhum negócio com esta empresa</strong>
              <p>Os negócios dos contatos desta empresa aparecem aqui quando a empresa é escolhida no negócio.</p>
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

      {canManage && (
        <Dialog open={archiveOpen} onOpenChange={(o) => !archiving && setArchiveOpen(o)}>
          <DialogContent className="ar bg-none sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Arquivar empresa</DialogTitle>
              <DialogDescription>
                {company.name} sai da lista e da busca. As pessoas e os negócios ligados a ela continuam cadastrados, e o CNPJ fica livre para um novo
                cadastro.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button type="button" className="btn" onClick={() => setArchiveOpen(false)} disabled={archiving}>
                Cancelar
              </button>
              <button type="button" className="btn btn--perigo" onClick={archive} disabled={archiving}>
                <Archive className="ic" aria-hidden="true" />
                {archiving ? 'Arquivando…' : 'Arquivar empresa'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
