'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Building2, ChevronLeft, ChevronRight, Plus, Search, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CrmApiError, crmErrorMessage, crmSend, useCrmQuery, type CrmCompany } from '@/lib/crm/client'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'

// Lista de empresas (clientes PJ) do CRM comercial. A busca acha pelo nome ou pelo CNPJ (só os números).

const PER_PAGE = 25
const CNPJ_RE = /^\d{14}$/
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i

type MemberName = { id: string; name: string }
type CompanyRow = CrmCompany & { peopleCount: number; dealCount: number }
type CompanyList = { items: CompanyRow[]; total: number; page: number; limit: number; members?: MemberName[] }
type OrgMember = { id: string; name: string | null; email: string; role: string; team: string | null; status: string }
type MembersResponse = { members: OrgMember[] }
type Me = ReturnType<typeof useAppStore.getState>['me']

const numero = new Intl.NumberFormat('pt-BR')

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

/** 14 dígitos → 00.000.000/0000-00 (outro formato fica como veio). */
function formatCnpj(taxId: string | null): string | null {
  if (!taxId) return null
  const d = taxId.replace(/\D/g, '')
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : taxId
}

/** "https://www.exemplo.com.br/contato" → "www.exemplo.com.br" (o servidor guarda só o domínio). */
function cleanDomain(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
}

function Carregando({ label }: { label: string }) {
  return (
    <div className="crm-skel" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  )
}

function Paginacao({ page, total, limit, label, onPage }: { page: number; total: number; limit: number; label: string; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  return (
    <nav className="paginacao" aria-label={label}>
      <span className="suave">
        Mostrando {numero.format(from)}–{numero.format(to)} de {numero.format(total)}
      </span>
      {pages > 1 && (
        <div className="linha-flex">
          <button type="button" className="pag" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="ic" aria-hidden="true" />
          </button>
          <span aria-live="polite">
            Página {numero.format(page)} de {numero.format(pages)}
          </span>
          <button type="button" className="pag" aria-label="Próxima página" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight className="ic" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  )
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null
  return (
    <p id={id} className="crm-erro-campo">
      {message}
    </p>
  )
}

// ── Nova empresa ─────────────────────────────────────────────────────────────

interface CreateCompanyProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canAssign: boolean
  me: Me
  members: OrgMember[]
  onCreated: () => void
  onSearchTaxId: (digits: string) => void
}

function CreateCompanyDialog({ open, onOpenChange, canAssign, me, members, onCreated, onSearchTaxId }: CreateCompanyProps) {
  const openCrm = useAppStore((s) => s.openCrm)
  const owners = membersInReach(members, me).filter((m) => m.status === 'active')
  const [name, setName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [domain, setDomain] = useState('')
  const [segment, setSegment] = useState('')
  const [ownerId, setOwnerId] = useState(canAssign && me?.id ? me.id : '')
  const [notes, setNotes] = useState('')
  const [tried, setTried] = useState(false)
  const [sending, setSending] = useState(false)
  const [dup, setDup] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

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
    setSending(true)
    setDup(null)
    setServerError(null)
    const json: Record<string, unknown> = { name: name.trim() }
    if (taxDigits) json.taxId = taxDigits
    if (domainClean) json.domain = domainClean
    if (segment.trim()) json.segment = segment.trim()
    if (canAssign) json.ownerMemberId = ownerId || null
    if (notes.trim()) json.notes = notes.trim()
    try {
      const res = await crmSend<{ company: CrmCompany }>('/api/crm/companies', { json, idempotent: true })
      toast.success('Empresa criada.', { action: { label: 'Abrir', onClick: () => openCrm('company', res.company.id) } })
      onCreated()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof CrmApiError && err.code === 'crm_duplicate') setDup(err.message)
      else setServerError(crmErrorMessage(err))
      toast.error(crmErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="ar bg-none sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova empresa</DialogTitle>
          <DialogDescription>Cadastre o cliente pessoa jurídica. Só o nome é obrigatório; o CNPJ evita cadastro repetido.</DialogDescription>
        </DialogHeader>
        <form id="crm-nova-empresa" className="crm-form" onSubmit={submit} noValidate>
          <div className="campo">
            <label htmlFor="crm-nova-empresa-nome">Nome</label>
            <input
              id="crm-nova-empresa-nome"
              className="entrada"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Exemplo Comércio Ltda."
              maxLength={120}
              autoComplete="off"
              required
              aria-invalid={!!show('name') || undefined}
              aria-describedby={show('name') ? 'crm-nova-empresa-nome-erro' : undefined}
            />
            <FieldError id="crm-nova-empresa-nome-erro" message={show('name')} />
          </div>
          <div className="campo">
            <label htmlFor="crm-nova-empresa-cnpj">CNPJ</label>
            <input
              id="crm-nova-empresa-cnpj"
              className="entrada"
              inputMode="numeric"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              autoComplete="off"
              aria-invalid={!!show('taxId') || undefined}
              aria-describedby={show('taxId') ? 'crm-nova-empresa-cnpj-erro' : 'crm-nova-empresa-cnpj-ajuda'}
            />
            <p id="crm-nova-empresa-cnpj-ajuda" className="ajuda-campo">
              Opcional. Com ou sem pontos e barra.
            </p>
            <FieldError id="crm-nova-empresa-cnpj-erro" message={show('taxId')} />
          </div>
          <div className="campo">
            <label htmlFor="crm-nova-empresa-site">Site</label>
            <input
              id="crm-nova-empresa-site"
              className="entrada"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="exemplo.com.br"
              maxLength={300}
              autoComplete="off"
              aria-invalid={!!show('domain') || undefined}
              aria-describedby={show('domain') ? 'crm-nova-empresa-site-erro' : undefined}
            />
            <FieldError id="crm-nova-empresa-site-erro" message={show('domain')} />
          </div>
          <div className="campo">
            <label htmlFor="crm-nova-empresa-segmento">Segmento</label>
            <input
              id="crm-nova-empresa-segmento"
              className="entrada"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="Varejo"
              maxLength={80}
              autoComplete="off"
            />
          </div>
          {canAssign ? (
            <div className="campo">
              <label htmlFor="crm-nova-empresa-responsavel">Responsável</label>
              <select id="crm-nova-empresa-responsavel" className="selecao" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Sem responsável</option>
                {/* a lista de membros pode não ter chegado (ou não trazer você): sem esta opção a seleção
                    mostraria "Sem responsável" enquanto o envio atribui a você */}
                {me?.id && !owners.some((m) => m.id === me.id) && (
                  <option value={me.id}>{me.name ? `${me.name} (você)` : 'Você'}</option>
                )}
                {owners.map((m) => (
                  <option key={m.id} value={m.id}>
                    {memberLabel(m)}
                    {m.id === me?.id ? ' (você)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="ajuda-campo">Você fica como responsável por esta empresa.</p>
          )}
          <div className="campo">
            <label htmlFor="crm-nova-empresa-obs">Observações</label>
            <textarea id="crm-nova-empresa-obs" className="area" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} />
          </div>
          {dup && (
            <div className="aviso aviso--ambar" role="alert">
              <span className="aviso__ic">
                <TriangleAlert className="ic" aria-hidden="true" />
              </span>
              <div>
                <p>{dup}</p>
                {/* o 409 genérico de corrida (sem CNPJ digitado) não tem o que buscar */}
                {taxDigits && (
                  <button
                    type="button"
                    className="btn btn--sm mt-2"
                    onClick={() => {
                      onOpenChange(false)
                      onSearchTaxId(taxDigits)
                    }}
                  >
                    <Search className="ic" aria-hidden="true" />
                    Buscar este CNPJ na lista
                  </button>
                )}
              </div>
            </div>
          )}
          {serverError && (
            <p className="crm-erro-campo" role="alert">
              {serverError}
            </p>
          )}
        </form>
        <DialogFooter>
          <button type="button" className="btn" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </button>
          <button type="submit" form="crm-nova-empresa" className="btn btn--primario" disabled={sending}>
            {sending ? 'Salvando…' : 'Criar empresa'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tela ─────────────────────────────────────────────────────────────────────

export default function CrmCompaniesView() {
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const role = me?.role ?? null
  const canManage = can(role, 'crm.contacts.manage')
  const canSeeMembers = can(role, 'members.view')
  const canAssign = canManage && canSeeMembers

  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim())
  const [pageState, setPageState] = useState({ key: dq, page: 1 })
  const page = pageState.key === dq ? pageState.page : 1
  const setPage = (p: number) => setPageState({ key: dq, page: Math.max(1, p) })

  const params = new URLSearchParams()
  if (dq) params.set('q', dq)
  params.set('page', String(page))
  params.set('limit', String(PER_PAGE))
  const list = useCrmQuery<CompanyList>(`/api/crm/companies?${params.toString()}`)
  const members = useCrmQuery<MembersResponse>(canSeeMembers ? '/api/members' : null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createKey, setCreateKey] = useState(0)
  const openCreate = () => {
    setCreateKey((k) => k + 1)
    setCreateOpen(true)
  }

  const orgMembers = members.data?.members ?? []
  const names: MemberName[] = [...(list.data?.members ?? []), ...orgMembers.map((m) => ({ id: m.id, name: memberLabel(m) }))]
  const data = list.data

  return (
    <>
      <header className="cab-pagina">
        <div className="cab-pagina__titulo">
          <Building2 className="ic cab-pagina__icone" aria-hidden="true" />
          <div>
            <h1>Empresas</h1>
            <p>Clientes pessoa jurídica. Ligue os contatos à empresa para ver as pessoas e os negócios dela num lugar só.</p>
          </div>
        </div>
        {canManage && (
          <div className="cab-pagina__acoes">
            <button type="button" className="btn btn--primario" onClick={openCreate} data-tour="crm-companies-new">
              <Plus className="ic" aria-hidden="true" />
              Nova empresa
            </button>
          </div>
        )}
      </header>

      {list.error && !data ? (
        <div className="cartao vazio" role="alert">
          <strong>Não foi possível carregar as empresas.</strong>
          <p>{crmErrorMessage(list.error, 'Confira a sua conexão e tente novamente.')}</p>
          <div className="linha-flex justify-center mt-3">
            <button type="button" className="btn" onClick={list.refetch}>
              Tentar novamente
            </button>
            {dq && (
              <button type="button" className="btn btn--link" onClick={() => setQ('')}>
                Limpar busca
              </button>
            )}
          </div>
        </div>
      ) : (
        <section className="cartao" aria-labelledby="crm-empresas-titulo" data-tour="crm-companies-table">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-empresas-titulo">Lista de empresas</h2>
              <p aria-live="polite">{data ? plural(data.total, 'empresa', 'empresas') : 'Carregando…'}</p>
            </div>
          </div>

          <div className="crm-filtros" role="search" aria-label="Buscar empresas">
            <div className="campo crm-filtros__busca">
              <label htmlFor="crm-empresas-busca">Buscar</label>
              <div className="entrada-ic busca-local">
                <Search className="ic" aria-hidden="true" />
                <input
                  id="crm-empresas-busca"
                  className="entrada"
                  type="search"
                  placeholder="Nome ou CNPJ"
                  maxLength={120}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          {list.error && data && (
            <div className="aviso aviso--ambar m-4" role="alert">
              <span className="aviso__ic">
                <TriangleAlert className="ic" aria-hidden="true" />
              </span>
              <div>
                <p>Não foi possível atualizar a lista. Os dados abaixo podem estar desatualizados.</p>
                <button type="button" className="btn btn--sm mt-2" onClick={list.refetch}>
                  Tentar novamente
                </button>
              </div>
            </div>
          )}

          {!data ? (
            <Carregando label="Carregando empresas…" />
          ) : data.total === 0 && dq ? (
            <div className="vazio">
              <Search className="ic mx-auto" aria-hidden="true" />
              <strong>Nenhuma empresa encontrada</strong>
              <p>Confira o nome ou o CNPJ digitado, ou limpe a busca para ver todas as empresas.</p>
              <button type="button" className="btn mt-3" onClick={() => setQ('')}>
                Limpar busca
              </button>
            </div>
          ) : data.total === 0 ? (
            <div className="vazio" data-tour="crm-companies-empty">
              <Building2 className="ic mx-auto" aria-hidden="true" />
              <strong>Nenhuma empresa ainda</strong>
              <p>Cadastre os clientes pessoa jurídica para agrupar os contatos e os negócios de cada um. A importação de contatos também cria empresas.</p>
              {canManage && (
                <button type="button" className="btn btn--primario mt-3" onClick={openCreate}>
                  <Plus className="ic" aria-hidden="true" />
                  Cadastrar a primeira empresa
                </button>
              )}
            </div>
          ) : data.items.length === 0 ? (
            <div className="vazio">
              <strong>Esta página ficou vazia</strong>
              <p>As empresas mudaram desde a última leitura.</p>
              <button type="button" className="btn mt-3" onClick={() => setPage(1)}>
                Ir para a primeira página
              </button>
            </div>
          ) : (
            <>
              <div className="tabela-wrap crm-tabela-rola" role="region" tabIndex={0} aria-label="Empresas">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Nome</th>
                      <th scope="col">CNPJ</th>
                      <th scope="col">Site</th>
                      <th scope="col">Segmento</th>
                      <th scope="col">Contatos</th>
                      <th scope="col">Negócios</th>
                      <th scope="col">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <button type="button" className="crm-link" onClick={() => openCrm('company', c.id)}>
                            {c.name}
                          </button>
                        </td>
                        <td className="whitespace-nowrap">{formatCnpj(c.taxId) ?? <span className="suave">Não informado</span>}</td>
                        <td>{c.domain ?? <span className="suave">Não informado</span>}</td>
                        <td>{c.segment ?? <span className="suave">Não informado</span>}</td>
                        <td>{numero.format(c.peopleCount)}</td>
                        <td>{numero.format(c.dealCount)}</td>
                        <td>{ownerName(c.ownerMemberId, names, me)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao page={data.page} total={data.total} limit={data.limit} label="Páginas de empresas" onPage={setPage} />
            </>
          )}
        </section>
      )}

      {canManage && (
        <CreateCompanyDialog
          key={`nova-${createKey}`}
          open={createOpen}
          onOpenChange={setCreateOpen}
          canAssign={canAssign}
          me={me}
          members={orgMembers}
          onCreated={list.refetch}
          onSearchTaxId={(digits) => setQ(digits)}
        />
      )}
    </>
  )
}
