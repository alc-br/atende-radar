'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Building2, Clock, DollarSign, QrCode, Users, FileBarChart, CheckCircle2,
  ChevronLeft, ChevronRight, Plus, X, Zap,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'

interface OnboardingState {
  orgName: string
  segment: string
  timezone: string
  businessHours: Record<string, { start: string; end: string; active: boolean }>
  avgTicket: string
  conversionRate: string
  whatsappConnected: boolean
  agents: string[]
  reportFreq: 'daily' | 'weekly' | 'daily+weekly'
  reportTime: string
  reportWeekDay: string
}

const STEPS = [
  { id: 'empresa', label: 'Empresa', icon: Building2 },
  { id: 'horario', label: 'Horário', icon: Clock },
  { id: 'meta', label: 'Meta', icon: DollarSign },
  { id: 'whatsapp', label: 'WhatsApp', icon: QrCode },
  { id: 'equipe', label: 'Equipe', icon: Users },
  { id: 'relatorio', label: 'Relatório', icon: FileBarChart },
  { id: 'revisao', label: 'Revisão', icon: CheckCircle2 },
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

export default function OnboardingView() {
  const { setView, setCurrentOrganization } = useAppStore()
  const [step, setStep] = useState(0)
  const [state, setState] = useState<OnboardingState>(initialState)
  const [agentInput, setAgentInput] = useState('')

  const update = (partial: Partial<OnboardingState>) =>
    setState((prev) => ({ ...prev, ...partial }))

  const updateHours = (day: string, field: 'start' | 'end' | 'active', value: string | boolean) =>
    setState((prev) => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: { ...prev.businessHours[day], [field]: value },
      },
    }))

  const addAgent = () => {
    const name = agentInput.trim()
    if (name && !state.agents.includes(name)) {
      update({ agents: [...state.agents, name] })
      setAgentInput('')
    }
  }
  const removeAgent = (name: string) =>
    update({ agents: state.agents.filter((a) => a !== name) })

  const progress = ((step + 1) / STEPS.length) * 100
  const tzLabel = (tz: string) => tz.replace('America/', '').replace(/_/g, ' ')

  const canNext = () => {
    switch (step) {
      case 0: return state.orgName.trim() !== '' && state.segment !== ''
      case 1: return true
      case 2: return state.avgTicket !== '' && state.conversionRate !== ''
      case 3: return state.whatsappConnected
      case 4: return state.agents.length > 0
      case 5: return true
      default: return true
    }
  }

  const handleActivate = () => {
    setCurrentOrganization({
      id: 'org-1',
      name: state.orgName.toLowerCase().replace(/\s+/g, '-'),
      displayName: state.orgName,
      segment: state.segment,
      timezone: state.timezone,
      currency: 'BRL',
      status: 'active',
      phone: '',
      adminEmail: '',
      logoUrl: null,
      website: null,
    })
    toast.success('Organização ativada com sucesso!')
    setView('dashboard')
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Nome da empresa</Label>
              <Input
                id="orgName"
                placeholder="Ex: Minha Empresa LTDA"
                value={state.orgName}
                onChange={(e) => update({ orgName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Segmento de atuação</Label>
              <Select value={state.segment} onValueChange={(v) => update({ segment: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o segmento" /></SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fuso horário</Label>
              <Select value={state.timezone} onValueChange={(v) => update({ timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tzLabel(tz)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 1:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Defina o horário comercial de cada dia da semana.</p>
            <div className="space-y-2">
              {DAYS.map((d) => {
                const h = state.businessHours[d.key]
                return (
                  <div key={d.key} className="flex items-center gap-3">
                    <Label className="w-10 text-sm font-medium">{d.label}</Label>
                    <input
                      type="checkbox"
                      checked={h.active}
                      onChange={(e) => updateHours(d.key, 'active', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 accent-primary"
                    />
                    {h.active && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={h.start}
                          onChange={(e) => updateHours(d.key, 'start', e.target.value)}
                          className="w-32"
                        />
                        <span className="text-muted-foreground text-sm">até</span>
                        <Input
                          type="time"
                          value={h.end}
                          onChange={(e) => updateHours(d.key, 'end', e.target.value)}
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Esses dados ajudam a calcular o valor em risco nas conversas.</p>
            <div className="space-y-2">
              <Label htmlFor="avgTicket">Ticket médio (R$)</Label>
              <Input
                id="avgTicket"
                type="number"
                placeholder="Ex: 350"
                value={state.avgTicket}
                onChange={(e) => update({ avgTicket: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="convRate">Taxa de conversão esperada (%)</Label>
              <Input
                id="convRate"
                type="number"
                min="0"
                max="100"
                placeholder="Ex: 25"
                value={state.conversionRate}
                onChange={(e) => update({ conversionRate: e.target.value })}
              />
            </div>
            {state.avgTicket && state.conversionRate && (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Valor potencial por conversa</p>
                  <p className="text-2xl font-bold text-primary">
                    R$ {((parseFloat(state.avgTicket) * parseFloat(state.conversionRate)) / 100).toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Conecte sua conta do WhatsApp Business para começar a auditar conversas.</p>
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              {!state.whatsappConnected ? (
                <>
                  <div className="w-48 h-48 bg-muted rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                    <QrCode className="w-24 h-24 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Escaneie o QR Code com o WhatsApp Business<br />
                    para conectar sua conta
                  </p>
                  <Button onClick={() => update({ whatsappConnected: true })}>
                    <QrCode className="w-4 h-4 mr-2" />
                    Simular conexão
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="font-medium text-emerald-600 dark:text-emerald-400">WhatsApp conectado com sucesso!</p>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Conectado
                  </Badge>
                </>
              )}
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Adicione os nomes dos atendentes da equipe.</p>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do atendente"
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAgent())}
              />
              <Button onClick={addAgent} size="icon">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {state.agents.map((agent) => (
                <Badge key={agent} variant="secondary" className="gap-1.5 py-1.5 px-3 text-sm">
                  {agent}
                  <button onClick={() => removeAgent(agent)} className="hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {state.agents.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum atendente adicionado ainda.</p>
              )}
            </div>
          </div>
        )

      case 5:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Configure quando e como deseja receber seus relatórios.</p>
            <div className="space-y-2">
              <Label>Frequência do relatório</Label>
              <Select value={state.reportFreq} onValueChange={(v) => update({ reportFreq: v as OnboardingState['reportFreq'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="daily+weekly">Diário + Semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Horário de envio</Label>
              <Input
                type="time"
                value={state.reportTime}
                onChange={(e) => update({ reportTime: e.target.value })}
                className="w-40"
              />
            </div>
            {(state.reportFreq === 'weekly' || state.reportFreq === 'daily+weekly') && (
              <div className="space-y-2">
                <Label>Dia do relatório semanal</Label>
                <Select value={state.reportWeekDay} onValueChange={(v) => update({ reportWeekDay: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.filter((d) => d.key !== 'dom').map((d) => (
                      <SelectItem key={d.key} value={d.key}>{d.label}-feira</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )

      case 6:
        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <SummaryCard title="Empresa" items={[
                { label: 'Nome', value: state.orgName || '—' },
                { label: 'Segmento', value: state.segment || '—' },
                { label: 'Fuso', value: tzLabel(state.timezone) },
              ]} />
              <SummaryCard title="Meta" items={[
                { label: 'Ticket médio', value: state.avgTicket ? `R$ ${parseFloat(state.avgTicket).toFixed(2)}` : '—' },
                { label: 'Taxa de conversão', value: state.conversionRate ? `${state.conversionRate}%` : '—' },
                { label: 'Valor por conversa', value: state.avgTicket && state.conversionRate ? `R$ ${((parseFloat(state.avgTicket) * parseFloat(state.conversionRate)) / 100).toFixed(2)}` : '—' },
              ]} />
              <SummaryCard title="WhatsApp" items={[
                { label: 'Status', value: state.whatsappConnected ? '✅ Conectado' : '❌ Não conectado' },
              ]} />
              <SummaryCard title="Equipe" items={[
                { label: 'Atendentes', value: state.agents.length > 0 ? state.agents.join(', ') : 'Nenhum' },
              ]} />
              <SummaryCard title="Relatórios" items={[
                { label: 'Frequência', value: state.reportFreq === 'daily' ? 'Diário' : state.reportFreq === 'weekly' ? 'Semanal' : 'Diário + Semanal' },
                { label: 'Horário', value: state.reportTime },
              ]} />
            </div>
            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={handleActivate}
              disabled={!state.orgName || !state.segment}
            >
              <Zap className="w-4 h-4 mr-2" />
              Ativar organização
            </Button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuração Inicial</h1>
        <p className="text-muted-foreground mt-1">Complete as etapas abaixo para configurar sua organização.</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const active = i === step
          const done = i < step
          return (
            <button
              key={s.id}
              onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : done
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          )
        })}
      </div>

      <Progress value={progress} className="h-2" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {(() => { const I = STEPS[step].icon; return <I className="w-5 h-5" /> })()}
            {STEPS[step].label}
          </CardTitle>
          <CardDescription>Etapa {step + 1} de {STEPS.length}</CardDescription>
        </CardHeader>
        <CardContent>{renderStep()}</CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
            Próximo <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium text-right max-w-[60%] truncate" title={item.value}>
              {item.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
