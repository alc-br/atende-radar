'use client'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight, CircleCheck, ContactRound, Download, ExternalLink, FileSpreadsheet, Info, Plus, Search, TriangleAlert, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CrmApiError, crmDownload, crmErrorMessage, crmSend, useCrmQuery, type CrmCompany, type CrmPerson } from '@/lib/crm/client'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// Lista de contatos do CRM comercial (pessoas com quem a equipe negocia). O contato comercial (CrmPerson) é separado do
// contato do WhatsApp: o vínculo entre os dois aparece no detalhe. A API devolve só os 4 últimos dígitos do telefone.

const PER_PAGE = 25
const MAX_ROWS = 5000
const MAX_JSON_BYTES = 4_800_000 // o servidor aceita até 5 MB de JSON; a folga cobre o resto do corpo
const MAX_FILE_BYTES = 15 * 1024 * 1024
const PREVIEW_CAP = 200
const PHONE_RE = /^[+\d\s().-]*$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type MemberName = { id: string; name: string }
type PersonRow = CrmPerson & { company: { id: string; name: string } | null; dealCount: number }
type PeopleList = { items: PersonRow[]; total: number; page: number; limit: number; members: MemberName[] }
type CompanyOptions = { items: CrmCompany[]; total: number }
type OrgMember = { id: string; name: string | null; email: string; role: string; team: string | null; status: string }
type MembersResponse = { members: OrgMember[] }
type Me = ReturnType<typeof useAppStore.getState>['me']
type ImportReport = {
  total: number
  valid: number
  created: number
  companiesToCreate: number
  duplicates: { row: number; field: 'telefone' | 'e-mail'; where: 'planilha' | 'empresa' }[]
  errors: { row: number; message: string }[]
  batchId: string | null
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

/** Membros que entram nos filtros e na atribuição: supervisor com equipe só vê (e só atribui a) a própria equipe. */
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

// ── Planilha (CSV) ───────────────────────────────────────────────────────────

type ImportKey = 'name' | 'email' | 'phone' | 'company' | 'notes' | 'tags'

const KEY_LABEL: Record<ImportKey, string> = {
  name: 'Nome',
  email: 'E-mail',
  phone: 'Telefone',
  company: 'Empresa',
  notes: 'Observações',
  tags: 'Etiquetas',
}

// cabeçalho normalizado (minúsculas, sem acento, só letras e números) → campo da API
const HEADER_ALIASES: Record<string, ImportKey> = {
  nome: 'name',
  name: 'name',
  nomecompleto: 'name',
  contato: 'name',
  cliente: 'name',
  pessoa: 'name',
  email: 'email',
  emailcontato: 'email',
  correioeletronico: 'email',
  telefone: 'phone',
  telefonecelular: 'phone',
  celular: 'phone',
  whatsapp: 'phone',
  fone: 'phone',
  tel: 'phone',
  phone: 'phone',
  empresa: 'company',
  nomedaempresa: 'company',
  company: 'company',
  organizacao: 'company',
  razaosocial: 'company',
  observacoes: 'notes',
  observacao: 'notes',
  obs: 'notes',
  notas: 'notes',
  anotacoes: 'notes',
  notes: 'notes',
  etiquetas: 'tags',
  etiqueta: 'tags',
  tags: 'tags',
  tag: 'tags',
  marcadores: 'tags',
}

function normHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Separador pelo cabeçalho: o que aparecer mais fora de aspas (vírgula ou ponto e vírgula). */
function detectDelimiter(text: string): ',' | ';' {
  let inQuotes = false
  let commas = 0
  let semis = 0
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes) {
      if (ch === '\n' || ch === '\r') break
      if (ch === ',') commas++
      else if (ch === ';') semis++
    }
  }
  return semis > commas ? ';' : ','
}

/** CSV com aspas ("" dentro de aspas é uma aspa), quebra de linha dentro de aspas, CRLF e BOM. */
function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const delim = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const endRow = () => {
    row.push(field)
    rows.push(row)
    row = []
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === delim) {
      row.push(field)
      field = ''
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else if (ch === '\n') endRow()
    else field += ch
  }
  if (field !== '' || row.length > 0) endRow()
  return rows
}

interface ParsedSheet {
  fileName: string
  columns: { header: string; key: ImportKey | null }[]
  rows: Record<string, string>[]
  /** linha da planilha de cada item de `rows` (a 1 é o cabeçalho; linhas vazias são puladas) */
  sheetRows: number[]
  hasName: boolean
}

function buildSheet(fileName: string, text: string): ParsedSheet {
  const table = parseCsv(text)
  const used = new Set<ImportKey>()
  const columns = (table[0] ?? []).map((raw) => {
    const header = raw.trim()
    const key = HEADER_ALIASES[normHeader(header)] ?? null
    if (!key || used.has(key)) return { header, key: null }
    used.add(key)
    return { header, key }
  })
  const rows: Record<string, string>[] = []
  const sheetRows: number[] = []
  for (let r = 1; r < table.length; r++) {
    const cells = table[r]
    if (cells.every((c) => !c.trim())) continue
    const item: Record<string, string> = { name: '' }
    columns.forEach((c, i) => {
      if (!c.key) return
      const v = (cells[i] ?? '').trim()
      if (c.key === 'name') item.name = v
      else if (v) item[c.key] = v
    })
    rows.push(item)
    sheetRows.push(r + 1)
  }
  return { fileName, columns, rows, sheetRows, hasName: used.has('name') }
}

function readFileText(file: File, encoding: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo'))
    reader.readAsText(file, encoding)
  })
}

/** UTF-8 primeiro; se vier caractere inválido, é o CSV do Excel em Windows-1252. */
async function readCsvText(file: File): Promise<string> {
  const text = await readFileText(file, 'utf-8')
  return text.includes('�') ? readFileText(file, 'windows-1252') : text
}

// ── Peças da tela ────────────────────────────────────────────────────────────

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

// ── Novo contato ─────────────────────────────────────────────────────────────

interface CreateContactProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canAssign: boolean
  me: Me
  companies: CrmCompany[]
  companiesTotal: number
  members: OrgMember[]
  onCreated: () => void
}

function CreateContactDialog({ open, onOpenChange, canAssign, me, companies, companiesTotal, members, onCreated }: CreateContactProps) {
  const openCrm = useAppStore((s) => s.openCrm)
  const owners = membersInReach(members, me).filter((m) => m.status === 'active')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [ownerId, setOwnerId] = useState(canAssign && me?.id ? me.id : '')
  const [notes, setNotes] = useState('')
  const [tried, setTried] = useState(false)
  const [sending, setSending] = useState(false)
  const [dup, setDup] = useState<{ message: string; existingId: string | null } | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const errors = {
    name: !name.trim() ? 'Informe o nome.' : name.trim().length > 120 ? 'Use até 120 caracteres.' : null,
    phone: phone.trim() && (!PHONE_RE.test(phone.trim()) || phone.trim().length > 32) ? 'Telefone inválido.' : null,
    email: email.trim() && !EMAIL_RE.test(email.trim()) ? 'E-mail inválido.' : null,
  }
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null)
  const existingId = dup?.existingId ?? null

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setTried(true)
    if (sending || errors.name || errors.phone || errors.email) return
    setSending(true)
    setDup(null)
    setServerError(null)
    const json: Record<string, unknown> = { name: name.trim() }
    if (phone.trim()) json.phone = phone.trim()
    if (email.trim()) json.email = email.trim()
    if (companyId) json.companyId = companyId
    if (canAssign) json.ownerMemberId = ownerId || null
    if (notes.trim()) json.notes = notes.trim()
    try {
      const res = await crmSend<{ person: CrmPerson }>('/api/crm/contacts', { json, idempotent: true })
      toast.success('Contato criado.', { action: { label: 'Abrir', onClick: () => openCrm('contact', res.person.id) } })
      onCreated()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof CrmApiError && err.code === 'crm_duplicate') {
        setDup({ message: err.message, existingId: typeof err.extra.existingId === 'string' ? err.extra.existingId : null })
      } else {
        setServerError(crmErrorMessage(err))
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
          <DialogTitle>Novo contato</DialogTitle>
          <DialogDescription>Cadastre a pessoa com quem a equipe negocia. Só o nome é obrigatório.</DialogDescription>
        </DialogHeader>
        <form id="crm-novo-contato" className="crm-form" onSubmit={submit} noValidate>
          <div className="campo">
            <label htmlFor="crm-novo-contato-nome">Nome</label>
            <input
              id="crm-novo-contato-nome"
              className="entrada"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maria Silva"
              maxLength={120}
              autoComplete="off"
              required
              aria-invalid={!!show('name') || undefined}
              aria-describedby={show('name') ? 'crm-novo-contato-nome-erro' : undefined}
            />
            <FieldError id="crm-novo-contato-nome-erro" message={show('name')} />
          </div>
          <div className="campo">
            <label htmlFor="crm-novo-contato-telefone">Telefone</label>
            <input
              id="crm-novo-contato-telefone"
              className="entrada"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 91234-5678"
              maxLength={32}
              autoComplete="off"
              aria-invalid={!!show('phone') || undefined}
              aria-describedby={show('phone') ? 'crm-novo-contato-telefone-erro' : 'crm-novo-contato-telefone-ajuda'}
            />
            <p id="crm-novo-contato-telefone-ajuda" className="ajuda-campo">
              Com DDD. Depois de salvo, a tela mostra só os 4 últimos dígitos.
            </p>
            <FieldError id="crm-novo-contato-telefone-erro" message={show('phone')} />
          </div>
          <div className="campo">
            <label htmlFor="crm-novo-contato-email">E-mail</label>
            <input
              id="crm-novo-contato-email"
              className="entrada"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria.silva@exemplo.com.br"
              maxLength={254}
              autoComplete="off"
              aria-invalid={!!show('email') || undefined}
              aria-describedby={show('email') ? 'crm-novo-contato-email-erro' : undefined}
            />
            <FieldError id="crm-novo-contato-email-erro" message={show('email')} />
          </div>
          <div className="campo">
            <label htmlFor="crm-novo-contato-empresa">Empresa</label>
            <select id="crm-novo-contato-empresa" className="selecao" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Sem empresa</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {companiesTotal > companies.length && (
              <p className="ajuda-campo">Mostrando as {numero.format(companies.length)} primeiras empresas em ordem alfabética.</p>
            )}
          </div>
          {canAssign ? (
            <div className="campo">
              <label htmlFor="crm-novo-contato-responsavel">Responsável</label>
              <select id="crm-novo-contato-responsavel" className="selecao" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
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
            <p className="ajuda-campo">Você fica como responsável por este contato.</p>
          )}
          <div className="campo">
            <label htmlFor="crm-novo-contato-obs">Observações</label>
            <textarea id="crm-novo-contato-obs" className="area" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} />
          </div>
          {dup && (
            <div className="aviso aviso--ambar" role="alert">
              <span className="aviso__ic">
                <TriangleAlert className="ic" aria-hidden="true" />
              </span>
              <div>
                <p>{dup.message}</p>
                {existingId && (
                  <button
                    type="button"
                    className="btn btn--sm mt-2"
                    onClick={() => {
                      onOpenChange(false)
                      openCrm('contact', existingId)
                    }}
                  >
                    <ExternalLink className="ic" aria-hidden="true" />
                    Abrir contato existente
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
          <button type="submit" form="crm-novo-contato" className="btn btn--primario" disabled={sending}>
            {sending ? 'Salvando…' : 'Criar contato'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Importar planilha ────────────────────────────────────────────────────────

function ReportTables({ report, sheetRow }: { report: ImportReport; sheetRow: (row: number) => number }) {
  return (
    <>
      {report.duplicates.length > 0 && (
        <section aria-labelledby="crm-importar-repetidas" className="crm-form">
          <h3 id="crm-importar-repetidas" className="font-semibold">
            Repetidas (serão puladas)
          </h3>
          <div className="tabela-wrap crm-rolagem" role="region" tabIndex={0} aria-label="Linhas repetidas">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Linha</th>
                  <th scope="col">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {report.duplicates.slice(0, PREVIEW_CAP).map((d) => (
                  <tr key={`${d.row}-${d.field}-${d.where}`}>
                    <td>{sheetRow(d.row)}</td>
                    <td>
                      {d.where === 'empresa'
                        ? `Já existe um contato com este ${d.field}`
                        : `${d.field === 'telefone' ? 'Telefone' : 'E-mail'} repetido em outra linha da planilha`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.duplicates.length > PREVIEW_CAP && (
            <p className="ajuda-campo">
              Mostrando as {PREVIEW_CAP} primeiras de {numero.format(report.duplicates.length)}.
            </p>
          )}
        </section>
      )}
      {report.errors.length > 0 && (
        <section aria-labelledby="crm-importar-erros" className="crm-form">
          <h3 id="crm-importar-erros" className="font-semibold">
            Com erro (não entram)
          </h3>
          <div className="tabela-wrap crm-rolagem" role="region" tabIndex={0} aria-label="Linhas com erro">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Linha</th>
                  <th scope="col">O que corrigir</th>
                </tr>
              </thead>
              <tbody>
                {report.errors.slice(0, PREVIEW_CAP).map((e) => (
                  <tr key={e.row}>
                    <td>{sheetRow(e.row)}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.errors.length > PREVIEW_CAP && (
            <p className="ajuda-campo">
              Mostrando as {PREVIEW_CAP} primeiras de {numero.format(report.errors.length)}.
            </p>
          )}
        </section>
      )}
    </>
  )
}

function ImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const [step, setStep] = useState<'arquivo' | 'conferir' | 'resultado'>('arquivo')
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [reading, setReading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportReport | null>(null)
  const [result, setResult] = useState<ImportReport | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const busy = reading || sending
  const tooMany = !!sheet && sheet.rows.length > MAX_ROWS
  const sheetRow = (row: number) => sheet?.sheetRows[row - 2] ?? row

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setSheet(null)
    setPreview(null)
    setFileError(null)
    setSendError(null)
    if (!file) return
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setFileError('Escolha um arquivo .csv. No Excel, use "Salvar como" e o tipo CSV; no Google Planilhas, "Fazer download" em CSV.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('Arquivo grande demais. Divida a planilha em partes de até 5.000 linhas.')
      return
    }
    setReading(true)
    try {
      const parsed = buildSheet(file.name, await readCsvText(file))
      if (!parsed.columns.length || !parsed.rows.length) setFileError('O arquivo está vazio ou só tem o cabeçalho.')
      else setSheet(parsed)
    } catch {
      setFileError('Não foi possível ler o arquivo. Confira se ele é um CSV e tente novamente.')
    } finally {
      setReading(false)
    }
  }

  async function send(dryRun: boolean) {
    if (!sheet || sending || !sheet.hasName || sheet.rows.length > MAX_ROWS) return
    const body = { dryRun, rows: sheet.rows }
    if (new TextEncoder().encode(JSON.stringify(body)).length > MAX_JSON_BYTES) {
      setSendError('A planilha passa do tamanho máximo de envio (cerca de 5 MB). Divida o arquivo em partes menores.')
      return
    }
    setSending(true)
    setSendError(null)
    try {
      const report = await crmSend<ImportReport>('/api/crm/imports', { json: body, idempotent: !dryRun })
      if (dryRun) {
        setPreview(report)
        setStep('conferir')
      } else {
        setResult(report)
        setStep('resultado')
        toast.success(report.created === 1 ? '1 contato importado.' : `${numero.format(report.created)} contatos importados.`)
        onImported()
      }
    } catch (err) {
      const msg =
        err instanceof CrmApiError && err.code === 'crm_rate_limited'
          ? 'Você chegou ao limite de importações por minuto. Aguarde um minuto e tente novamente.'
          : crmErrorMessage(err)
      setSendError(msg)
      toast.error(msg)
    } finally {
      setSending(false)
    }
  }

  const importLabel = preview ? (preview.valid === 1 ? 'Importar 1 contato' : `Importar ${numero.format(preview.valid)} contatos`) : 'Importar'

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="ar bg-none sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha</DialogTitle>
          <DialogDescription>
            Traga contatos de um arquivo CSV. Primeiro você confere o que vai entrar; nada é gravado antes de você confirmar.
          </DialogDescription>
        </DialogHeader>

        <ol className="crm-passos" aria-label="Passos da importação">
          <li aria-current={step === 'arquivo' ? 'step' : undefined}>Escolher o arquivo</li>
          <li aria-current={step === 'conferir' ? 'step' : undefined}>Conferir</li>
          <li aria-current={step === 'resultado' ? 'step' : undefined}>Importar</li>
        </ol>

        {step === 'arquivo' && (
          <div className="crm-form">
            <div className="campo">
              <label htmlFor="crm-importar-arquivo">Planilha em CSV</label>
              <input
                id="crm-importar-arquivo"
                type="file"
                accept=".csv,text/csv"
                className="entrada h-auto py-2"
                onChange={onFile}
                disabled={busy}
                aria-describedby="crm-importar-ajuda"
              />
              <p id="crm-importar-ajuda" className="ajuda-campo">
                A primeira linha precisa ter os nomes das colunas. Separação por vírgula ou ponto e vírgula, até 5.000 linhas.
              </p>
            </div>
            <div className="aviso crm-nota">
              <Info className="ic" aria-hidden="true" />
              <p>
                Colunas que reconhecemos: <strong>Nome</strong> (obrigatória), Telefone, E-mail, Empresa, Observações e Etiquetas. Empresas que
                ainda não existem são criadas. Contato com telefone ou e-mail repetido é pulado, nunca sobrescrito.
              </p>
            </div>
            {reading && <p role="status">Lendo o arquivo…</p>}
            {fileError && (
              <p className="crm-erro-campo" role="alert">
                {fileError}
              </p>
            )}
            {sheet && (
              <>
                <p>
                  <FileSpreadsheet className="ic" aria-hidden="true" /> <strong>{sheet.fileName}</strong>:{' '}
                  {plural(sheet.rows.length, 'linha com dados', 'linhas com dados')}.
                </p>
                <div className="campo">
                  <span className="rotulo" id="crm-importar-colunas">
                    Colunas do arquivo
                  </span>
                  <ul className="crm-colunas" aria-labelledby="crm-importar-colunas">
                    {sheet.columns.map((c, i) => (
                      <li key={i} className={cn('tag', c.key ? 'tag--verde' : 'tag--cinza')}>
                        {c.key ? <Check className="ic" aria-hidden="true" /> : null}
                        {c.header || '(sem nome)'}: {c.key ? KEY_LABEL[c.key] : 'ignorada'}
                      </li>
                    ))}
                  </ul>
                </div>
                {!sheet.hasName && (
                  <div className="aviso aviso--ambar" role="alert">
                    <span className="aviso__ic">
                      <TriangleAlert className="ic" aria-hidden="true" />
                    </span>
                    <p>Não achamos a coluna de nome. Mude o cabeçalho da coluna com o nome das pessoas para &quot;Nome&quot; e escolha o arquivo novamente.</p>
                  </div>
                )}
                {tooMany && (
                  <div className="aviso aviso--ambar" role="alert">
                    <span className="aviso__ic">
                      <TriangleAlert className="ic" aria-hidden="true" />
                    </span>
                    <p>
                      A planilha tem {plural(sheet.rows.length, 'linha', 'linhas')} com dados. O limite é 5.000 por importação: divida o arquivo e
                      importe em partes.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 'conferir' && preview && (
          <div className="crm-form">
            <div className="kpis">
              <div className="cartao kpi">
                <div className="kpi__rotulo">Linhas lidas</div>
                <div className="kpi__valor">{numero.format(preview.total)}</div>
              </div>
              <div className="cartao kpi">
                <div className="kpi__rotulo">Prontas para importar</div>
                <div className="kpi__valor">{numero.format(preview.valid)}</div>
              </div>
              <div className="cartao kpi">
                <div className="kpi__rotulo">Repetidas</div>
                <div className="kpi__valor">{numero.format(preview.duplicates.length)}</div>
              </div>
              <div className="cartao kpi">
                <div className="kpi__rotulo">Com erro</div>
                <div className="kpi__valor">{numero.format(preview.errors.length)}</div>
              </div>
            </div>
            {preview.companiesToCreate > 0 && (
              <p>{plural(preview.companiesToCreate, 'empresa nova será criada', 'empresas novas serão criadas')} a partir da coluna Empresa.</p>
            )}
            <ReportTables report={preview} sheetRow={sheetRow} />
            {preview.valid === 0 && (
              <p role="status">Nenhuma linha está pronta para importar. Corrija a planilha e escolha o arquivo novamente.</p>
            )}
          </div>
        )}

        {step === 'resultado' && result && (
          <div className="crm-form">
            <div className="aviso crm-nota" role="status">
              <CircleCheck className="ic" aria-hidden="true" />
              <div>
                <p>
                  <strong>Importação concluída.</strong>
                </p>
                <p>
                  {plural(result.created, 'contato criado', 'contatos criados')}
                  {result.duplicates.length > 0 && `, ${plural(result.duplicates.length, 'pulado por repetição', 'pulados por repetição')}`}
                  {result.errors.length > 0 && `, ${plural(result.errors.length, 'linha com erro ficou de fora', 'linhas com erro ficaram de fora')}`}.
                </p>
              </div>
            </div>
            <ReportTables report={result} sheetRow={sheetRow} />
          </div>
        )}

        {sendError && (
          <p className="crm-erro-campo" role="alert">
            {sendError}
          </p>
        )}

        <DialogFooter>
          {step === 'arquivo' && (
            <>
              <button type="button" className="btn" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn btn--primario" onClick={() => send(true)} disabled={busy || !sheet || !sheet.hasName || tooMany}>
                {sending ? 'Conferindo…' : 'Conferir'}
              </button>
            </>
          )}
          {step === 'conferir' && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setStep('arquivo')
                  setSendError(null)
                }}
                disabled={busy}
              >
                Voltar
              </button>
              <button type="button" className="btn btn--primario" onClick={() => send(false)} disabled={busy || !preview || preview.valid === 0}>
                {sending ? 'Importando…' : importLabel}
              </button>
            </>
          )}
          {step === 'resultado' && (
            <button type="button" className="btn btn--primario" onClick={() => onOpenChange(false)}>
              Fechar
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Exportar ─────────────────────────────────────────────────────────────────

interface ExportProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exportsOn: boolean
  canOpenSettings: boolean
  onOpenSettings: () => void
}

function ExportDialog({ open, onOpenChange, exportsOn, canOpenSettings, onOpenSettings }: ExportProps) {
  const [entity, setEntity] = useState<'people' | 'deals'>('people')
  const [fullPhone, setFullPhone] = useState(false)
  const [confirmRisk, setConfirmRisk] = useState(false)
  const [sending, setSending] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const needsConfirm = entity === 'people' && fullPhone

  async function download() {
    if (sending || (needsConfirm && !confirmRisk)) return
    setSending(true)
    setTruncated(false)
    try {
      const json: Record<string, unknown> = { entity }
      if (needsConfirm) {
        json.includeFullPhone = true
        json.confirm = true
      }
      const file = await crmDownload('/api/crm/exports', json)
      const href = URL.createObjectURL(file.blob)
      const a = document.createElement('a')
      a.href = href
      a.download = file.filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
      if (file.truncated) {
        setTruncated(true)
        toast.warning('Arquivo baixado só com as primeiras 20.000 linhas, o limite por exportação.')
      } else {
        toast.success('Arquivo baixado.')
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(
        err instanceof CrmApiError && err.code === 'crm_rate_limited'
          ? 'Você chegou ao limite de exportações por minuto. Aguarde um minuto e tente novamente.'
          : crmErrorMessage(err),
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="ar bg-none sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar</DialogTitle>
          <DialogDescription>Baixe os contatos ou os negócios em uma planilha CSV (separada por ponto e vírgula, abre no Excel).</DialogDescription>
        </DialogHeader>

        {!exportsOn ? (
          <>
            <div className="aviso aviso--ambar" role="status">
              <span className="aviso__ic">
                <TriangleAlert className="ic" aria-hidden="true" />
              </span>
              <div>
                <p>
                  <strong>A exportação está desligada nesta empresa.</strong>
                </p>
                <p>Para baixar planilhas, ligue a exportação em Comercial › Ajustes do CRM.</p>
              </div>
            </div>
            <DialogFooter>
              <button type="button" className="btn" onClick={() => onOpenChange(false)}>
                Fechar
              </button>
              {canOpenSettings && (
                <button type="button" className="btn btn--primario" onClick={onOpenSettings}>
                  Abrir ajustes do CRM
                </button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="crm-form">
              <fieldset className="crm-escolha">
                <legend>O que exportar</legend>
                <label htmlFor="crm-exportar-contatos">
                  <input
                    id="crm-exportar-contatos"
                    type="radio"
                    name="crm-exportar-entidade"
                    value="people"
                    checked={entity === 'people'}
                    onChange={() => setEntity('people')}
                  />
                  <span>
                    Contatos
                    <small>Nome, empresa, e-mail, telefone (mascarado), responsável e etiquetas.</small>
                  </span>
                </label>
                <label htmlFor="crm-exportar-negocios">
                  <input
                    id="crm-exportar-negocios"
                    type="radio"
                    name="crm-exportar-entidade"
                    value="deals"
                    checked={entity === 'deals'}
                    onChange={() => setEntity('deals')}
                  />
                  <span>
                    Negócios
                    <small>Título, etapa, situação, valores, contato e responsável.</small>
                  </span>
                </label>
              </fieldset>

              {entity === 'people' && (
                <label className="crm-checkbox" htmlFor="crm-exportar-fone">
                  <input
                    id="crm-exportar-fone"
                    type="checkbox"
                    checked={fullPhone}
                    onChange={(e) => {
                      setFullPhone(e.target.checked)
                      if (!e.target.checked) setConfirmRisk(false)
                    }}
                  />
                  <span>Incluir telefone completo</span>
                </label>
              )}

              {needsConfirm && (
                <>
                  <div className="aviso aviso--ambar">
                    <span className="aviso__ic">
                      <TriangleAlert className="ic" aria-hidden="true" />
                    </span>
                    <div>
                      <p>
                        <strong>Telefone completo é dado pessoal.</strong>
                      </p>
                      <p>
                        O arquivo sai do AtendeRadar com o número inteiro de cada contato. Pela LGPD, guarde-o em lugar seguro, compartilhe só com
                        quem precisa e apague quando não for mais usar. A exportação fica registrada no histórico de auditoria com o seu nome.
                      </p>
                    </div>
                  </div>
                  <label className="crm-checkbox" htmlFor="crm-exportar-confirmar">
                    <input id="crm-exportar-confirmar" type="checkbox" checked={confirmRisk} onChange={(e) => setConfirmRisk(e.target.checked)} />
                    <span>Entendo o risco e quero o telefone completo no arquivo</span>
                  </label>
                </>
              )}

              <p className="ajuda-campo">Até 20.000 linhas por arquivo.</p>

              {truncated && (
                <div className="aviso aviso--ambar" role="alert">
                  <span className="aviso__ic">
                    <TriangleAlert className="ic" aria-hidden="true" />
                  </span>
                  <p>O arquivo baixado tem só as primeiras 20.000 linhas, que é o limite por exportação. Os registros além disso ficaram de fora.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <button type="button" className="btn" onClick={() => onOpenChange(false)} disabled={sending}>
                {truncated ? 'Fechar' : 'Cancelar'}
              </button>
              <button type="button" className="btn btn--primario" onClick={download} disabled={sending || (needsConfirm && !confirmRisk)}>
                <Download className="ic" aria-hidden="true" />
                {sending ? 'Preparando…' : 'Baixar CSV'}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Tela ─────────────────────────────────────────────────────────────────────

export default function CrmContactsView() {
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const setView = useAppStore((s) => s.setView)
  const role = me?.role ?? null
  const canManage = can(role, 'crm.contacts.manage')
  const canSeeMembers = can(role, 'members.view')
  const canAssign = canManage && canSeeMembers
  const canImport = can(role, 'crm.import')
  const exportsOn = !!me?.crm?.flags.exports
  const showExport = can(role, 'crm.export') && (exportsOn || role === 'admin')

  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const dq = useDebounced(q.trim())
  const filterKey = `${dq}|${companyId}|${ownerId}`
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPage = (p: number) => setPageState({ key: filterKey, page: Math.max(1, p) })
  const filtering = !!(dq || companyId || ownerId)

  const params = new URLSearchParams()
  if (dq) params.set('q', dq)
  if (companyId) params.set('companyId', companyId)
  if (ownerId) params.set('ownerMemberId', ownerId)
  params.set('page', String(page))
  params.set('limit', String(PER_PAGE))
  const list = useCrmQuery<PeopleList>(`/api/crm/contacts?${params.toString()}`)
  const companies = useCrmQuery<CompanyOptions>('/api/crm/companies?limit=100')
  const members = useCrmQuery<MembersResponse>(canSeeMembers ? '/api/members' : null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createKey, setCreateKey] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  const [importKey, setImportKey] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportKey, setExportKey] = useState(0)

  const openCreate = () => {
    setCreateKey((k) => k + 1)
    setCreateOpen(true)
  }
  const openImport = () => {
    setImportKey((k) => k + 1)
    setImportOpen(true)
  }
  const openExport = () => {
    setExportKey((k) => k + 1)
    setExportOpen(true)
  }
  const clearFilters = () => {
    setQ('')
    setCompanyId('')
    setOwnerId('')
  }

  const companyItems = companies.data?.items ?? []
  const orgMembers = members.data?.members ?? []
  const filterMembers = membersInReach(orgMembers, me)
  const names: MemberName[] = [...(list.data?.members ?? []), ...orgMembers.map((m) => ({ id: m.id, name: memberLabel(m) }))]
  const data = list.data

  return (
    <>
      <header className="cab-pagina">
        <div className="cab-pagina__titulo">
          <ContactRound className="ic cab-pagina__icone" aria-hidden="true" />
          <div>
            <h1>Contatos</h1>
            <p>Pessoas com quem a sua equipe negocia. O contato comercial é separado do contato do WhatsApp: o vínculo entre os dois aparece no detalhe.</p>
          </div>
        </div>
        <div className="cab-pagina__acoes">
          {showExport && (
            <button type="button" className="btn" onClick={openExport} data-tour="crm-contacts-export">
              <Download className="ic" aria-hidden="true" />
              Exportar
            </button>
          )}
          {canImport && (
            <button type="button" className="btn" onClick={openImport} data-tour="crm-contacts-import">
              <Upload className="ic" aria-hidden="true" />
              Importar planilha
            </button>
          )}
          {canManage && (
            <button type="button" className="btn btn--primario" onClick={openCreate} data-tour="crm-contacts-new">
              <Plus className="ic" aria-hidden="true" />
              Novo contato
            </button>
          )}
        </div>
      </header>

      {list.error && !data ? (
        <div className="cartao vazio" role="alert">
          <strong>Não foi possível carregar os contatos.</strong>
          <p>{crmErrorMessage(list.error, 'Confira a sua conexão e tente novamente.')}</p>
          <div className="linha-flex justify-center mt-3">
            <button type="button" className="btn" onClick={list.refetch}>
              Tentar novamente
            </button>
            {filtering && (
              <button type="button" className="btn btn--link" onClick={clearFilters}>
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      ) : (
        <section className="cartao" aria-labelledby="crm-contatos-titulo" data-tour="crm-contacts-table">
          <div className="cartao__cab">
            <div>
              <h2 id="crm-contatos-titulo">Lista de contatos</h2>
              <p aria-live="polite">{data ? plural(data.total, 'contato', 'contatos') : 'Carregando…'}</p>
            </div>
          </div>

          <div className="crm-filtros" role="search" aria-label="Filtrar contatos">
            <div className="campo crm-filtros__busca">
              <label htmlFor="crm-contatos-busca">Buscar</label>
              <div className="entrada-ic busca-local">
                <Search className="ic" aria-hidden="true" />
                <input
                  id="crm-contatos-busca"
                  className="entrada"
                  type="search"
                  placeholder="Nome, e-mail ou final do telefone"
                  maxLength={120}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="crm-contatos-empresa">Empresa</label>
              <select id="crm-contatos-empresa" className="selecao" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">Todas as empresas</option>
                {companyItems.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {canSeeMembers && (
              <div className="campo">
                <label htmlFor="crm-contatos-responsavel">Responsável</label>
                <select id="crm-contatos-responsavel" className="selecao" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  <option value="">Todos os responsáveis</option>
                  {filterMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberLabel(m)}
                      {m.id === me?.id ? ' (você)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
            <Carregando label="Carregando contatos…" />
          ) : data.total === 0 && filtering ? (
            <div className="vazio">
              <Search className="ic mx-auto" aria-hidden="true" />
              <strong>Nenhum contato encontrado</strong>
              <p>Confira a busca ou limpe os filtros para ver todos os contatos.</p>
              <button type="button" className="btn mt-3" onClick={clearFilters}>
                Limpar filtros
              </button>
            </div>
          ) : data.total === 0 ? (
            <div className="vazio" data-tour="crm-contacts-empty">
              <ContactRound className="ic mx-auto" aria-hidden="true" />
              <strong>Nenhum contato ainda</strong>
              <p>
                Cadastre um contato{canImport ? ', importe uma planilha' : ''} ou crie um negócio a partir de uma conversa do WhatsApp: o contato
                aparece aqui.
              </p>
              {(canManage || canImport) && (
                <div className="linha-flex justify-center flex-wrap mt-3">
                  {canManage && (
                    <button type="button" className="btn btn--primario" onClick={openCreate}>
                      <Plus className="ic" aria-hidden="true" />
                      Novo contato
                    </button>
                  )}
                  {canImport && (
                    <button type="button" className="btn" onClick={openImport}>
                      <Upload className="ic" aria-hidden="true" />
                      Importar planilha
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : data.items.length === 0 ? (
            <div className="vazio">
              <strong>Esta página ficou vazia</strong>
              <p>Os contatos mudaram desde a última leitura.</p>
              <button type="button" className="btn mt-3" onClick={() => setPage(1)}>
                Ir para a primeira página
              </button>
            </div>
          ) : (
            <>
              <div className="tabela-wrap crm-tabela-rola" role="region" tabIndex={0} aria-label="Contatos">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Nome</th>
                      <th scope="col">Empresa</th>
                      <th scope="col">Telefone</th>
                      <th scope="col">E-mail</th>
                      <th scope="col">Responsável</th>
                      <th scope="col">Atualizado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button type="button" className="crm-link" onClick={() => openCrm('contact', p.id)}>
                            {p.name}
                          </button>
                        </td>
                        <td>{p.company ? p.company.name : <span className="suave">Sem empresa</span>}</td>
                        <td>{p.phoneLast4 ? <span className="crm-fone">•••• {p.phoneLast4}</span> : <span className="suave">Não informado</span>}</td>
                        <td>{p.email ?? <span className="suave">Não informado</span>}</td>
                        <td>{ownerName(p.ownerMemberId, names, me)}</td>
                        <td className="whitespace-nowrap">{fmtDataHora(p.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao page={data.page} total={data.total} limit={data.limit} label="Páginas de contatos" onPage={setPage} />
            </>
          )}
        </section>
      )}

      {canManage && (
        <CreateContactDialog
          key={`novo-${createKey}`}
          open={createOpen}
          onOpenChange={setCreateOpen}
          canAssign={canAssign}
          me={me}
          companies={companyItems}
          companiesTotal={companies.data?.total ?? companyItems.length}
          members={orgMembers}
          onCreated={list.refetch}
        />
      )}
      {canImport && (
        <ImportDialog
          key={`importar-${importKey}`}
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => {
            list.refetch()
            companies.refetch()
          }}
        />
      )}
      {showExport && (
        <ExportDialog
          key={`exportar-${exportKey}`}
          open={exportOpen}
          onOpenChange={setExportOpen}
          exportsOn={exportsOn}
          canOpenSettings={can(role, 'crm.settings.manage')}
          onOpenSettings={() => {
            setExportOpen(false)
            setView('crm-settings')
          }}
        />
      )}
    </>
  )
}
