'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CircleCheck,
  Clock,
  Download,
  Kanban,
  Lightbulb,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  TriangleAlert,
  Workflow,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CrmApiError, crmErrorMessage, crmSend, useCrmQuery, type CrmPipeline, type CrmStage } from '@/lib/crm/client'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'

// Ajustes do CRM (admin e gestor: crm.settings.manage). Três blocos independentes, cada um com o seu carregando, erro e
// vazio: as opções extras (D2: sugestão antes de automação; D7: tudo começa desligado), o funil de vendas e a saúde da
// sincronização. Nada nesta tela envia mensagem a cliente (D3), e a sincronização nunca mostra dado de cliente.

type Flags = { autoCreateDeals: boolean; suggestStage: boolean; notifications: boolean; exports: boolean }
type FlagKey = keyof Flags
type CrmLink = { provider: string; status: string; lastHealthyAt: string | null; lastErrorCode?: string | null }
type SettingsRes = { crm: { enabled: boolean; flags: Flags }; link: CrmLink | null }
type PipelinesRes = { pipelines: CrmPipeline[] }
type PipelineRes = { pipeline: CrmPipeline }
type Checkpoint = {
  resource: string
  lastRunAt: string | null
  lastSuccessAt: string | null
  lagSeconds: number | null
  lastErrorCode: string | null
  stats: Record<string, unknown> | null
}
type DeadEvent = { id: string; eventType: string; aggregateType: string; attempts: number; lastErrorCode: string | null; createdAt: string }
type StatusRes = {
  status: string
  counts: Record<string, number>
  lagSeconds: number
  link: CrmLink | null
  checkpoints: Checkpoint[]
  dead: DeadEvent[]
  canRetry: boolean
}

const MAX_ETAPAS = 15
const isConflict = (e: unknown) => e instanceof CrmApiError && e.code === 'crm_version_conflict'

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
function quando(iso: string | null | undefined, vazio = 'Nunca'): string {
  if (!iso) return vazio
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? vazio : DATA_HORA.format(d)
}

function duracao(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'Sem medição'
  if (seconds < 60) return 'Menos de 1 minuto'
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} dias`
}

const numero = (n: number) => n.toLocaleString('pt-BR')

// ---------------------------------------------------------------------------------------------------------------------
// Peças comuns

function SecaoCab({ id, icon, title, desc, children }: { id: string; icon: ReactNode; title: string; desc: string; children?: ReactNode }) {
  return (
    <header className="secao-config__cab crm-ajustes__cab">
      <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true">
        {icon}
      </span>
      <div className="crm-ajustes__titulo">
        <h2 id={id}>{title}</h2>
        <p>{desc}</p>
      </div>
      {children && <div className="crm-ajustes__acoes">{children}</div>}
    </header>
  )
}

function Carregando({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  )
}

function ErroLeitura({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="cartao vazio" role="alert">
      <TriangleAlert className="ic" aria-hidden="true" />
      <strong>{message}</strong>
      <button type="button" className="btn mt-3" onClick={onRetry}>
        Tentar novamente
      </button>
    </div>
  )
}

/** Recarregar falhou, mas o dado anterior continua na tela. */
function AvisoRecarga({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="aviso aviso--ambar crm-ajustes__aviso" role="alert">
      <TriangleAlert className="ic" aria-hidden="true" />
      <span>Não foi possível atualizar agora. O que aparece abaixo é da última leitura.</span>
      <button type="button" className="btn btn--sm" onClick={onRetry}>
        Tentar novamente
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Automação

// "Avisos do CRM" (crm.notifications) fica fora da tela: a flag existe no servidor, mas nada ainda gera aviso a partir
// dela, e a opção prometeria o que não acontece (docs/crm/06-ux-e-design.md § 10).
const FLAGS: { key: FlagKey; icon: ReactNode; tone: string; title: string; faz: string; naoFaz: string }[] = [
  {
    key: 'autoCreateDeals',
    icon: <Bot className="ic" />,
    tone: 'tom-azul',
    title: 'Criar negócio sozinho',
    faz: 'Quando o AtendeRadar percebe uma oportunidade de venda numa conversa, o negócio entra direto no funil padrão, com o valor marcado como estimado. Desligada, a oportunidade vira uma sugestão e só entra no funil quando alguém aceita.',
    naoFaz: 'Não muda o negócio de etapa nem marca como ganho: isso continua sendo decisão de uma pessoa da equipe.',
  },
  {
    key: 'suggestStage',
    icon: <Lightbulb className="ic" />,
    tone: 'tom-ambar',
    title: 'Sugerir mudança de etapa',
    faz: 'Quando a conversa avança (por exemplo, o cliente pergunta o preço), aparece a sugestão de levar o negócio para a etapa do funil que combina com esse momento.',
    naoFaz: 'Nunca move o negócio sozinho nem volta etapa: a etapa só muda quando alguém aceita a sugestão.',
  },
  {
    key: 'exports',
    icon: <Download className="ic" />,
    tone: 'tom-verde',
    title: 'Exportar dados do CRM',
    faz: 'Permite que administradores baixem contatos e negócios em planilha (CSV). O telefone sai mascarado, a menos que o administrador peça e confirme o número completo.',
    naoFaz:
      'Não libera a exportação para os outros papéis nem guarda o arquivo no servidor. Toda exportação fica no histórico de auditoria, inclusive quando traz o telefone completo.',
  },
]

function FlagsSection() {
  const q = useCrmQuery<SettingsRes>('/api/crm/settings')
  const setMe = useAppStore((s) => s.setMe)
  const [local, setLocal] = useState<Flags | null>(null)
  const [sending, setSending] = useState<FlagKey | null>(null)
  const flags = local ?? q.data?.crm.flags ?? null

  async function toggle(key: FlagKey, value: boolean) {
    if (!flags || sending) return
    const before = flags
    const title = FLAGS.find((f) => f.key === key)?.title ?? 'Opção'
    setLocal({ ...flags, [key]: value })
    setSending(key)
    try {
      const res = await crmSend<SettingsRes>('/api/crm/settings', { method: 'PATCH', json: { [key]: value } })
      setLocal(res.crm.flags)
      const atual = useAppStore.getState().me
      if (atual) setMe({ ...atual, crm: res.crm })
      toast.success(value ? `Opção ligada: ${title}.` : `Opção desligada: ${title}.`)
    } catch (e) {
      setLocal(before)
      toast.error(crmErrorMessage(e))
    } finally {
      setSending(null)
    }
  }

  return (
    <section className="cartao secao-config" aria-labelledby="crm-ajustes-flags">
      <SecaoCab
        id="crm-ajustes-flags"
        icon={<Workflow className="ic" />}
        title="Automação"
        desc="O que o CRM pode fazer sozinho. Tudo começa desligado: ligue só o que a sua equipe vai usar."
      />
      {q.loading ? (
        <Carregando label="Carregando as opções do CRM…" rows={4} />
      ) : q.error && !q.data ? (
        <ErroLeitura message={crmErrorMessage(q.error, 'Não foi possível carregar as opções do CRM.')} onRetry={q.refetch} />
      ) : flags ? (
        <div className="crm-flags">
          {FLAGS.map((f) => {
            const on = flags[f.key]
            return (
              <div key={f.key} className="opcao crm-flag">
                <span className={`dado-ic ${f.tone}`} aria-hidden="true">
                  {f.icon}
                </span>
                <div>
                  <b>{f.title}</b>
                  <p className="suave" id={`crm-flag-${f.key}-faz`}>
                    {f.faz}
                  </p>
                  <p className="crm-flag__nao" id={`crm-flag-${f.key}-nao`}>
                    <span className="forte">Não faz:</span> {f.naoFaz}
                  </p>
                </div>
                <div className="crm-flag__controle">
                  <span className="crm-flag__estado" aria-hidden="true">
                    {sending === f.key ? 'Salvando…' : on ? 'Ligada' : 'Desligada'}
                  </span>
                  <label className="interruptor">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={sending !== null}
                      aria-label={f.title}
                      aria-describedby={`crm-flag-${f.key}-faz crm-flag-${f.key}-nao`}
                      onChange={(e) => void toggle(f.key, e.target.checked)}
                    />
                    <span />
                  </label>
                </div>
              </div>
            )
          })}
          <p className="crm-ajustes__nota">
            <ShieldCheck className="ic" aria-hidden="true" />
            <span>
              Nenhuma destas opções envia mensagem aos seus clientes: o AtendeRadar só organiza e sugere. Ligar ou desligar o CRM
              inteiro da empresa é com o suporte do AtendeRadar.
            </span>
          </p>
        </div>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Funil de vendas

type Row = { key: string; id?: string; name: string; probability?: number; slaDays?: number | null }
type Base = { version: number; sig: string; ativas: CrmStage[] }

const activeOf = (p: CrmPipeline) => p.stages.filter((s) => s.status === 'active').sort((a, b) => a.position - b.position)
const rowOf = (s: CrmStage): Row => ({ key: s.id, id: s.id, name: s.name, probability: s.probability, slaDays: s.slaDays })
const sigOf = (list: { id?: string; name: string; probability?: number; slaDays?: number | null }[]) =>
  JSON.stringify(list.map((s) => [s.id ?? null, s.name, s.probability ?? null, s.slaDays ?? null]))
const novaChave = () => `nova-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function focar(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}

function PipelinesSection() {
  const q = useCrmQuery<PipelinesRes>('/api/crm/pipelines?includeInactive=1')
  const [novo, setNovo] = useState(false)
  const [novoKey, setNovoKey] = useState(0)
  const all = q.data?.pipelines ?? []
  const ativos = all.filter((p) => p.status === 'active').sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.position - b.position)
  const inativos = all.filter((p) => p.status !== 'active').sort((a, b) => a.position - b.position)

  const abrirNovo = () => {
    setNovoKey((k) => k + 1)
    setNovo(true)
  }

  return (
    <section className="cartao secao-config" aria-labelledby="crm-ajustes-funil">
      <SecaoCab
        id="crm-ajustes-funil"
        icon={<Kanban className="ic" />}
        title="Funil de vendas"
        desc="As etapas por onde cada negócio passa. Elas viram as colunas do quadro de negócios, na mesma ordem."
      >
        <button type="button" className="btn btn--primario" onClick={abrirNovo} disabled={!q.data}>
          <Plus className="ic" aria-hidden="true" />
          Novo funil
        </button>
      </SecaoCab>
      {q.loading ? (
        <Carregando label="Carregando os funis…" />
      ) : q.error && !q.data ? (
        <ErroLeitura message={crmErrorMessage(q.error, 'Não foi possível carregar os funis.')} onRetry={q.refetch} />
      ) : all.length === 0 ? (
        <div className="vazio">
          <Kanban className="ic mx-auto" aria-hidden="true" />
          <strong>Nenhum funil ainda</strong>
          <p>Crie o primeiro funil com as etapas de venda da sua empresa para começar a usar o quadro de negócios.</p>
          <button type="button" className="btn btn--primario mt-3" onClick={abrirNovo}>
            Criar o primeiro funil
          </button>
        </div>
      ) : (
        <div className="crm-funis">
          {q.error && <AvisoRecarga onRetry={q.refetch} />}
          {ativos.map((p) => (
            <PipelineCard key={p.id} pipeline={p} onChanged={q.refetch} />
          ))}
          {inativos.length > 0 && (
            <>
              <h3 className="crm-funis__sub">Funis desativados</h3>
              {inativos.map((p) => (
                <PipelineCard key={p.id} pipeline={p} onChanged={q.refetch} />
              ))}
            </>
          )}
        </div>
      )}
      <NovoFunilDialog key={novoKey} open={novo} onOpenChange={setNovo} onCreated={q.refetch} />
    </section>
  )
}

function PipelineCard({ pipeline: p, onChanged }: { pipeline: CrmPipeline; onChanged: () => void }) {
  const ativo = p.status === 'active'
  const [busy, setBusy] = useState(false)
  const [renomear, setRenomear] = useState(false)
  const [nome, setNome] = useState(p.name)
  const [desativar, setDesativar] = useState(false)
  const [erroDialogo, setErroDialogo] = useState<string | null>(null)
  const tituloId = `crm-funil-${p.id}`
  const nomeId = `crm-funil-${p.id}-nome`

  /** PATCH no funil com a versão atual. Devolve a mensagem de erro (ou null se deu certo). */
  async function patch(body: { name?: string; isDefault?: true; active?: boolean }, ok: string): Promise<string | null> {
    setBusy(true)
    try {
      await crmSend<PipelineRes>(`/api/crm/pipelines/${p.id}`, { method: 'PATCH', json: { version: p.version, ...body } })
      toast.success(ok)
      onChanged()
      return null
    } catch (e) {
      const msg = crmErrorMessage(e)
      toast.error(msg)
      if (isConflict(e)) onChanged()
      return msg
    } finally {
      setBusy(false)
    }
  }

  async function salvarNome(e: FormEvent) {
    e.preventDefault()
    const name = nome.trim()
    if (!name) return
    if (name === p.name) {
      setRenomear(false)
      return
    }
    const erro = await patch({ name }, `Funil renomeado para "${name}".`)
    if (erro) setErroDialogo(erro)
    else setRenomear(false)
  }

  async function confirmarDesativar() {
    const erro = await patch({ active: false }, `Funil "${p.name}" desativado.`)
    if (erro) setErroDialogo(erro)
    else setDesativar(false)
  }

  const etapasAtivas = activeOf(p)

  return (
    <article className={`crm-funil${ativo ? '' : ' crm-funil--inativo'}`} aria-labelledby={tituloId}>
      <div className="crm-funil__cab">
        <div className="crm-funil__nome">
          <h3 id={tituloId}>{p.name}</h3>
          {p.isDefault && (
            <span className="tag tag--verde">
              <Star className="ic" aria-hidden="true" />
              Padrão
            </span>
          )}
          {!ativo && <span className="tag tag--cinza">Desativado</span>}
        </div>
        <div className="crm-funil__acoes">
          {ativo ? (
            <>
              <button
                type="button"
                className="btn btn--sm"
                aria-label={`Renomear funil ${p.name}`}
                disabled={busy}
                onClick={() => {
                  setNome(p.name)
                  setErroDialogo(null)
                  setRenomear(true)
                }}
              >
                <Pencil className="ic" aria-hidden="true" />
                Renomear
              </button>
              {!p.isDefault && (
                <button
                  type="button"
                  className="btn btn--sm"
                  aria-label={`Tornar padrão o funil ${p.name}`}
                  disabled={busy}
                  onClick={() => void patch({ isDefault: true }, `"${p.name}" agora é o funil padrão.`)}
                >
                  <Star className="ic" aria-hidden="true" />
                  Tornar padrão
                </button>
              )}
              {!p.isDefault && (
                <button
                  type="button"
                  className="btn btn--sm btn--perigo"
                  aria-label={`Desativar funil ${p.name}`}
                  disabled={busy}
                  onClick={() => {
                    setErroDialogo(null)
                    setDesativar(true)
                  }}
                >
                  Desativar
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="btn btn--sm"
              aria-label={`Reativar funil ${p.name}`}
              disabled={busy}
              onClick={() => void patch({ active: true }, `Funil "${p.name}" reativado.`)}
            >
              <RotateCcw className="ic" aria-hidden="true" />
              Reativar
            </button>
          )}
        </div>
      </div>

      {p.isDefault && (
        <p className="suave crm-funil__ajuda">
          Quando ninguém escolhe outro funil, o negócio novo entra neste. Para desativar o funil padrão, torne outro funil o padrão
          antes.
        </p>
      )}

      {ativo ? (
        <StagesEditor pipeline={p} onChanged={onChanged} />
      ) : (
        <p className="suave crm-funil__ajuda">
          {etapasAtivas.length ? `Etapas: ${etapasAtivas.map((s) => s.name).join(', ')}.` : 'Sem etapas ativas.'} Reative o funil para
          voltar a usá-lo no quadro de negócios.
        </p>
      )}

      <Dialog open={renomear} onOpenChange={(o) => !busy && setRenomear(o)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void salvarNome(e)}>
            <DialogHeader>
              <DialogTitle>Renomear funil</DialogTitle>
              <DialogDescription>O novo nome aparece para toda a equipe no quadro de negócios.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <label htmlFor={nomeId} className="text-sm font-medium">
                Nome do funil
              </label>
              <Input id={nomeId} value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
              {erroDialogo && (
                <p role="alert" className="text-sm text-destructive">
                  {erroDialogo}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenomear(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy || !nome.trim()}>
                {busy ? 'Salvando…' : 'Salvar nome'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={desativar} onOpenChange={(o) => !busy && setDesativar(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desativar funil</DialogTitle>
            <DialogDescription>
              O funil "{p.name}" sai do quadro de negócios e deixa de receber negócios novos. O histórico continua guardado e dá para
              reativar depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm">Só dá para desativar um funil que não tem negócio aberto.</p>
            {erroDialogo && (
              <p role="alert" className="text-sm text-destructive">
                {erroDialogo}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDesativar(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmarDesativar()} disabled={busy}>
              {busy ? 'Desativando…' : 'Desativar funil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}

function StagesEditor({ pipeline, onChanged }: { pipeline: CrmPipeline; onChanged: () => void }) {
  const servidor = activeOf(pipeline)
  const sigServidor = sigOf(servidor)
  const [rows, setRows] = useState<Row[]>(() => servidor.map(rowOf))
  const [base, setBase] = useState<Base>(() => ({ version: pipeline.version, sig: sigServidor, ativas: servidor }))
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [anuncio, setAnuncio] = useState('')
  const prefixo = `crm-etapas-${pipeline.id}`

  // Versão nova do servidor (outra pessoa, outra aba ou o recarregamento depois de um conflito). Renomear o funil também
  // sobe a versão: se as etapas são as mesmas, o rascunho fica. Se mudaram, o rascunho volta para o que está salvo, com
  // aviso quando havia alteração não salva.
  if (pipeline.version > base.version) {
    if (sigServidor !== base.sig) {
      const sujoAntes = sigOf(rows) !== base.sig
      setRows(servidor.map(rowOf))
      setAviso(sujoAntes ? 'As etapas foram alteradas por outra pessoa. A versão salva foi carregada e as suas alterações não salvas foram descartadas.' : null)
      setErro(null)
    }
    setBase({ version: pipeline.version, sig: sigServidor, ativas: servidor })
  }

  const sujo = sigOf(rows) !== base.sig
  const idsNoRascunho = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])))
  const saem = base.ativas.filter((s) => !idsNoRascunho.has(s.id))
  const desativadas = pipeline.stages.filter((s) => s.status !== 'active' && !idsNoRascunho.has(s.id) && !base.ativas.some((a) => a.id === s.id))
  const semNome = rows.findIndex((r) => !r.name.trim())
  const erroLocal = semNome >= 0 ? `Dê um nome para a etapa ${semNome + 1} antes de salvar.` : null
  const cheio = rows.length >= MAX_ETAPAS
  const inputId = (key: string) => `${prefixo}-${key}`
  const nomeDe = (r: Row, i: number) => r.name.trim() || String(i + 1)

  function mover(i: number, d: -1 | 1) {
    const j = i + d
    if (j < 0 || j >= rows.length) return
    const r = rows[i]
    const n = [...rows]
    n[i] = n[j]
    n[j] = r
    setRows(n)
    setAnuncio(`Etapa ${nomeDe(r, i)} agora é a ${j + 1}ª de ${n.length}.`)
    const alvo = (d < 0 && j === 0) || (d > 0 && j === n.length - 1) ? (d < 0 ? 'descer' : 'subir') : d < 0 ? 'subir' : 'descer'
    focar(`${inputId(r.key)}-${alvo}`)
  }

  function tirar(i: number) {
    if (rows.length <= 1) return
    const r = rows[i]
    setRows(rows.filter((x) => x.key !== r.key))
    setAnuncio(r.id ? `Etapa ${nomeDe(r, i)} sai do funil ao salvar.` : `Etapa ${nomeDe(r, i)} removida.`)
    focar(`${prefixo}-nova`)
  }

  function nova() {
    if (cheio) return
    const key = novaChave()
    setRows([...rows, { key, name: '' }])
    focar(inputId(key))
  }

  function manter(s: CrmStage) {
    if (cheio) return
    const original = base.ativas.findIndex((x) => x.id === s.id)
    const n = [...rows]
    n.splice(original < 0 ? n.length : Math.min(original, n.length), 0, rowOf(s))
    setRows(n)
    setAnuncio(`Etapa ${s.name} fica no funil.`)
  }

  function reativar(s: CrmStage) {
    if (cheio) return
    setRows([...rows, rowOf(s)])
    setAnuncio(`Etapa ${s.name} volta ao funil ao salvar.`)
  }

  function desfazer() {
    setRows(base.ativas.map(rowOf))
    setErro(null)
    setAviso(null)
    setAnuncio('Alterações desfeitas.')
  }

  async function salvar() {
    if (erroLocal || saving || !sujo) return
    setSaving(true)
    setErro(null)
    setAviso(null)
    try {
      const stages = rows.map((r) =>
        r.id ? { id: r.id, name: r.name.trim(), probability: r.probability ?? 0, slaDays: r.slaDays ?? null } : { name: r.name.trim() },
      )
      const res = await crmSend<PipelineRes>(`/api/crm/pipelines/${pipeline.id}/stages`, {
        method: 'PATCH',
        json: { version: base.version, stages },
      })
      const ativas = activeOf(res.pipeline)
      setRows(ativas.map(rowOf))
      setBase({ version: res.pipeline.version, sig: sigOf(ativas), ativas })
      toast.success('Etapas salvas.')
      onChanged()
    } catch (e) {
      const msg = crmErrorMessage(e)
      toast.error(msg)
      if (isConflict(e)) onChanged()
      else setErro(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="crm-etapas-editor">
      <h4 className="crm-etapas__titulo" id={`${prefixo}-titulo`}>
        Etapas, na ordem do quadro
      </h4>
      {aviso && (
        <div className="aviso aviso--ambar crm-ajustes__aviso" role="status">
          <TriangleAlert className="ic" aria-hidden="true" />
          <span>{aviso}</span>
        </div>
      )}
      <ol className="crm-etapas" aria-labelledby={`${prefixo}-titulo`}>
        {rows.map((r, i) => {
          const nomeEtapa = nomeDe(r, i)
          return (
            <li key={r.key} className={`crm-etapa${r.id ? '' : ' crm-etapa--nova'}`}>
              <span className="crm-etapa__num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="crm-etapa__campo">
                <label htmlFor={inputId(r.key)} className="sr-only">
                  Nome da etapa {i + 1}
                </label>
                <input
                  id={inputId(r.key)}
                  className="entrada"
                  value={r.name}
                  maxLength={60}
                  placeholder="Ex.: Proposta enviada"
                  disabled={saving}
                  onChange={(e) => {
                    const name = e.target.value
                    setRows(rows.map((x) => (x.key === r.key ? { ...x, name } : x)))
                  }}
                />
                {!r.id && <span className="tag tag--azul">Nova</span>}
              </div>
              <div className="crm-etapa__acoes">
                <button
                  type="button"
                  id={`${inputId(r.key)}-subir`}
                  className="btn btn--sm crm-etapa__mover"
                  aria-label={`Subir etapa ${nomeEtapa}`}
                  title="Subir"
                  disabled={i === 0 || saving}
                  onClick={() => mover(i, -1)}
                >
                  <ArrowUp className="ic" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  id={`${inputId(r.key)}-descer`}
                  className="btn btn--sm crm-etapa__mover"
                  aria-label={`Descer etapa ${nomeEtapa}`}
                  title="Descer"
                  disabled={i === rows.length - 1 || saving}
                  onClick={() => mover(i, 1)}
                >
                  <ArrowDown className="ic" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  aria-label={`${r.id ? 'Desativar' : 'Remover'} etapa ${nomeEtapa}`}
                  disabled={rows.length <= 1 || saving}
                  onClick={() => tirar(i)}
                >
                  <X className="ic" aria-hidden="true" />
                  {r.id ? 'Desativar' : 'Remover'}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>

      {saem.length > 0 && (
        <div className="crm-etapas__fora">
          <p>
            <span className="forte">Saem do funil ao salvar:</span>
          </p>
          <ul>
            {saem.map((s) => (
              <li key={s.id}>
                <span>{s.name}</span>
                <button type="button" className="btn btn--sm btn--link" aria-label={`Manter etapa ${s.name}`} disabled={cheio || saving} onClick={() => manter(s)}>
                  Manter
                </button>
              </li>
            ))}
          </ul>
          <p className="suave">Etapa com negócio aberto não sai do funil: mova os negócios antes. O histórico dos negócios continua guardado.</p>
        </div>
      )}

      {desativadas.length > 0 && (
        <div className="crm-etapas__fora">
          <p>
            <span className="forte">Etapas desativadas</span>
          </p>
          <ul>
            {desativadas.map((s) => (
              <li key={s.id}>
                <span>{s.name}</span>
                <button type="button" className="btn btn--sm btn--link" aria-label={`Reativar etapa ${s.name}`} disabled={cheio || saving} onClick={() => reativar(s)}>
                  Reativar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="crm-etapas__rodape">
        <button type="button" id={`${prefixo}-nova`} className="btn btn--sm" onClick={nova} disabled={cheio || saving}>
          <Plus className="ic" aria-hidden="true" />
          Nova etapa
        </button>
        <span className="suave crm-etapas__contagem">
          {rows.length} de {MAX_ETAPAS} etapas
        </span>
        <div className="crm-etapas__salvar">
          {sujo && (
            <button type="button" className="btn btn--sm" onClick={desfazer} disabled={saving}>
              Desfazer alterações
            </button>
          )}
          <button type="button" className="btn btn--sm btn--primario" onClick={() => void salvar()} disabled={!sujo || saving || !!erroLocal}>
            {saving ? 'Salvando…' : 'Salvar etapas'}
          </button>
        </div>
      </div>
      {sujo && erroLocal && <p className="suave">{erroLocal}</p>}
      {erro && (
        <p className="crm-ajustes__erro" role="alert">
          <TriangleAlert className="ic" aria-hidden="true" />
          <span>{erro}</span>
        </p>
      )}
    </div>
  )
}

const ETAPAS_INICIAIS = ['Primeiro contato', 'Proposta enviada', 'Negociação']

function NovoFunilDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [nome, setNome] = useState('')
  const [etapas, setEtapas] = useState(() => ETAPAS_INICIAIS.map((name, i) => ({ key: `inicial-${i}`, name })))
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const etapaId = (key: string) => `crm-novo-funil-etapa-${key}`

  function adicionar() {
    if (etapas.length >= MAX_ETAPAS) return
    const key = novaChave()
    setEtapas([...etapas, { key, name: '' }])
    focar(etapaId(key))
  }

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    const name = nome.trim()
    const stages = etapas.map((x) => x.name.trim()).filter(Boolean)
    if (!name) {
      setErro('Dê um nome para o funil.')
      return
    }
    if (!stages.length) {
      setErro('O funil precisa de pelo menos uma etapa com nome.')
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      const res = await crmSend<PipelineRes>('/api/crm/pipelines', { json: { name, stages: stages.map((s) => ({ name: s })) }, idempotent: true })
      toast.success(`Funil "${res.pipeline.name}" criado.`)
      onCreated()
      onOpenChange(false)
    } catch (err) {
      const msg = crmErrorMessage(err)
      setErro(msg)
      toast.error(msg)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !enviando && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void criar(e)}>
          <DialogHeader>
            <DialogTitle>Novo funil</DialogTitle>
            <DialogDescription>Dê um nome e liste as etapas na ordem em que a venda acontece. Dá para mudar tudo depois.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="crm-novo-funil-nome" className="text-sm font-medium">
                Nome do funil
              </label>
              <Input id="crm-novo-funil-nome" value={nome} maxLength={60} placeholder="Ex.: Vendas da loja" onChange={(e) => setNome(e.target.value)} />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Etapas iniciais</legend>
              <ol className="space-y-2">
                {etapas.map((et, i) => (
                  <li key={et.key} className="flex items-center gap-2">
                    <span aria-hidden="true" className="w-6 shrink-0 text-center text-sm text-muted-foreground">
                      {i + 1}
                    </span>
                    <label htmlFor={etapaId(et.key)} className="sr-only">
                      Nome da etapa {i + 1}
                    </label>
                    <Input
                      id={etapaId(et.key)}
                      value={et.name}
                      maxLength={60}
                      onChange={(e) => {
                        const name = e.target.value
                        setEtapas(etapas.map((x) => (x.key === et.key ? { ...x, name } : x)))
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover etapa ${i + 1}`}
                      disabled={etapas.length <= 1 || enviando}
                      onClick={() => setEtapas(etapas.filter((x) => x.key !== et.key))}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ol>
              <Button type="button" variant="outline" size="sm" onClick={adicionar} disabled={etapas.length >= MAX_ETAPAS || enviando}>
                <Plus aria-hidden="true" />
                Adicionar etapa
              </Button>
              <p className="text-xs text-muted-foreground">Até {MAX_ETAPAS} etapas. O primeiro funil criado vira o padrão.</p>
            </fieldset>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Criando…' : 'Criar funil'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Sincronização

const STATUS_GERAL: Record<string, { label: string; tom: string; Icon: typeof CircleCheck; texto: string }> = {
  operational: { label: 'Em dia', tom: 'tag--verde', Icon: CircleCheck, texto: 'As informações das conversas estão chegando ao CRM normalmente.' },
  syncing: {
    label: 'Com atraso',
    tom: 'tag--ambar',
    Icon: Clock,
    texto: 'Há eventos esperando há mais de 5 minutos. Costuma se resolver sozinho; se o atraso passar de uma hora, fale com o suporte do AtendeRadar.',
  },
  degraded: {
    label: 'Com eventos parados',
    tom: 'tag--vermelho',
    Icon: TriangleAlert,
    texto: 'Alguns eventos falharam várias vezes e pararam. Eles estão na lista "Eventos parados", mais abaixo.',
  },
}

const PROVEDOR: Record<string, string> = { native: 'CRM do AtendeRadar', open_mercato: 'CRM externo' }
const SITUACAO_LIGACAO: Record<string, string> = {
  pending: 'em preparação',
  active: 'funcionando',
  degraded: 'com problema',
  disabled: 'desligada',
  deleting: 'sendo removida',
}

const CONTAGENS: { key: string; label: string; ajuda: string }[] = [
  { key: 'pending', label: 'Pendentes', ajuda: 'Esperando a vez.' },
  { key: 'processing', label: 'Processando', ajuda: 'Sendo aplicados agora.' },
  { key: 'processed', label: 'Processados', ajuda: 'Já aplicados no CRM.' },
  { key: 'failed', label: 'Falharam', ajuda: 'Nova tentativa agendada.' },
  { key: 'dead', label: 'Parados', ajuda: 'Precisam ser reprocessados.' },
]

const LEITURA: Record<string, string> = {
  'capture:opportunities': 'Oportunidades das conversas',
  'capture:alerts': 'Alertas',
  'capture:recoveries': 'Recuperações',
  'capture:privacy': 'Privacidade dos contatos',
  'capture:stages': 'Etapas das conversas',
}

const CONFERENCIA: { key: string; label: string }[] = [
  { key: 'emitted', label: 'Eventos repostos' },
  { key: 'alreadySynced', label: 'Já estavam em dia' },
  { key: 'dealsOpen', label: 'Negócios abertos' },
  { key: 'deals', label: 'Negócios no total' },
  { key: 'pendingSuggestions', label: 'Sugestões esperando revisão' },
  { key: 'duplicatePhones', label: 'Telefones repetidos em contatos' },
  { key: 'orphanLinks', label: 'Vínculos sem negócio' },
  { key: 'missingOpportunities', label: 'Oportunidades que não existem mais' },
  { key: 'stuckEvents', label: 'Eventos travados' },
  { key: 'deadEvents', label: 'Eventos parados' },
]

const EVENTO: Record<string, string> = {
  'opportunity.detected': 'Oportunidade detectada',
  'opportunity.estimate_changed': 'Estimativa de oportunidade mudou',
  'alert.created': 'Alerta criado',
  'alert.resolved': 'Alerta resolvido',
  'conversation.stage_inferred': 'Etapa da conversa identificada',
  'outcome.detected': 'Resultado da conversa identificado',
  'recovery.completed': 'Recuperação concluída',
  'contact.privacy_changed': 'Privacidade do contato mudou',
}

const ERRO: Record<string, string> = {
  unknown_event_type: 'Tipo de evento desconhecido',
  invalid_json: 'Conteúdo ilegível',
  invalid_payload: 'Conteúdo fora do formato esperado',
  no_consumer: 'Nenhum processador disponível no momento',
  consumer_error: 'Erro ao aplicar no CRM',
  capture_failed: 'A leitura falhou',
}

function erroLabel(code: string | null | undefined): string {
  if (!code) return 'Sem detalhe'
  if (code.startsWith('db_')) return 'Erro no banco de dados'
  return ERRO[code] ?? 'Erro não identificado'
}

function SyncSection() {
  const q = useCrmQuery<StatusRes>('/api/crm/integration/status')
  const role = useAppStore((s) => s.me?.role)
  const podeReprocessar = can(role, 'crm.sync.retry')
  const [reprocessando, setReprocessando] = useState<string | null>(null)
  // "Atualizar" recarrega mantendo o dado na tela (useCrmQuery não marca loading no refetch): o botão fica em
  // "Atualizando…" até chegar uma resposta nova (dado ou erro), para a pessoa ver que o clique teve efeito.
  const [atualizando, setAtualizando] = useState<{ data: StatusRes | null; error: CrmApiError | null } | null>(null)
  if (atualizando && (atualizando.data !== q.data || atualizando.error !== q.error)) setAtualizando(null)

  function atualizar() {
    if (q.loading || atualizando) return
    setAtualizando({ data: q.data, error: q.error })
    q.refetch()
  }

  async function reprocessar(ev: DeadEvent) {
    if (reprocessando) return
    setReprocessando(ev.id)
    try {
      await crmSend(`/api/crm/integration/dlq/${ev.id}/retry`, { method: 'POST', json: {} })
      toast.success('Evento devolvido à fila. Ele deve ser processado nos próximos minutos.')
    } catch (e) {
      toast.error(crmErrorMessage(e))
    } finally {
      setReprocessando(null)
      q.refetch()
    }
  }

  const d = q.data
  return (
    <section className="cartao secao-config" aria-labelledby="crm-ajustes-sync">
      <SecaoCab
        id="crm-ajustes-sync"
        icon={<RefreshCw className="ic" />}
        title="Sincronização"
        desc="Como as informações das conversas chegam ao CRM. Aqui não aparece nenhum dado dos seus clientes."
      >
        <button type="button" className="btn btn--sm" onClick={atualizar} disabled={q.loading || !!atualizando}>
          <RefreshCw className="ic" aria-hidden="true" />
          {atualizando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </SecaoCab>
      {q.loading ? (
        <Carregando label="Carregando a sincronização…" />
      ) : q.error && !d ? (
        <ErroLeitura message={crmErrorMessage(q.error, 'Não foi possível carregar a sincronização.')} onRetry={atualizar} />
      ) : d ? (
        <SyncData data={d} podeReprocessar={podeReprocessar} reprocessando={reprocessando} onRetryEvent={reprocessar} recargaFalhou={!!q.error} onRefetch={atualizar} />
      ) : null}
    </section>
  )
}

function SyncData({
  data,
  podeReprocessar,
  reprocessando,
  onRetryEvent,
  recargaFalhou,
  onRefetch,
}: {
  data: StatusRes
  podeReprocessar: boolean
  reprocessando: string | null
  onRetryEvent: (ev: DeadEvent) => void
  recargaFalhou: boolean
  onRefetch: () => void
}) {
  // sem nenhuma leitura feita, "Em dia" seria afirmar o que ainda não foi medido
  const geral =
    data.status === 'operational' && data.checkpoints.length === 0
      ? { label: 'Aguardando a primeira leitura', tom: 'tag--cinza', Icon: Clock, texto: 'O CRM ainda não leu as conversas desta conta. Isso acontece poucos minutos depois que o CRM é ligado.' }
      : (STATUS_GERAL[data.status] ?? { label: 'Sem informação', tom: 'tag--cinza', Icon: Clock, texto: 'Ainda não há medição da sincronização.' })
  const link = data.link
  const ligacao = link ? `${PROVEDOR[link.provider] ?? 'CRM externo'}, ${SITUACAO_LIGACAO[link.status] ?? 'situação desconhecida'}` : 'Ainda não preparada'
  const esperando = (data.counts.pending ?? 0) + (data.counts.failed ?? 0)
  const conferencia = data.checkpoints.find((c) => c.resource === 'reconcile')
  const leituras = data.checkpoints
    .filter((c) => c.resource !== 'reconcile')
    .sort((a, b) => Object.keys(LEITURA).indexOf(a.resource) - Object.keys(LEITURA).indexOf(b.resource))
  const statsConferencia = conferencia?.stats ? CONFERENCIA.filter((c) => typeof conferencia.stats?.[c.key] === 'number') : []
  const GeralIcon = geral.Icon

  return (
    <div className="crm-sync">
      {recargaFalhou && <AvisoRecarga onRetry={onRefetch} />}

      <div className="crm-sync__resumo">
        <span className={`tag tag--lg ${geral.tom}`}>
          <GeralIcon className="ic" aria-hidden="true" />
          {geral.label}
        </span>
        <p>{geral.texto}</p>
      </div>

      <dl className="crm-sync__lista">
        <div>
          <dt>Ligação com o CRM</dt>
          <dd>{ligacao}</dd>
        </div>
        <div>
          <dt>Atraso da fila</dt>
          <dd>{esperando === 0 ? 'Nada esperando' : duracao(data.lagSeconds)}</dd>
        </div>
        <div>
          <dt>Última verificação sem problema</dt>
          <dd>{quando(link?.lastHealthyAt)}</dd>
        </div>
        {link?.lastErrorCode && (
          <div>
            <dt>Último problema da ligação</dt>
            <dd>{erroLabel(link.lastErrorCode)}</dd>
          </div>
        )}
      </dl>

      <h3 className="crm-sync__titulo">Eventos na fila</h3>
      <dl className="kpis crm-sync__contagens">
        {CONTAGENS.map((c) => (
          <div key={c.key} className="kpi cartao">
            <dt className="kpi__rotulo">{c.label}</dt>
            <dd className="kpi__valor">{numero(data.counts[c.key] ?? 0)}</dd>
            <dd className="suave crm-sync__ajuda">{c.ajuda}</dd>
          </div>
        ))}
      </dl>

      {data.checkpoints.length === 0 ? (
        <div className="vazio">
          <Clock className="ic mx-auto" aria-hidden="true" />
          <strong>Nenhuma leitura ainda</strong>
          <p>A primeira leitura das conversas acontece poucos minutos depois que o CRM é ligado, e a primeira conferência em até 6 horas.</p>
          <button type="button" className="btn mt-3" onClick={onRefetch}>
            Atualizar agora
          </button>
        </div>
      ) : (
        <>
          <h3 className="crm-sync__titulo">Última conferência</h3>
          {conferencia ? (
            <>
              <p className="suave">
                A cada 6 horas o AtendeRadar relê os últimos 7 dias e confere se tudo chegou ao CRM. Última conferência:{' '}
                {quando(conferencia.lastRunAt)}.
              </p>
              {statsConferencia.length > 0 && (
                <dl className="crm-sync__lista">
                  {statsConferencia.map((c) => (
                    <div key={c.key}>
                      <dt>{c.label}</dt>
                      <dd>{numero(conferencia.stats?.[c.key] as number)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          ) : (
            <p className="suave">A primeira conferência acontece em até 6 horas depois que o CRM é ligado.</p>
          )}

          <h3 className="crm-sync__titulo">Leituras do AtendeRadar</h3>
          {leituras.length === 0 ? (
            <p className="suave">Nenhuma leitura registrada ainda.</p>
          ) : (
            <div className="tabela-wrap crm-tabela-rola" role="region" tabIndex={0} aria-label="Leituras do AtendeRadar para o CRM">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">O que é lido</th>
                    <th scope="col">Última leitura</th>
                    <th scope="col">Última sem erro</th>
                    <th scope="col">Atraso</th>
                    <th scope="col">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {leituras.map((c) => (
                    <tr key={c.resource}>
                      <td>{LEITURA[c.resource] ?? 'Outra leitura'}</td>
                      <td>{quando(c.lastRunAt)}</td>
                      <td>{quando(c.lastSuccessAt)}</td>
                      <td>{c.lagSeconds ? duracao(c.lagSeconds) : 'Em dia'}</td>
                      <td>
                        {c.lastErrorCode ? (
                          <span className="tag tag--vermelho">
                            <TriangleAlert className="ic" aria-hidden="true" />
                            Falhou na última leitura
                          </span>
                        ) : (
                          <span className="tag tag--verde">
                            <CircleCheck className="ic" aria-hidden="true" />
                            Em dia
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h3 className="crm-sync__titulo">Eventos parados</h3>
      {data.dead.length === 0 ? (
        <div className="vazio">
          <CircleCheck className="ic mx-auto" aria-hidden="true" />
          <strong>Nenhum evento parado</strong>
          <p>
            Quando um evento falha várias vezes, ele para aqui e
            {podeReprocessar ? ' você pode reprocessar depois de resolver a causa.' : ' um administrador pode reprocessar.'}
          </p>
        </div>
      ) : (
        <>
          <p className="suave">
            {podeReprocessar
              ? 'Reprocessar devolve o evento à fila. Se ele falhar outra vez pelo mesmo motivo, fale com o suporte do AtendeRadar.'
              : 'Só administradores podem reprocessar eventos parados.'}
          </p>
          <div className="tabela-wrap crm-tabela-rola" role="region" tabIndex={0} aria-label="Eventos parados na sincronização">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Evento</th>
                  <th scope="col">Motivo</th>
                  <th scope="col">Tentativas</th>
                  <th scope="col">Criado em</th>
                  {podeReprocessar && (
                    <th scope="col">
                      <span className="sr-only">Ação</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.dead.map((ev) => {
                  const nomeEvento = EVENTO[ev.eventType] ?? 'Evento do sistema'
                  return (
                    <tr key={ev.id}>
                      <td>{nomeEvento}</td>
                      <td>{erroLabel(ev.lastErrorCode)}</td>
                      <td className="num">{ev.attempts}</td>
                      <td>{quando(ev.createdAt)}</td>
                      {podeReprocessar && (
                        <td className="direita">
                          <button
                            type="button"
                            className="btn btn--sm"
                            aria-label={`Reprocessar evento ${nomeEvento} de ${quando(ev.createdAt)}`}
                            disabled={reprocessando !== null}
                            onClick={() => onRetryEvent(ev)}
                          >
                            <RotateCcw className="ic" aria-hidden="true" />
                            {reprocessando === ev.id ? 'Enviando…' : 'Reprocessar'}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {data.dead.length >= 20 && <p className="suave">Mostrando os 20 eventos parados mais recentes.</p>}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------

export default function CrmSettingsView() {
  const role = useAppStore((s) => s.me?.role)
  const semAcesso = !!role && !can(role, 'crm.settings.manage')

  return (
    <>
      <header className="cab-pagina">
        <div className="cab-pagina__titulo">
          <SlidersHorizontal className="ic cab-pagina__icone" aria-hidden="true" />
          <div>
            <h1>Ajustes do CRM</h1>
            <p>Escolha o que o CRM faz sozinho, organize o funil de vendas e acompanhe a sincronização com o AtendeRadar.</p>
          </div>
        </div>
      </header>
      {semAcesso ? (
        <div className="cartao vazio" role="status">
          <ShieldCheck className="ic" aria-hidden="true" />
          <strong>Esta tela é só para administradores e gestores</strong>
          <p>Peça a um administrador da sua empresa para mudar os ajustes do CRM.</p>
        </div>
      ) : (
        <>
          <FlagsSection />
          <PipelinesSection />
          <SyncSection />
        </>
      )}
    </>
  )
}
