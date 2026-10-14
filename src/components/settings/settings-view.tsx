'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Building2, Clock, Headphones, DollarSign, Brain, Bell, Shield, ShieldCheck, History,
  Save, Plus, Trash2, X, Sparkles, WandSparkles, CircleAlert, Globe, Layers,
  AudioLines, Calendar, Users, Moon, EyeOff, Download, ArrowRight, Package, Percent, Webhook,
} from 'lucide-react'
import { AuditLog } from './audit-log'
import { WebhookSettings } from './webhook-settings'
import { DangerZone } from './danger-zone'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import { mutate } from '@/lib/mutation'
import { tourSignal } from '@/lib/system-tour/signals'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
// Ordem de exibição: segunda a domingo (as chaves continuam 0 = domingo ... 6 = sábado)
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

const BR_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Belem', label: 'Belém (GMT-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife', label: 'Recife (GMT-3)' },
  { value: 'America/Araguaina', label: 'Araguaína (GMT-3)' },
  { value: 'America/Bahia', label: 'Bahia (GMT-3)' },
  { value: 'America/Maceio', label: 'Maceió (GMT-3)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (GMT-4)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (GMT-4)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (GMT-4)' },
  { value: 'America/Paramaribo', label: 'Paramaribo (GMT-3)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (GMT-2)' },
]

const SEGMENTS = [
  'clinica_odontologica', 'clinica_medica', 'varejo', 'e_commerce', 'imobiliaria',
  'educacao', 'automotivo', 'financeiro', 'juridico', 'restaurante', 'spa_beleza', 'outro',
]

const SEGMENT_LABELS: Record<string, string> = {
  clinica_odontologica: 'Clínica Odontológica', clinica_medica: 'Clínica Médica',
  varejo: 'Varejo', e_commerce: 'E-commerce', imobiliaria: 'Imobiliária',
  educacao: 'Educação', automotivo: 'Automotivo', financeiro: 'Financeiro',
  juridico: 'Jurídico', restaurante: 'Restaurante', spa_beleza: 'Spa/Beleza', outro: 'Outro',
}

const SEVERITY: Record<string, { label: string; tag: string }> = {
  critical: { label: 'Crítica', tag: 'tag--vermelho' },
  high: { label: 'Alta', tag: 'tag--laranja' },
  medium: { label: 'Média', tag: 'tag--ambar' },
  low: { label: 'Baixa', tag: 'tag--cinza' },
}

// ── Peças visuais do pacote (Configurações) ────────────────────────────────

function Interruptor({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="interruptor">
      <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  )
}

function SecaoCab({ icon, title, children, id }: { icon: ReactNode; title: string; children?: ReactNode; id?: string }) {
  return (
    <header className="secao-config__cab">
      <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true">{icon}</span>
      <div><h2 id={id}>{title}</h2>{children && <p>{children}</p>}</div>
    </header>
  )
}

function SaveButton({ saving, label = 'Salvar' }: { saving?: boolean; label?: string }) {
  return (
    <button className="btn btn--escuro btn--lg" type="submit" disabled={saving}>
      <Save className="ic" aria-hidden="true" />
      {saving ? 'Salvando...' : label}
    </button>
  )
}

function Rodape({ saving, label }: { saving?: boolean; label?: string }) {
  return <footer className="secao-config__rodape"><SaveButton saving={saving} label={label} /></footer>
}

function Opcao({ icon, tone, title, desc, checked, onChange }: { icon: ReactNode; tone: string; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="opcao form-grade__todo">
      <span className={`dado-ic ${tone}`} aria-hidden="true">{icon}</span>
      <div><b>{title}</b><p className="suave">{desc}</p></div>
      <Interruptor checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

export default function SettingsView() {
  const { setView } = useAppStore()
  // --- Empresa ---
  const [isLoading, setIsLoading] = useState(true)
  const [empName, setEmpName] = useState('')
  const [empDisplay, setEmpDisplay] = useState('')
  const [empCnpj, setEmpCnpj] = useState('')
  const [empSegment, setEmpSegment] = useState('')
  const [empSite, setEmpSite] = useState('')
  const [empPhone, setEmpPhone] = useState('')
  const [empEmail, setEmpEmail] = useState('')
  const [empTimezone, setEmpTimezone] = useState('America/Sao_Paulo')
  const [rulesData, setRulesData] = useState<any[]>([])

  const [savingTab, setSavingTab] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings').then(r => (r.ok ? r.json() : Promise.resolve({})) as Promise<any>).then(data => {
      if (data.organization) {
        setEmpName(data.organization.name || '')
        setEmpDisplay(data.organization.displayName || '')
        setEmpCnpj(data.organization.cnpj || '')
        setEmpSegment(data.organization.segment || '')
        setEmpSite(data.organization.website || '')
        setEmpPhone(data.organization.phone || '')
        setEmpEmail(data.organization.adminEmail || '')
        setEmpTimezone(data.organization.timezone || 'America/Sao_Paulo')
      }
      const s = data.settings || {}
      if (s.businessHours) setBusinessHours(prev => ({ ...prev, ...s.businessHours }))
      if (s.holidays !== undefined) setHolidays(s.holidays)
      if (s.toleranceBefore !== undefined) setToleranceBefore(s.toleranceBefore)
      if (s.toleranceAfter !== undefined) setToleranceAfter(s.toleranceAfter)
      if (s.outsideRule !== undefined) setOutsideRule(s.outsideRule)
      if (s.slaFirst !== undefined) setSlaFirst(s.slaFirst)
      if (s.slaContinuity !== undefined) setSlaContinuity(s.slaContinuity)
      if (s.abandonTime !== undefined) setAbandonTime(s.abandonTime)
      if (s.reopenWindow !== undefined) setReopenWindow(s.reopenWindow)
      if (s.inactivityClose !== undefined) setInactivityClose(s.inactivityClose)
      if (s.avgTicket !== undefined) setAvgTicket(s.avgTicket)
      if (s.convRate !== undefined) setConvRate(s.convRate)
      if (s.products) setProducts(s.products)
      if (s.intentions) setIntentions(s.intentions)
      if (s.minSample !== undefined) setMinSample(s.minSample)
      if (s.opportunityCeiling !== undefined) setOpportunityCeiling(s.opportunityCeiling)
      if (s.showEstimates !== undefined) setShowEstimates(s.showEstimates)
      if (s.aiSegment !== undefined) setAiSegment(s.aiSegment)
      if (s.aiTerms !== undefined) setAiTerms(s.aiTerms)
      if (s.aiConfidence) setAiConfidence(s.aiConfidence)
      if (s.aiAudio !== undefined) setAiAudio(s.aiAudio)
      if (s.aiMasking !== undefined) setAiMasking(s.aiMasking)
      if (s.notifImmediate !== undefined) setNotifImmediate(s.notifImmediate)
      if (s.notifDigestEnabled !== undefined) setNotifDigestEnabled(s.notifDigestEnabled)
      if (s.notifDigestFreq !== undefined) setNotifDigestFreq(s.notifDigestFreq)
      if (s.notifRecipients) setNotifRecipients(s.notifRecipients)
      if (s.silenceStart !== undefined) setSilenceStart(s.silenceStart)
      if (s.silenceEnd !== undefined) setSilenceEnd(s.silenceEnd)
      if (s.retContent !== undefined) setRetContent(s.retContent)
      // sem destinatários salvos: começa pelo e-mail do responsável da empresa
      if (!s.notifRecipients && data.organization?.adminEmail) setNotifRecipients([data.organization.adminEmail])
      if (s.retMetadata !== undefined) setRetMetadata(s.retMetadata)
      if (s.retAttachments !== undefined) setRetAttachments(s.retAttachments)
      if (s.privMasking !== undefined) setPrivMasking(s.privMasking)
      if (s.privExport !== undefined) setPrivExport(s.privExport)
      if (s.privExcluded !== undefined) setPrivExcluded(s.privExcluded)
      if (s.privLegalBasis !== undefined) setPrivLegalBasis(s.privLegalBasis)
      if (s.privDPO !== undefined) setPrivDPO(s.privDPO)
    }).catch(() => {})
    fetch('/api/alert-rules').then(r => (r.ok ? r.json() : Promise.resolve({})) as Promise<any>).then(data => {
      setRulesData(data.rules || [])
    }).catch(() => {}).finally(() => setIsLoading(false))
  }, [])

  const saveOrganization = async () => {
    setSavingTab('empresa')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: empName, displayName: empDisplay, cnpj: empCnpj, segment: empSegment,
          website: empSite, phone: empPhone, adminEmail: empEmail, timezone: empTimezone,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(typeof err?.error === 'string' ? err.error : '')
      }
      toast.success('Dados da empresa salvos.')
      tourSignal('settings.saved')
    } catch (e) {
      toast.error((e instanceof Error && e.message) || 'Não foi possível salvar os dados da empresa.')
    } finally {
      setSavingTab(null)
    }
  }

  const saveSettingsSlice = async (tab: string, settings: Record<string, unknown>, label: string) => {
    setSavingTab(tab)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${label} salvo${label.endsWith('a') ? 'a' : 'o'}.`)
      tourSignal('settings.saved')
    } catch {
      toast.error(`Não foi possível salvar: ${label}.`)
    } finally {
      setSavingTab(null)
    }
  }
  const [empCurrency] = useState('BRL')
  const [empLang] = useState('pt-BR')

  // --- Horários ---
  const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string; enabled: boolean }>>({
    '0': { open: '', close: '', enabled: false },
    '1': { open: '08:00', close: '18:00', enabled: true },
    '2': { open: '08:00', close: '18:00', enabled: true },
    '3': { open: '08:00', close: '18:00', enabled: true },
    '4': { open: '08:00', close: '18:00', enabled: true },
    '5': { open: '08:00', close: '18:00', enabled: true },
    '6': { open: '', close: '', enabled: false },
  })
  const [holidays, setHolidays] = useState('')
  const [toleranceBefore, setToleranceBefore] = useState('10')
  const [toleranceAfter, setToleranceAfter] = useState('30')
  const [outsideRule, setOutsideRule] = useState('ignora')

  // --- Atendimento ---
  const [slaFirst, setSlaFirst] = useState('10')
  const [slaContinuity, setSlaContinuity] = useState('30')
  const [abandonTime, setAbandonTime] = useState('4')
  const [reopenWindow, setReopenWindow] = useState('72')
  const [inactivityClose, setInactivityClose] = useState('48')

  // --- Financeiro ---
  const [avgTicket, setAvgTicket] = useState('1500')
  const [convRate, setConvRate] = useState('18')
  const [products, setProducts] = useState<Array<{ name: string; value: string }>>([])
  const [intentions, setIntentions] = useState<Array<{ name: string; probability: string }>>([])
  const [minSample, setMinSample] = useState('5')
  const [opportunityCeiling, setOpportunityCeiling] = useState('')
  const [showEstimates, setShowEstimates] = useState(true)

  // --- IA ---
  const [aiLang] = useState('pt-BR')
  const [aiSegment, setAiSegment] = useState('')
  const [aiTerms, setAiTerms] = useState('')
  const [aiConfidence, setAiConfidence] = useState([0.55])
  const [aiAudio, setAiAudio] = useState(false)
  const [aiMasking, setAiMasking] = useState(true)

  // --- Notificações ---
  const [notifImmediate, setNotifImmediate] = useState(true)
  const [notifDigestEnabled, setNotifDigestEnabled] = useState(true)
  const [notifDigestFreq, setNotifDigestFreq] = useState('15')
  const [notifRecipients, setNotifRecipients] = useState<string[]>([])
  const [newRecipient, setNewRecipient] = useState('')
  // em branco = silêncio fora do horário de atendimento (src/lib/alert-email.ts)
  const [silenceStart, setSilenceStart] = useState('')
  const [silenceEnd, setSilenceEnd] = useState('')

  // --- Privacidade ---
  const [retContent, setRetContent] = useState('365')
  const [retMetadata, setRetMetadata] = useState('730')
  const [retAttachments, setRetAttachments] = useState('90')
  const [privMasking, setPrivMasking] = useState(true)
  const [privExport, setPrivExport] = useState(true)
  const [privExcluded, setPrivExcluded] = useState('')
  const [privLegalBasis, setPrivLegalBasis] = useState('legitimo_interesse')
  const [privDPO, setPrivDPO] = useState('')

  const addRecipient = () => {
    const v = newRecipient.trim()
    if (v && !notifRecipients.includes(v)) {
      setNotifRecipients([...notifRecipients, v])
      setNewRecipient('')
    }
  }
  const removeRecipient = (r: string) => {
    setNotifRecipients(notifRecipients.filter(x => x !== r))
  }
  const addProduct = () => setProducts([...products, { name: '', value: '' }])
  const removeProduct = (i: number) => setProducts(products.filter((_, idx) => idx !== i))
  const updateProduct = (i: number, field: 'name' | 'value', val: string) => {
    const updated = [...products]
    updated[i] = { ...updated[i], [field]: val }
    setProducts(updated)
  }
  const addIntention = () => setIntentions([...intentions, { name: '', probability: '' }])
  const removeIntention = (i: number) => setIntentions(intentions.filter((_, idx) => idx !== i))
  const updateIntention = (i: number, field: 'name' | 'probability', val: string) => {
    const updated = [...intentions]
    updated[i] = { ...updated[i], [field]: val }
    setIntentions(updated)
  }
  const updateBH = (day: string, field: 'open' | 'close' | 'enabled', val: string | boolean) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: val },
    }))
  }

  const toggleRule = (id: string, checked: boolean) => {
    void mutate(`/api/alert-rules/${id}`, {
      method: 'PUT',
      json: { active: checked },
    }, {
      onSettled: () => fetch('/api/alert-rules').then(r => (r.ok ? r.json() : Promise.resolve({})) as Promise<any>).then(d => setRulesData(d.rules || [])).catch(() => {}),
    })
  }

  const confidencePct = Math.round(aiConfidence[0] * 100)

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <div>
            <h1>Configurações</h1>
            <p>Gerencie as configurações da organização e do sistema.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="empresa" className="w-full gap-[18px]">
        <TabsList data-tour="settings-tabs" aria-label="Seções de configuração" className="abas-config">
          <TabsTrigger value="empresa"><Building2 className="ic" aria-hidden="true" />Empresa</TabsTrigger>
          <TabsTrigger value="horarios"><Clock className="ic" aria-hidden="true" />Horários</TabsTrigger>
          <TabsTrigger value="atendimento"><Headphones className="ic" aria-hidden="true" />Atendimento</TabsTrigger>
          <TabsTrigger value="financeiro"><DollarSign className="ic" aria-hidden="true" />Financeiro</TabsTrigger>
          <TabsTrigger value="ia"><Brain className="ic" aria-hidden="true" />Análise</TabsTrigger>
          <TabsTrigger value="notificacoes"><Bell className="ic" aria-hidden="true" />Notificações</TabsTrigger>
          <TabsTrigger value="privacidade" data-tour="settings-tab-privacy"><Shield className="ic" aria-hidden="true" />Privacidade</TabsTrigger>
          <TabsTrigger value="regras"><ShieldCheck className="ic" aria-hidden="true" />Regras</TabsTrigger>
          <TabsTrigger value="webhook"><Webhook className="ic" aria-hidden="true" />Webhook</TabsTrigger>
          <TabsTrigger value="auditoria"><History className="ic" aria-hidden="true" />Auditoria</TabsTrigger>
        </TabsList>

        {/* ====== EMPRESA ====== */}
        <TabsContent value="empresa" className="painel-config">
          <form className="cartao secao-config" onSubmit={(e) => { e.preventDefault(); void saveOrganization() }}>
            <SecaoCab icon={<Building2 className="ic" />} title="Dados da Empresa">Informações cadastrais da organização.</SecaoCab>
            <div className="form-grade">
              <div className="campo">
                <label htmlFor="c-razao">Nome empresarial</label>
                <input className="entrada" id="c-razao" value={empName} onChange={e => setEmpName(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="c-exibicao">Nome de exibição</label>
                <input className="entrada" id="c-exibicao" value={empDisplay} onChange={e => setEmpDisplay(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="c-cnpj">CNPJ</label>
                <input className="entrada mono" id="c-cnpj" inputMode="numeric" value={empCnpj} onChange={e => setEmpCnpj(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="c-seg">Segmento</label>
                <select className="selecao" id="c-seg" value={empSegment} onChange={e => setEmpSegment(e.target.value)}>
                  {!empSegment && <option value="">Selecione o segmento</option>}
                  {SEGMENTS.map(s => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="c-site">Site</label>
                <input className="entrada" id="c-site" type="url" value={empSite} onChange={e => setEmpSite(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="c-tel">Telefone</label>
                <input className="entrada" id="c-tel" type="tel" value={empPhone} onChange={e => setEmpPhone(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="c-email">E-mail do administrador</label>
                <input className="entrada" id="c-email" type="email" value={empEmail} onChange={e => setEmpEmail(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="c-fuso">Fuso horário</label>
                <select className="selecao" id="c-fuso" value={empTimezone} onChange={e => setEmpTimezone(e.target.value)}>
                  {BR_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="c-moeda">Moeda</label>
                <input className="entrada" id="c-moeda" value={empCurrency} readOnly />
              </div>
              <div className="campo">
                <label htmlFor="c-idioma">Idioma</label>
                <input className="entrada" id="c-idioma" value={empLang} readOnly />
              </div>
            </div>
            <Rodape saving={savingTab === 'empresa'} label="Salvar alterações" />
          </form>

          <section className="cartao secao-config secao-config--linha" aria-labelledby="t-onboarding">
            <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><WandSparkles className="ic" /></span>
            <div><h2 id="t-onboarding">Configuração inicial</h2><p className="suave">Refaça o assistente de configuração para revisar horários, metas, WhatsApp e equipe.</p></div>
            <button className="btn btn--lg" type="button" onClick={() => setView('onboarding')}>
              <Sparkles className="ic" aria-hidden="true" />Refazer onboarding
            </button>
          </section>
        </TabsContent>

        {/* ====== HORÁRIOS ====== */}
        <TabsContent value="horarios">
          <form
            className="cartao secao-config"
            onSubmit={(e) => { e.preventDefault(); void saveSettingsSlice('horarios', { businessHours, holidays, toleranceBefore, toleranceAfter, outsideRule }, 'Horário comercial') }}
          >
            <SecaoCab icon={<Clock className="ic" />} title="Horário Comercial">
              Vale para alertas e para a nota das conversas: fora do expediente, em fim de semana e em feriado o tempo de espera do cliente não conta (conforme a regra abaixo). Fuso horário: o da aba Empresa.
            </SecaoCab>
            <div className="horarios">
              {WEEK_ORDER.map((idx) => {
                const key = String(idx)
                const d = businessHours[key]
                const day = WEEKDAYS[idx]
                const dayLower = day.toLowerCase()
                return (
                  <div className="horario" key={key}>
                    <Interruptor checked={d.enabled} onChange={(v) => updateBH(key, 'enabled', v)} label={`Atende ${dayLower}`} />
                    <b>{day}</b>
                    <input className="entrada" type="time" value={d.open} onChange={(e) => updateBH(key, 'open', e.target.value)} disabled={!d.enabled} aria-label={`Início ${dayLower}`} />
                    <span className="suave">até</span>
                    <input className="entrada" type="time" value={d.close} onChange={(e) => updateBH(key, 'close', e.target.value)} disabled={!d.enabled} aria-label={`Fim ${dayLower}`} />
                  </div>
                )
              })}
            </div>

            <div className="form-grade mt-6 border-t border-[var(--borda)] pt-5">
              <div className="campo form-grade__todo">
                <label htmlFor="h-feriados">Feriados (uma por linha: DD/MM/AAAA - Descrição)</label>
                <textarea className="area mono" id="h-feriados" rows={6} value={holidays} onChange={e => setHolidays(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="h-tol-antes">Tolerância antes do horário (min)</label>
                <input className="entrada" id="h-tol-antes" type="number" value={toleranceBefore} onChange={e => setToleranceBefore(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="h-tol-depois">Tolerância depois do horário (min)</label>
                <input className="entrada" id="h-tol-depois" type="number" value={toleranceAfter} onChange={e => setToleranceAfter(e.target.value)} />
              </div>
              <div className="campo form-grade__todo">
                <label htmlFor="h-fora">Regra para fora do expediente</label>
                <select className="selecao" id="h-fora" value={outsideRule} onChange={e => setOutsideRule(e.target.value)}>
                  <option value="ignora">Ignora (alertas e nota só contam o expediente)</option>
                  <option value="atraso">Conta como atraso (tempo corrido, 24 h)</option>
                  <option value="alerta">Alerta em tempo corrido, mas a nota não pune</option>
                </select>
              </div>
            </div>
            <Rodape saving={savingTab === 'horarios'} />
          </form>
        </TabsContent>

        {/* ====== ATENDIMENTO ====== */}
        <TabsContent value="atendimento">
          <form
            className="cartao secao-config"
            onSubmit={(e) => { e.preventDefault(); void saveSettingsSlice('atendimento', { slaFirst, slaContinuity, abandonTime, reopenWindow, inactivityClose }, 'Parâmetros de atendimento') }}
          >
            <SecaoCab icon={<Headphones className="ic" />} title="Parâmetros de Atendimento">
              O SLA define as faixas da nota da conversa (responder em até metade do SLA = nota máxima; 12× o SLA = zero). Abandono, inatividade e reabertura encerram e reabrem conversas sozinhos, em horas corridas.
            </SecaoCab>
            <div className="form-grade">
              <div className="campo">
                <label htmlFor="m-sla">SLA primeira resposta (minutos)</label>
                <input className="entrada" id="m-sla" type="number" min={1} value={slaFirst} onChange={e => setSlaFirst(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="m-cont">SLA continuidade (minutos)</label>
                <input className="entrada" id="m-cont" type="number" min={1} value={slaContinuity} onChange={e => setSlaContinuity(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="m-abandono">Tempo de abandono (horas)</label>
                <p className="ajuda-campo" id="m-abandono-ajuda">Cliente com oportunidade que não responde vira &quot;perdido por abandono&quot; e entra na Recuperação.</p>
                <input className="entrada" id="m-abandono" type="number" min={1} aria-describedby="m-abandono-ajuda" value={abandonTime} onChange={e => setAbandonTime(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="m-reabre">Janela de reabertura (horas)</label>
                <p className="ajuda-campo" id="m-reabre-ajuda">Mensagem nova neste prazo reabre a mesma conversa (0 = nunca).</p>
                <input className="entrada" id="m-reabre" type="number" min={0} aria-describedby="m-reabre-ajuda" value={reopenWindow} onChange={e => setReopenWindow(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="m-inativ">Encerramento por inatividade (horas)</label>
                <p className="ajuda-campo" id="m-inativ-ajuda">Sem mensagem de ninguém neste prazo, a conversa é encerrada.</p>
                <input className="entrada" id="m-inativ" type="number" min={1} aria-describedby="m-inativ-ajuda" value={inactivityClose} onChange={e => setInactivityClose(e.target.value)} />
              </div>
            </div>
            <Rodape saving={savingTab === 'atendimento'} />
          </form>
        </TabsContent>

        {/* ====== FINANCEIRO ====== */}
        <TabsContent value="financeiro">
          <form
            className="painel-config"
            onSubmit={(e) => { e.preventDefault(); void saveSettingsSlice('financeiro', { avgTicket, convRate, products, intentions, minSample, opportunityCeiling, showEstimates }, 'Parâmetros financeiros') }}
          >
            <section className="cartao secao-config">
              <SecaoCab icon={<DollarSign className="ic" />} title="Parâmetros Financeiros">Valores usados para estimar receita potencial das oportunidades.</SecaoCab>
              <div className="form-grade">
                <div className="campo">
                  <label htmlFor="f-ticket">Ticket médio inicial (R$)</label>
                  <input className="entrada" id="f-ticket" type="number" inputMode="decimal" value={avgTicket} onChange={e => setAvgTicket(e.target.value)} />
                </div>
                <div className="campo">
                  <label htmlFor="f-conv">Taxa de conversão inicial (%)</label>
                  <input className="entrada" id="f-conv" type="number" min={0} max={100} value={convRate} onChange={e => setConvRate(e.target.value)} />
                </div>
                <div className="campo">
                  <label htmlFor="f-amostra">Amostra mínima (vendas)</label>
                  <p className="ajuda-campo" id="f-amostra-ajuda">Com este número de vendas confirmadas (conversas marcadas como ganhas, com valor), o ticket passa a ser a média delas. 0 = usar sempre o ticket acima.</p>
                  <input className="entrada" id="f-amostra" type="number" min={0} aria-describedby="f-amostra-ajuda" value={minSample} onChange={e => setMinSample(e.target.value)} />
                </div>
                <div className="campo">
                  <label htmlFor="f-teto">Teto por oportunidade (R$)</label>
                  <p className="ajuda-campo" id="f-teto-ajuda">Nenhuma oportunidade é estimada acima deste valor. Vazio = sem teto.</p>
                  <input className="entrada" id="f-teto" type="number" min={0} placeholder="Sem teto" aria-describedby="f-teto-ajuda" value={opportunityCeiling} onChange={e => setOpportunityCeiling(e.target.value)} />
                </div>
                <Opcao
                  icon={<DollarSign className="ic" />} tone="tom-verde"
                  title="Exibir estimativas de valor nas conversas"
                  desc="Mostra o valor potencial nas telas de Conversas. Desligado, o valor continua sendo calculado para o painel e os relatórios."
                  checked={showEstimates} onChange={setShowEstimates}
                />
              </div>
            </section>

            <section className="cartao" aria-labelledby="t-produtos">
              <div className="cartao__cab">
                <div>
                  <h2 id="t-produtos"><Package className="ic verde-txt" aria-hidden="true" />Valores por Produto/Serviço</h2>
                  <p>Valores de referência para cálculo automático.</p>
                </div>
                <button className="btn btn--sm" type="button" onClick={addProduct}><Plus className="ic" aria-hidden="true" />Adicionar</button>
              </div>
              <div className="cartao__corpo">
                {products.length === 0 ? (
                  <p className="suave text-[13px]">Nenhum produto ou serviço cadastrado.</p>
                ) : (
                  <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Valores por produto ou serviço">
                    <table className="tabela">
                      <thead><tr><th>Produto/Serviço</th><th className="w-40">Valor (R$)</th><th className="w-12"><span className="sr-only">Ações</span></th></tr></thead>
                      <tbody>
                        {products.map((p, i) => (
                          <tr key={i}>
                            <td><input className="entrada" aria-label={`Nome do produto ${i + 1}`} placeholder="Nome" value={p.name} onChange={e => updateProduct(i, 'name', e.target.value)} /></td>
                            <td><input className="entrada" aria-label={`Valor do produto ${i + 1}`} type="number" value={p.value} onChange={e => updateProduct(i, 'value', e.target.value)} /></td>
                            <td>
                              <button className="reticencias" type="button" aria-label="Excluir" onClick={() => removeProduct(i)}>
                                <Trash2 className="ic" aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="cartao" aria-labelledby="t-intencoes">
              <div className="cartao__cab">
                <div>
                  <h2 id="t-intencoes"><Percent className="ic verde-txt" aria-hidden="true" />Probabilidade por Intenção</h2>
                  <p>Probabilidade padrão de conversão por tipo de intenção.</p>
                </div>
                <button className="btn btn--sm" type="button" onClick={addIntention}><Plus className="ic" aria-hidden="true" />Adicionar</button>
              </div>
              <div className="cartao__corpo">
                {intentions.length === 0 ? (
                  <p className="suave text-[13px]">Nenhuma intenção cadastrada.</p>
                ) : (
                  <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Probabilidade por intenção">
                    <table className="tabela">
                      <thead><tr><th>Intenção</th><th className="w-40">Probabilidade (%)</th><th className="w-12"><span className="sr-only">Ações</span></th></tr></thead>
                      <tbody>
                        {intentions.map((it, i) => (
                          <tr key={i}>
                            <td><input className="entrada" aria-label={`Intenção ${i + 1}`} placeholder="Intenção" value={it.name} onChange={e => updateIntention(i, 'name', e.target.value)} /></td>
                            <td><input className="entrada" aria-label={`Probabilidade da intenção ${i + 1}`} type="number" value={it.probability} onChange={e => updateIntention(i, 'probability', e.target.value)} /></td>
                            <td>
                              <button className="reticencias" type="button" aria-label="Excluir" onClick={() => removeIntention(i)}>
                                <Trash2 className="ic" aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <div className="flex justify-end"><SaveButton saving={savingTab === 'financeiro'} /></div>
          </form>
        </TabsContent>

        {/* ====== ANÁLISE ====== */}
        <TabsContent value="ia">
          <form
            className="cartao secao-config"
            onSubmit={(e) => { e.preventDefault(); void saveSettingsSlice('ia', { aiSegment, aiTerms, aiConfidence, aiAudio, aiMasking }, 'Configurações de IA') }}
          >
            <SecaoCab icon={<Brain className="ic" />} title="Configurações da análise">Ajuste o comportamento da classificação e análise.</SecaoCab>
            <div className="aviso aviso--ambar mb-5" role="note">
              <span className="aviso__ic" aria-hidden="true"><CircleAlert className="ic" /></span>
              <p>
                Hoje a análise usa <b>regras de atendimento (palavras e prazos)</b>, sem inteligência artificial. Os ajustes desta aba
                ainda <b>não têm efeito</b> e serão usados quando a análise por IA for ativada.
              </p>
            </div>
            <div className="form-grade">
              <div className="campo">
                <label htmlFor="a-idioma">Idioma de análise</label>
                <p className="ajuda-campo">Define o idioma usado na classificação e análise das conversas.</p>
                <span className="entrada-ic">
                  <Globe className="ic" aria-hidden="true" />
                  <input className="entrada" id="a-idioma" value={aiLang} readOnly />
                </span>
              </div>
              <div className="campo">
                <label htmlFor="a-seg">Segmento (contexto da IA)</label>
                <p className="ajuda-campo">Seleciona o segmento para fornecer contexto específico à IA.</p>
                <span className="entrada-ic entrada-ic--div">
                  <Layers className="ic" aria-hidden="true" />
                  <select className="selecao" id="a-seg" value={aiSegment} onChange={e => setAiSegment(e.target.value)}>
                    <option value="">Selecione um segmento</option>
                    {SEGMENTS.map(s => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
                  </select>
                </span>
              </div>
              <div className="campo form-grade__todo">
                <label htmlFor="a-termos">Termos e abreviações do setor (um por linha: termo = expansão)</label>
                <p className="ajuda-campo">Cadastre termos, siglas e abreviações específicas do seu setor para melhorar a análise.</p>
                <textarea className="area mono" id="a-termos" rows={6} value={aiTerms} onChange={e => setAiTerms(e.target.value)} />
              </div>
              <div className="campo form-grade__todo confianca">
                <div className="linha-flex entre">
                  <div>
                    <label className="rotulo" htmlFor="a-confianca">Nível mínimo de confiança</label>
                    <p className="ajuda-campo mt-0">Classificações abaixo deste limiar serão marcadas como &quot;baixa confiança&quot;.</p>
                  </div>
                  <output className="tag tag--verde tag--lg forte" htmlFor="a-confianca">{confidencePct}%</output>
                </div>
                <input
                  className="faixa" id="a-confianca" type="range" min={0} max={1} step={0.05}
                  value={aiConfidence[0]}
                  onChange={e => setAiConfidence([Number(e.target.value)])}
                  style={{ ['--p' as string]: `${confidencePct}%` }}
                />
                <div className="linha-flex entre confianca__legenda">
                  <span><b>Mais sensível</b>Classifica mais conversas (pode gerar mais falsos positivos).</span>
                  <span className="text-right"><b>Mais rigoroso</b>Exige maior confiança para classificar.</span>
                </div>
              </div>
              <Opcao
                icon={<AudioLines className="ic" />} tone="tom-azul"
                title="Processamento de áudio" desc="Transcrever e analisar mensagens de áudio."
                checked={aiAudio} onChange={setAiAudio}
              />
              <Opcao
                icon={<Shield className="ic" />} tone="tom-verde"
                title="Mascaramento antes do provedor" desc="Remover dados sensíveis antes de enviar ao provedor de IA."
                checked={aiMasking} onChange={setAiMasking}
              />
            </div>
            <Rodape saving={savingTab === 'ia'} />
          </form>
        </TabsContent>

        {/* ====== NOTIFICAÇÕES ====== */}
        <TabsContent value="notificacoes">
          <form
            className="painel-config"
            onSubmit={(e) => {
              e.preventDefault()
              void saveSettingsSlice('notificacoes', {
                notifImmediate, notifDigestEnabled, notifDigestFreq, notifRecipients, silenceStart, silenceEnd,
              }, 'Preferências de notificação')
            }}
          >
            <section className="cartao secao-notif" aria-labelledby="t-relatorios" data-testid="settings-reports-link">
              <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Calendar className="ic" /></span>
              <div>
                <h2 id="t-relatorios">Relatórios Agendados</h2>
                <p className="suave">
                  O envio automático por e-mail de cada relatório (inclusive o diário e o semanal) é configurado na tela Relatórios: horário, dias da semana e destinatários.
                  No horário escolhido, cada destinatário recebe o resumo com o PDF em anexo.
                </p>
                <button type="button" className="btn btn--sm mt-2" onClick={() => setView('reports')}>
                  <Calendar className="ic" aria-hidden="true" />Configurar envios em Relatórios
                </button>
              </div>
            </section>

            <section className="cartao secao-notif" aria-labelledby="t-alertas">
              <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Bell className="ic" /></span>
              <div>
                <h2 id="t-alertas">Alertas</h2>
                <p className="suave">Os alertas aparecem no sino e na tela Alertas. Regras com o canal e-mail também avisam por e-mail os membros que veem aquele alerta (cada pessoa pode desligar em Meu perfil). O e-mail não traz texto de mensagem nem dados do cliente.</p>
                <div className="notif-item notif-item--entre">
                  <div className="notif-item__corpo"><b>Alertas imediatos</b><small>Alertas críticos chegam por e-mail mesmo no horário de silêncio.</small></div>
                  <Interruptor checked={notifImmediate} onChange={setNotifImmediate} label="Alertas imediatos" />
                </div>
                <div className="notif-item">
                  <Interruptor checked={notifDigestEnabled} onChange={setNotifDigestEnabled} label="Resumo de alertas" />
                  <div className="notif-item__corpo">
                    <b>Resumo de alertas</b><small>No máximo um e-mail por regra a cada intervalo, por pessoa; o que chegar no meio-tempo vai junto no próximo. Desligado, cada alerta vira um e-mail.</small>
                    <div className="notif-item__campos">
                      <div className="campo"><label htmlFor="n-freq">Frequência (minutos)</label><input className="entrada campo-hora" id="n-freq" type="number" min={5} step={5} value={notifDigestFreq} onChange={e => setNotifDigestFreq(e.target.value)} disabled={!notifDigestEnabled} /></div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="cartao secao-notif secao-notif--linha" aria-labelledby="t-destinatarios">
              <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Users className="ic" /></span>
              <div><h2 id="t-destinatarios">Destinatários</h2><p className="suave">Lista guardada para uso futuro. Hoje os alertas por e-mail vão para os membros da equipe que veem o alerta, não para esta lista.</p></div>
              <div className="destinatarios">
                <div className="linha-flex">
                  <label className="sr-only" htmlFor="n-email">Novo e-mail</label>
                  <input
                    className="entrada" id="n-email" type="email" placeholder="email@exemplo.com"
                    value={newRecipient}
                    onChange={e => setNewRecipient(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                  />
                  <button className="btn btn--lg" type="button" onClick={addRecipient}><Plus className="ic" aria-hidden="true" />Adicionar</button>
                </div>
                {notifRecipients.length === 0 ? (
                  <p className="suave text-[12.5px]">Nenhum destinatário adicionado.</p>
                ) : (
                  <ul className="chips">
                    {notifRecipients.map(r => (
                      <li className="chip" key={r}>
                        {r}
                        <button type="button" aria-label={`Remover ${r}`} onClick={() => removeRecipient(r)}><X className="ic" aria-hidden="true" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="cartao secao-notif secao-notif--linha" aria-labelledby="t-silencio">
              <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Moon className="ic" /></span>
              <div><h2 id="t-silencio">Horários de Silêncio</h2><p className="suave">Período sem alertas por e-mail (no fuso da empresa); o que ficar retido chega quando o período acabar. Em branco, vale o período fora do horário de atendimento. Início igual ao fim: sem silêncio.</p></div>
              <div className="linha-flex silencio">
                <div className="campo"><label htmlFor="n-ini">Início</label><input className="entrada campo-hora" id="n-ini" type="time" value={silenceStart} onChange={e => setSilenceStart(e.target.value)} /></div>
                <div className="campo"><label htmlFor="n-fim">Fim</label><input className="entrada campo-hora" id="n-fim" type="time" value={silenceEnd} onChange={e => setSilenceEnd(e.target.value)} /></div>
                <span className="silencio__salvar"><SaveButton saving={savingTab === 'notificacoes'} /></span>
              </div>
            </section>
          </form>
        </TabsContent>

        {/* ====== PRIVACIDADE ====== */}
        <TabsContent value="privacidade" className="painel-config">
          <form
            className="cartao secao-config"
            data-tour="settings-privacy"
            onSubmit={(e) => {
              e.preventDefault()
              void saveSettingsSlice('privacidade', {
                retContent, retMetadata, retAttachments, privMasking, privExport, privExcluded, privLegalBasis, privDPO,
              }, 'Configurações de privacidade')
            }}
          >
            <SecaoCab icon={<Shield className="ic" />} title="Privacidade e Retenção de Dados">Configure a retenção e proteção dos dados processados.</SecaoCab>
            <div className="form-grade">
              <div className="campo">
                <label htmlFor="p-ret-conteudo">Retenção conteúdo (dias)</label>
                <p className="ajuda-campo" id="p-ret-conteudo-ajuda">Depois deste prazo o texto das mensagens é apagado.</p>
                <input className="entrada" id="p-ret-conteudo" type="number" min={1} aria-describedby="p-ret-conteudo-ajuda" value={retContent} onChange={e => setRetContent(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="p-ret-meta">Retenção metadados (dias)</label>
                <p className="ajuda-campo" id="p-ret-meta-ajuda">Vale também para o registro de auditoria.</p>
                <input className="entrada" id="p-ret-meta" type="number" min={1} aria-describedby="p-ret-meta-ajuda" value={retMetadata} onChange={e => setRetMetadata(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="p-ret-anexos">Retenção anexos (dias)</label>
                <p className="ajuda-campo" id="p-ret-anexos-ajuda">Informativo, sem efeito automático: o AtendeRadar não guarda anexos (fotos, áudios, documentos), só o tipo da mensagem.</p>
                <input className="entrada" id="p-ret-anexos" type="number" min={1} aria-describedby="p-ret-anexos-ajuda" value={retAttachments} onChange={e => setRetAttachments(e.target.value)} />
              </div>
              <Opcao
                icon={<EyeOff className="ic" />} tone="tom-verde"
                title="Mascaramento automático" desc="CPF, cartão e CVV são guardados e mostrados mascarados. Desligado, as mensagens novas ficam como chegaram (alertas e achados continuam mascarados)."
                checked={privMasking} onChange={setPrivMasking}
              />
              <Opcao
                icon={<Download className="ic" />} tone="tom-verde"
                title="Exportação pelo titular" desc="Libera, na tela da conversa, o arquivo com os dados de um cliente para entregar a ele (portabilidade). Desligado, a exportação fica bloqueada."
                checked={privExport} onChange={setPrivExport}
              />
              <div className="campo form-grade__todo">
                <label htmlFor="p-excluidos">Números excluídos do monitoramento (um por linha)</label>
                <p className="ajuda-campo" id="p-excluidos-ajuda">Mensagens destes números não são guardadas nem analisadas. Ao salvar, conversas que já existiam com eles saem das telas e os alertas abertos são dispensados. Tirar um número da lista não volta a monitorar o que já foi excluído.</p>
                <textarea className="area mono" id="p-excluidos" rows={3} aria-describedby="p-excluidos-ajuda" placeholder={'11999999999\n11888888888'} value={privExcluded} onChange={e => setPrivExcluded(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="p-base">Base legal</label>
                <p className="ajuda-campo" id="p-base-ajuda">Informativo, sem efeito automático: sai no arquivo exportado para o titular.</p>
                <select className="selecao" id="p-base" aria-describedby="p-base-ajuda" value={privLegalBasis} onChange={e => setPrivLegalBasis(e.target.value)}>
                  <option value="consentimento">Consentimento do titular</option>
                  <option value="legitimo_interesse">Legítimo interesse</option>
                  <option value="obrigacao_legal">Obrigação legal</option>
                  <option value="contrato">Execução de contrato</option>
                </select>
              </div>
              <div className="campo">
                <label htmlFor="p-dpo">Contato do encarregado (DPO)</label>
                <p className="ajuda-campo" id="p-dpo-ajuda">Informativo, sem efeito automático: sai no arquivo exportado para o titular.</p>
                <input className="entrada" id="p-dpo" aria-describedby="p-dpo-ajuda" value={privDPO} onChange={e => setPrivDPO(e.target.value)} />
              </div>
            </div>
            <Rodape saving={savingTab === 'privacidade'} />
          </form>
          <DangerZone />
        </TabsContent>

        {/* ====== REGRAS (da API) ====== */}
        <TabsContent value="regras">
          <section className="cartao" aria-labelledby="t-regras">
            <div className="cartao__cab">
              <div>
                <h2 id="t-regras"><ShieldCheck className="ic verde-txt" aria-hidden="true" />Regras de Alerta</h2>
                <p>Configure quando e como os alertas são gerados. Para criar e editar regras, use a tela Alertas, aba Regras.</p>
              </div>
              <button className="btn" type="button" onClick={() => setView('alerts')}>Abrir regras <ArrowRight className="ic" aria-hidden="true" /></button>
            </div>
            <div className="cartao__corpo">
              {isLoading ? (
                <p className="suave text-[13px]">Carregando…</p>
              ) : rulesData.length === 0 ? (
                <p className="suave text-[13px]">Nenhuma regra de alerta cadastrada.</p>
              ) : (
                <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Regras de alerta">
                  <table className="tabela tabela--folgada">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th className="hidden sm:table-cell">Tipo</th>
                        <th className="centro">Ativa</th>
                        <th>Severidade</th>
                        <th className="hidden md:table-cell">Cooldown</th>
                        <th className="hidden lg:table-cell">Canais</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rulesData.map((rule: any) => {
                        const sev = SEVERITY[rule.severity] ?? { label: rule.severity, tag: 'tag--cinza' }
                        return (
                          <tr key={rule.id}>
                            <td className="forte">{rule.name}</td>
                            <td className="hidden sm:table-cell suave">{rule.type}</td>
                            <td className="centro">
                              <Interruptor checked={!!rule.active} onChange={(v) => toggleRule(rule.id, v)} label={`Regra ${rule.name} ativa`} />
                            </td>
                            <td><span className={`tag ${sev.tag}`}>{sev.label}</span></td>
                            <td className="hidden md:table-cell suave">{rule.cooldownMinutes} min</td>
                            <td className="hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {(rule.channels || []).map((ch: string) => <span key={ch} className="tag tag--cinza">{ch}</span>)}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </TabsContent>

        {/* ====== WEBHOOK ====== */}
        <TabsContent value="webhook">
          <WebhookSettings />
        </TabsContent>

        {/* ====== AUDITORIA ====== */}
        <TabsContent value="auditoria">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </>
  )
}
