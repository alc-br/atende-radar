'use client'

import { moneyProps } from '@/lib/money-input'
import { useCallback, useEffect, useState } from 'react'
import {
  Building2, Clock, DollarSign, QrCode, Users, FileBarChart, CheckCircle2, ArrowLeft, ArrowRight, Plus, Trash2, Zap,
  Tag, Globe, Rocket, RefreshCw, type LucideIcon,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'

interface OnboardingAgent {
  name: string
  email: string
}

interface OnboardingState {
  orgName: string
  segment: string
  timezone: string
  businessHours: Record<string, { start: string; end: string; active: boolean }>
  avgTicket: string
  conversionRate: string
  whatsappConnected: boolean
  agents: OnboardingAgent[]
  reportFreq: 'daily' | 'weekly' | 'daily+weekly'
  reportTime: string
  reportWeekDay: string
}

// Título de cada etapa no formato do pacote: texto + destaque verde
const STEPS: { id: string; label: string; icon: LucideIcon; title: [string, string, string?]; sub: string }[] = [
  { id: 'empresa', label: 'Empresa', icon: Building2, title: ['Vamos ativar seu ', 'AtendeRadar'], sub: 'Faltam poucos passos para começar a auditar suas conversas.' },
  { id: 'horario', label: 'Horário', icon: Clock, title: ['Qual é o seu ', 'horário comercial', '?'], sub: 'Defina o horário comercial de cada dia da semana.' },
  { id: 'meta', label: 'Meta', icon: DollarSign, title: ['Quanto vale cada ', 'conversa', '?'], sub: 'Esses dados ajudam a calcular o valor em risco nas conversas.' },
  { id: 'whatsapp', label: 'WhatsApp', icon: QrCode, title: ['Conecte seu ', 'WhatsApp'], sub: 'Conecte sua conta do WhatsApp Business para começar a auditar conversas.' },
  { id: 'equipe', label: 'Equipe', icon: Users, title: ['Quem atende no ', 'WhatsApp', '?'], sub: 'Adicione os atendentes da equipe.' },
  { id: 'relatorio', label: 'Relatório', icon: FileBarChart, title: ['Quando receber seus ', 'relatórios', '?'], sub: 'Configure quando e como deseja receber seus relatórios.' },
  { id: 'revisao', label: 'Revisão', icon: CheckCircle2, title: ['Revise e ', 'ative', ''], sub: 'Confira os dados antes de ativar a organização.' },
]

const DAYS = [
  { key: 'dom', label: 'Dom' },
  { key: 'seg', label: 'Seg' },
  { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' },
  { key: 'sab', label: 'Sáb' },
]

const SEGMENTS = [
  'Varejo', 'E-commerce', 'Serviços', 'Saúde', 'Educação',
  'Imobiliário', 'Automotivo', 'Alimentação', 'Tecnologia', 'Outro',
]

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Belem',
  'America/Fortaleza', 'America/Recife', 'America/Cuiaba',
  'America/Porto_Velho', 'America/Rio_Branco', 'America/Boa_Vista',
]

const REPORT_FREQ: Record<OnboardingState['reportFreq'], string> = { daily: 'Diário', weekly: 'Semanal', 'daily+weekly': 'Diário + Semanal' }

const defaultHours: Record<string, { start: string; end: string; active: boolean }> = {}
DAYS.forEach((d) => {
  defaultHours[d.key] = { start: '09:00', end: '18:00', active: !['dom', 'sab'].includes(d.key) }
})

const initialState: OnboardingState = {
  orgName: '',
  segment: '',
  timezone: 'America/Sao_Paulo',
  businessHours: { ...defaultHours },
  avgTicket: '',
  conversionRate: '',
  whatsappConnected: false,
  agents: [],
  reportFreq: 'daily',
  reportTime: '18:00',
  reportWeekDay: 'seg',
}

// T5 · o assistente continua de onde parou: rascunho por pessoa neste navegador (não há campo no servidor para isso).
// Sem armazenamento (aba anônima, bloqueado) o assistente funciona normalmente, só não lembra a etapa.
type OnboardingDraft = { step: number; state: OnboardingState }
const draftKey = (email: string) => `atenderadar:onboarding:${email}`

function readDraft(email: string | null | undefined): OnboardingDraft | null {
  if (!email || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(draftKey(email))
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<OnboardingDraft> | null
    if (!d || typeof d !== 'object') return null
    const step = typeof d.step === 'number' && Number.isInteger(d.step) ? Math.min(Math.max(d.step, 0), STEPS.length - 1) : 0
    const saved = d.state && typeof d.state === 'object' ? d.state : null
    const state: OnboardingState = saved
      ? {
          ...initialState,
          ...saved,
          businessHours: { ...defaultHours, ...(saved.businessHours && typeof saved.businessHours === 'object' ? saved.businessHours : {}) },
          agents: Array.isArray(saved.agents) ? saved.agents : [],
          whatsappConnected: false, // conferido de novo na etapa do WhatsApp
        }
      : initialState
    return { step, state }
  } catch {
    return null
  }
}

function writeDraft(email: string | null | undefined, draft: OnboardingDraft | null) {
  if (!email || typeof window === 'undefined') return
  try {
    if (draft) window.localStorage.setItem(draftKey(email), JSON.stringify(draft))
    else window.localStorage.removeItem(draftKey(email))
  } catch {
    // armazenamento indisponível: segue sem lembrar a etapa
  }
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

// Visual de onboarding.html do pacote, dentro do conteúdo do painel (o `.conta` ativa as regras de conta).
export default function OnboardingView() {
  const { setView, setCurrentOrganization } = useAppStore()
  const email = useAppStore((s) => s.me?.email)
  const [draft] = useState(() => readDraft(email))
  const [step, setStep] = useState(draft?.step ?? 0)
  const [state, setState] = useState<OnboardingState>(draft?.state ?? initialState)
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (!activated) writeDraft(email, { step, state })
  }, [email, step, state, activated])
  const [agentNameInput, setAgentNameInput] = useState('')
  const [agentEmailInput, setAgentEmailInput] = useState('')
  const [activating, setActivating] = useState(false)

  const update = (partial: Partial<OnboardingState>) =>
    setState((prev) => ({ ...prev, ...partial }))

  // Estado real: há alguma conexão de WhatsApp conectada nesta empresa?
  const [checkingWhatsapp, setCheckingWhatsapp] = useState(false)
  const checkWhatsapp = useCallback(() => {
    setCheckingWhatsapp(true)
    fetch('/api/connections')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: { status: string }[] = Array.isArray(d) ? d : d?.connections ?? []
        setState((prev) => ({ ...prev, whatsappConnected: list.some((c) => c.status === 'connected') }))
      })
      .catch(() => {})
      .finally(() => setCheckingWhatsapp(false))
  }, [])
  useEffect(() => {
    if (step === 3) checkWhatsapp()
  }, [step, checkWhatsapp])

  const updateHours = (day: string, field: 'start' | 'end' | 'active', value: string | boolean) =>
    setState((prev) => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: { ...prev.businessHours[day], [field]: value },
      },
    }))

  const addAgent = () => {
    const name = agentNameInput.trim()
    const email = agentEmailInput.trim()
    if (name && email && !state.agents.some((a) => a.email === email)) {
      update({ agents: [...state.agents, { name, email }] })
      setAgentNameInput('')
      setAgentEmailInput('')
    }
  }
  const removeAgent = (email: string) =>
    update({ agents: state.agents.filter((a) => a.email !== email) })

  const tzLabel = (tz: string) => tz.replace('America/', '').replace(/_/g, ' ')
  const valuePerConversation = state.avgTicket && state.conversionRate
    ? ((parseFloat(state.avgTicket) * parseFloat(state.conversionRate)) / 100).toFixed(2)
    : null

  const canNext = () => {
    switch (step) {
      case 0: return state.orgName.trim() !== '' && state.segment !== ''
      case 1: return true
      case 2: return state.avgTicket !== '' && state.conversionRate !== ''
      case 3: return true // conectar o WhatsApp pode ficar para depois (tela Conexões)
      case 4: return state.agents.length > 0
      case 5: return true
      default: return true
    }
  }

  const handleActivate = async () => {
    setActivating(true)
    try {
      const dayIndex: Record<string, string> = { dom: '0', seg: '1', ter: '2', qua: '3', qui: '4', sex: '5', sab: '6' }
      const businessHours: Record<string, { open: string; close: string; enabled: boolean }> = {}
      for (const [key, h] of Object.entries(state.businessHours)) {
        businessHours[dayIndex[key]] = { open: h.start, close: h.end, enabled: h.active }
      }

      const settingsRes = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: state.orgName,
          segment: state.segment,
          timezone: state.timezone,
          settings: {
            businessHours,
            avgTicket: state.avgTicket,
            convRate: state.conversionRate,
            notifDailyEnabled: state.reportFreq !== 'weekly',
            notifWeeklyEnabled: state.reportFreq !== 'daily',
            notifDailyTime: state.reportTime,
            notifWeeklyTime: state.reportTime,
          },
        }),
      })
      if (!settingsRes.ok) throw new Error('Erro ao salvar dados da empresa')
      const { organization } = await settingsRes.json()

      for (const agent of state.agents) {
        await fetch('/api/team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: agent.name, email: agent.email, role: 'atendente' }),
        })
      }

      setCurrentOrganization({
        id: organization.id,
        name: organization.name,
        displayName: organization.displayName,
        segment: organization.segment,
        timezone: organization.timezone,
        currency: organization.currency,
        status: organization.status,
        phone: organization.phone,
        adminEmail: organization.adminEmail,
        logoUrl: organization.logoUrl,
        website: organization.website,
      })
      setActivated(true)
      writeDraft(email, null) // ativou: a próxima vez começa do zero
      toast.success('Organização ativada com sucesso!')
      setView('dashboard')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao ativar organização')
    } finally {
      setActivating(false)
    }
  }

  // Resumo lateral: o que já foi preenchido em cada etapa (só dados digitados aqui)
  const summary: Record<string, string> = {
    empresa: state.orgName ? `${state.orgName}${state.segment ? ` · ${state.segment}` : ''}` : 'Pendente',
    horario: `${DAYS.filter((d) => state.businessHours[d.key].active).length} dias com atendimento`,
    meta: valuePerConversation ? `R$ ${valuePerConversation} por conversa` : 'Pendente',
    whatsapp: state.whatsappConnected ? 'Conectado' : 'Não conectado',
    equipe: state.agents.length === 0 ? 'Nenhum atendente' : state.agents.length === 1 ? '1 atendente' : `${state.agents.length} atendentes`,
    relatorio: `${REPORT_FREQ[state.reportFreq]} às ${state.reportTime}`,
    revisao: 'Ativar organização',
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <div className="campo">
              <label htmlFor="orgName">Nome da empresa</label>
              <div className="campo-ic">
                <Building2 className="ic" aria-hidden="true" />
                <input className="entrada entrada--grande" id="orgName" placeholder="Ex.: Minha Empresa Ltda." value={state.orgName} onChange={(e) => update({ orgName: e.target.value })} />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="orgSegment">Segmento de atuação</label>
              <div className="campo-ic">
                <Tag className="ic" aria-hidden="true" />
                <select className="selecao entrada--grande" id="orgSegment" value={state.segment} onChange={(e) => update({ segment: e.target.value })}>
                  <option value="">Selecione o segmento da sua empresa</option>
                  {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="campo">
              <label htmlFor="orgTimezone">Fuso horário</label>
              <div className="campo-ic">
                <Globe className="ic" aria-hidden="true" />
                <select className="selecao entrada--grande" id="orgTimezone" value={state.timezone} onChange={(e) => update({ timezone: e.target.value })}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tzLabel(tz)}</option>)}
                </select>
              </div>
            </div>
          </>
        )

      case 1:
        return (
          <ul className="lista-membros">
            {DAYS.map((d) => {
              const h = state.businessHours[d.key]
              return (
                <li key={d.key} className="grid-cols-[minmax(84px,auto)_1fr] gap-y-2">
                  <label className="flex items-center gap-2.5 font-semibold">
                    <input type="checkbox" className="size-[18px] accent-[var(--verde-600)]" checked={h.active} onChange={(e) => updateHours(d.key, 'active', e.target.checked)} />
                    {d.label}
                  </label>
                  {h.active ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="time" className="entrada w-32" aria-label={`Início do atendimento (${d.label})`} value={h.start} onChange={(e) => updateHours(d.key, 'start', e.target.value)} />
                      <span className="text-sm text-[var(--suave)]">até</span>
                      <input type="time" className="entrada w-32" aria-label={`Fim do atendimento (${d.label})`} value={h.end} onChange={(e) => updateHours(d.key, 'end', e.target.value)} />
                    </div>
                  ) : (
                    <span className="text-sm text-[var(--suave)]">Sem atendimento</span>
                  )}
                </li>
              )
            })}
          </ul>
        )

      case 2:
        return (
          <>
            <div className="grade-form">
              <div className="campo">
                <label htmlFor="avgTicket">Ticket médio (R$)</label>
                <div className="campo-ic">
                  <DollarSign className="ic" aria-hidden="true" />
                  <input className="entrada entrada--grande" id="avgTicket" placeholder="Ex.: 350,00" {...moneyProps(state.avgTicket, (v) => update({ avgTicket: v }))} />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="convRate">Taxa de conversão esperada (%)</label>
                <input className="entrada entrada--grande" id="convRate" type="number" min="0" max="100" placeholder="Ex.: 25" value={state.conversionRate} onChange={(e) => update({ conversionRate: e.target.value })} />
              </div>
            </div>
            {valuePerConversation && (
              <div className="hoje-zero">
                <DollarSign className="ic" aria-hidden="true" />
                <span><b>R$ {valuePerConversation}</b><span>Valor potencial por conversa</span></span>
              </div>
            )}
          </>
        )

      case 3:
        return (
          <div className="qr-onb">
            <div className="grid aspect-square w-full max-w-[220px] place-items-center rounded-2xl border-2 border-dashed border-[var(--borda-forte)] bg-[var(--superficie-2)]">
              {state.whatsappConnected
                ? <CheckCircle2 className="ic text-[72px] text-[var(--verde-600)]" aria-hidden="true" />
                : <QrCode className="ic text-[96px] text-[var(--muito-suave)]" aria-hidden="true" />}
            </div>
            <div className="grid justify-items-start gap-4">
              <p className="text-[var(--texto-2)]">
                A conexão é feita na tela Conexões: gere o QR Code e escaneie com o WhatsApp Business. Você pode seguir o assistente e conectar depois.
              </p>
              {state.whatsappConnected ? (
                <span className="status-qr ok" role="status"><CheckCircle2 className="ic" aria-hidden="true" />WhatsApp conectado.</span>
              ) : (
                <span className="status-qr" role="status">
                  <QrCode className="ic" aria-hidden="true" />
                  {checkingWhatsapp ? 'Verificando conexões…' : 'Nenhum WhatsApp conectado ainda.'}
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn--lg" onClick={() => setView('connections')}>
                  <QrCode className="ic" aria-hidden="true" />Abrir Conexões
                </button>
                <button type="button" className="btn btn--lg" onClick={checkWhatsapp} disabled={checkingWhatsapp}>
                  <RefreshCw className={checkingWhatsapp ? 'ic girando' : 'ic'} aria-hidden="true" />Verificar de novo
                </button>
              </div>
            </div>
          </div>
        )

      case 4:
        return (
          <>
            <form
              className="grade-form items-end md:grid-cols-[1fr_1fr_auto]"
              onSubmit={(e) => { e.preventDefault(); addAgent() }}
            >
              <div className="campo">
                <label htmlFor="agentName">Nome</label>
                <input className="entrada" id="agentName" placeholder="Nome do atendente" value={agentNameInput} onChange={(e) => setAgentNameInput(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="agentEmail">E-mail</label>
                <input className="entrada" id="agentEmail" type="email" placeholder="atendente@empresa.com.br" value={agentEmailInput} onChange={(e) => setAgentEmailInput(e.target.value)} />
              </div>
              <button type="submit" className="btn btn--lg h-[46px]" disabled={!agentNameInput.trim() || !agentEmailInput.trim()}>
                <Plus className="ic" aria-hidden="true" />Adicionar
              </button>
            </form>
            {state.agents.length === 0 ? (
              <p className="info-campo">Nenhum atendente adicionado ainda.</p>
            ) : (
              <ul className="lista-membros">
                {state.agents.map((agent) => (
                  <li key={agent.email}>
                    <span className="av av--verde" aria-hidden="true">{initials(agent.name)}</span>
                    <span className="min-w-0"><b>{agent.name}</b><br /><small className="suave break-all">{agent.email}</small></span>
                    <span className="tag tag--verde">Atendente</span>
                    <button type="button" className="btn btn--sm" onClick={() => removeAgent(agent.email)} aria-label={`Remover ${agent.name}`}>
                      <Trash2 className="ic" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )

      case 5:
        return (
          <>
            <div className="grade-form">
              <div className="campo">
                <label htmlFor="reportFreq">Frequência do relatório</label>
                <select className="selecao" id="reportFreq" value={state.reportFreq} onChange={(e) => update({ reportFreq: e.target.value as OnboardingState['reportFreq'] })}>
                  {Object.entries(REPORT_FREQ).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="reportTime">Horário de envio</label>
                <input className="entrada" id="reportTime" type="time" value={state.reportTime} onChange={(e) => update({ reportTime: e.target.value })} />
              </div>
            </div>
            {(state.reportFreq === 'weekly' || state.reportFreq === 'daily+weekly') && (
              <div className="campo">
                <label htmlFor="reportWeekDay">Dia do relatório semanal</label>
                <select className="selecao" id="reportWeekDay" value={state.reportWeekDay} onChange={(e) => update({ reportWeekDay: e.target.value })}>
                  {DAYS.filter((d) => d.key !== 'dom').map((d) => <option key={d.key} value={d.key}>{d.label}-feira</option>)}
                </select>
              </div>
            )}
          </>
        )

      case 6:
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <SummaryCard title="Empresa" items={[
                { label: 'Nome', value: state.orgName || '—' },
                { label: 'Segmento', value: state.segment || '—' },
                { label: 'Fuso', value: tzLabel(state.timezone) },
              ]} />
              <SummaryCard title="Meta" items={[
                { label: 'Ticket médio', value: state.avgTicket ? `R$ ${parseFloat(state.avgTicket).toFixed(2)}` : '—' },
                { label: 'Taxa de conversão', value: state.conversionRate ? `${state.conversionRate}%` : '—' },
                { label: 'Valor por conversa', value: valuePerConversation ? `R$ ${valuePerConversation}` : '—' },
              ]} />
              <SummaryCard title="WhatsApp" items={[
                { label: 'Status', value: state.whatsappConnected ? 'Conectado' : 'Não conectado' },
              ]} />
              <SummaryCard title="Equipe" items={[
                { label: 'Atendentes', value: state.agents.length > 0 ? state.agents.map((a) => a.name).join(', ') : 'Nenhum' },
              ]} />
              <SummaryCard title="Relatórios" items={[
                { label: 'Frequência', value: REPORT_FREQ[state.reportFreq] },
                { label: 'Horário', value: state.reportTime },
              ]} />
            </div>
            <button
              type="button"
              className="btn btn--verde btn--xl btn--bloco"
              onClick={handleActivate}
              disabled={!state.orgName || !state.segment || activating}
            >
              <Zap className="ic" aria-hidden="true" />
              {activating ? 'Ativando...' : 'Ativar organização'}
            </button>
          </>
        )

      default:
        return null
    }
  }

  const current = STEPS[step]

  return (
    <div className="conta">
      <div className="conta-cartao onboarding mt-0">
        <ol className="etapas" aria-label="Etapas">
          {STEPS.map((s, i) => {
            const active = i === step
            const done = i < step
            return (
              <li key={s.id} className={`etapa min-w-0 flex-1 w-auto${active ? ' atual' : ''}${done ? ' feita' : ''}`} aria-current={active ? 'step' : undefined}>
                <button
                  type="button"
                  className="grid justify-items-center gap-2 border-0 bg-transparent p-0 text-inherit disabled:cursor-default"
                  onClick={() => setStep(i)}
                  disabled={i > step}
                  aria-label={`Etapa ${i + 1}: ${s.label}`}
                >
                  <span className="etapa__num" aria-hidden="true">{done ? <CheckCircle2 className="ic" /> : i + 1}</span>
                  <span className="hidden text-center md:inline" aria-hidden="true">{s.label}</span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="onboarding__corpo">
          <div className="onboarding__form">
            <div>
              <h1>{current.title[0]}<span className="verde">{current.title[1]}</span>{current.title[2] ?? ''}</h1>
              <p className="sub-conta mt-1.5">{current.sub}</p>
            </div>

            {renderStep()}

            <div className="grade-form">
              <button type="button" className="btn btn--xl" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
                <ArrowLeft className="ic" aria-hidden="true" />Voltar
              </button>
              {step < STEPS.length - 1 && (
                <button type="button" className="btn btn--verde btn--xl" onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
                  Próximo <ArrowRight className="ic" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <aside className="onboarding__lado" aria-label="Resumo da configuração">
            <div className="plano-topo">
              <span className="coroa"><Rocket className="ic" aria-hidden="true" /></span>
              <div>
                <small>Configuração inicial</small>
                <b>Etapa {step + 1} de {STEPS.length}</b>
                <p>Complete as etapas para configurar sua organização.</p>
              </div>
            </div>
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const done = i < step
              return (
                <div key={s.id} className="ok-item">
                  <span className={`bola${done ? '' : ' bg-[var(--superficie-3)] text-[var(--suave)]'}`}>
                    {done ? <CheckCircle2 className="ic" aria-hidden="true" /> : <Icon className="ic" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <b>{s.label}{done && <span className="sr-only"> (concluída)</span>}</b>
                    <span className="block truncate" title={summary[s.id]}>{summary[s.id]}</span>
                  </span>
                </div>
              )
            })}
          </aside>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return (
    <section className="rounded-2xl border border-[var(--borda)] bg-[var(--superficie)] p-4">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      <dl className="grid gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between gap-3 text-sm">
            <dt className="text-[var(--suave)]">{item.label}</dt>
            <dd className="max-w-[60%] truncate text-right font-medium" title={item.value}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
