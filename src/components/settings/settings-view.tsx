'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Building2, Clock, Headphones, DollarSign, Brain, Bell, Shield,
  Save, Plus, Trash2, Upload, X,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

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

function TabSaveButton({ onSave }: { onSave?: () => void }) {
  return (
    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" type="submit" onClick={onSave}>
      <Save className="h-4 w-4" />
      Salvar
    </Button>
  )
}

export default function SettingsView() {
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

  useEffect(() => {
    fetch('/api/settings').then(r => r.ok ? r.json() : {}).then(data => {
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
    }).catch(() => {})
    fetch('/api/alert-rules').then(r => r.ok ? r.json() : {}).then(data => {
      setRulesData(data.rules || [])
    }).catch(() => {}).finally(() => setIsLoading(false))
  }, [])
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
  const [holidays, setHolidays] = useState('01/01/2025 - Confraternização Universal\n21/04/2025 - Tiradentes\n01/05/2025 - Dia do Trabalho\n19/06/2025 - Corpus Christi\n07/09/2025 - Independência\n12/10/2025 - Nossa Sra. Aparecida\n02/11/2025 - Finados\n15/11/2025 - Proclamação da República\n25/12/2025 - Natal')
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
  const [convRate, setConvRate] = useState('28')
  const [products, setProducts] = useState([
    { name: 'Consulta inicial', value: '300' },
    { name: 'Clareamento dental', value: '1200' },
    { name: 'Limpeza profissional', value: '250' },
    { name: 'Ortodontia (mensal)', value: '800' },
  ])
  const [intentions, setIntentions] = useState([
    { name: 'Consulta agendamento', probability: '85' },
    { name: 'Preço de tratamento', probability: '70' },
    { name: 'Disponibilidade', probability: '60' },
    { name: 'Compra/Pagamento', probability: '90' },
    { name: 'Reclamação', probability: '20' },
  ])
  const [minSample, setMinSample] = useState('5')
  const [opportunityCeiling, setOpportunityCeiling] = useState('15000')
  const [showEstimates, setShowEstimates] = useState(true)

  // --- IA ---
  const [aiLang] = useState('pt-BR')
  const [aiSegment, setAiSegment] = useState('')
  const [aiTerms, setAiTerms] = useState('clareamento = clareamento dental\nortodontia = aparelho\nimplante = implante dentário\nlimpeza = limpeza profissional\nprofilaxia = limpeza profissional\nRAF = radiografia panorâmica\nTC = tomografia computadorizada')
  const [aiConfidence, setAiConfidence] = useState([0.55])
  const [aiAudio, setAiAudio] = useState(false)
  const [aiMasking, setAiMasking] = useState(true)

  // --- Notificações ---
  const [notifDailyEnabled, setNotifDailyEnabled] = useState(true)
  const [notifDailyTime, setNotifDailyTime] = useState('18:00')
  const [notifDailyDays, setNotifDailyDays] = useState('2,3,4,5,6')
  const [notifWeeklyEnabled, setNotifWeeklyEnabled] = useState(true)
  const [notifWeeklyTime, setNotifWeeklyTime] = useState('09:00')
  const [notifImmediate, setNotifImmediate] = useState(true)
  const [notifDigestEnabled, setNotifDigestEnabled] = useState(true)
  const [notifDigestFreq, setNotifDigestFreq] = useState('15')
  const [notifRecipients, setNotifRecipients] = useState(['contato@odontovida.com.br', 'ana@odontovida.com.br'])
  const [newRecipient, setNewRecipient] = useState('')
  const [silenceStart, setSilenceStart] = useState('22:00')
  const [silenceEnd, setSilenceEnd] = useState('07:00')

  // --- Privacidade ---
  const [retContent, setRetContent] = useState('365')
  const [retMetadata, setRetMetadata] = useState('730')
  const [retAttachments, setRetAttachments] = useState('90')
  const [privMasking, setPrivMasking] = useState(true)
  const [privExport, setPrivExport] = useState(true)
  const [privExcluded, setPrivExcluded] = useState('')
  const [privLegalBasis, setPrivLegalBasis] = useState('legitimo_interesse')
  const [privDPO, setPrivDPO] = useState('Ana Silva - ana@odontovida.com.br')

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

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie as configurações da organização e do sistema.
        </p>
      </div>

      <Tabs defaultValue="empresa" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="empresa" className="gap-1.5 text-xs sm:text-sm"><Building2 className="h-4 w-4" />Empresa</TabsTrigger>
          <TabsTrigger value="horarios" className="gap-1.5 text-xs sm:text-sm"><Clock className="h-4 w-4" />Horários</TabsTrigger>
          <TabsTrigger value="atendimento" className="gap-1.5 text-xs sm:text-sm"><Headphones className="h-4 w-4" />Atendimento</TabsTrigger>
          <TabsTrigger value="financeiro" className="gap-1.5 text-xs sm:text-sm"><DollarSign className="h-4 w-4" />Financeiro</TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5 text-xs sm:text-sm"><Brain className="h-4 w-4" />IA</TabsTrigger>
          <TabsTrigger value="notificacoes" className="gap-1.5 text-xs sm:text-sm"><Bell className="h-4 w-4" />Notificações</TabsTrigger>
          <TabsTrigger value="privacidade" className="gap-1.5 text-xs sm:text-sm"><Shield className="h-4 w-4" />Privacidade</TabsTrigger>
          <TabsTrigger value="regras" className="gap-1.5 text-xs sm:text-sm"><Shield className="h-4 w-4" />Regras</TabsTrigger>
        </TabsList>

        {/* ====== EMPRESA ====== */}
        <TabsContent value="empresa" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados da Empresa</CardTitle>
              <CardDescription>Informações cadastrais da organização.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome empresarial</Label>
                    <Input value={empName} onChange={e => setEmpName(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome de exibição</Label>
                    <Input value={empDisplay} onChange={e => setEmpDisplay(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CNPJ</Label>
                    <Input value={empCnpj} onChange={e => setEmpCnpj(e.target.value)} className="h-9 font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Segmento</Label>
                    <Select value={empSegment} onValueChange={setEmpSegment}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SEGMENTS.map(s => (
                          <SelectItem key={s} value={s}>{SEGMENT_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Site</Label>
                    <Input value={empSite} onChange={e => setEmpSite(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input value={empPhone} onChange={e => setEmpPhone(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">E-mail do administrador</Label>
                    <Input type="email" value={empEmail} onChange={e => setEmpEmail(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fuso horário</Label>
                    <Select value={empTimezone} onValueChange={setEmpTimezone}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BR_TIMEZONES.map(tz => (
                          <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Moeda</Label>
                    <Input value={empCurrency} disabled className="h-9 bg-muted" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Idioma</Label>
                    <Input value={empLang} disabled className="h-9 bg-muted" />
                  </div>
                </div>
                {/* Logo upload placeholder */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Logotipo</Label>
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 flex items-center justify-center">
                      <Upload className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>Arraste um arquivo ou clique para selecionar.</p>
                      <p className="mt-0.5">PNG, SVG ou JPG. Máximo 512×512px.</p>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-end"><TabSaveButton /></div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== HORÁRIOS ====== */}
        <TabsContent value="horarios" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Horário Comercial</CardTitle>
              <CardDescription>Defina os horários de funcionamento para cálculo de SLA.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-12">Ativo</TableHead>
                      <TableHead className="text-xs">Dia</TableHead>
                      <TableHead className="text-xs">Abre</TableHead>
                      <TableHead className="text-xs">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {WEEKDAYS.map((day, idx) => {
                      const d = businessHours[String(idx)]
                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <Switch
                              checked={d.enabled}
                              onCheckedChange={(v) => updateBH(String(idx), 'enabled', v)}
                            />
                          </TableCell>
                          <TableCell className="text-sm font-medium">{day}</TableCell>
                          <TableCell>
                            <Input
                              type="time" value={d.open} onChange={(e) => updateBH(String(idx), 'open', e.target.value)}
                              disabled={!d.enabled} className="h-8 w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time" value={d.close} onChange={(e) => updateBH(String(idx), 'close', e.target.value)}
                              disabled={!d.enabled} className="h-8 w-28"
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-xs">Feriados (uma por linha: DD/MM/AAAA - Descrição)</Label>
                  <Textarea value={holidays} onChange={e => setHolidays(e.target.value)} rows={6} className="text-xs font-mono" />
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tolerância antes do horário (min)</Label>
                    <Input type="number" value={toleranceBefore} onChange={e => setToleranceBefore(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tolerância depois do horário (min)</Label>
                    <Input type="number" value={toleranceAfter} onChange={e => setToleranceAfter(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Regra para fora do expediente</Label>
                    <Select value={outsideRule} onValueChange={setOutsideRule}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignora">Ignora (não conta SLA)</SelectItem>
                        <SelectItem value="atraso">Conta como atraso</SelectItem>
                        <SelectItem value="alerta">Alerta, mas não pune</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />
                <div className="flex justify-end"><TabSaveButton /></div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== ATENDIMENTO ====== */}
        <TabsContent value="atendimento" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parâmetros de Atendimento</CardTitle>
              <CardDescription>SLAs e regras de encerramento automático.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">SLA primeira resposta (minutos)</Label>
                    <Input type="number" value={slaFirst} onChange={e => setSlaFirst(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">SLA continuidade (minutos)</Label>
                    <Input type="number" value={slaContinuity} onChange={e => setSlaContinuity(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tempo de abandono (horas)</Label>
                    <Input type="number" value={abandonTime} onChange={e => setAbandonTime(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Janela de reabertura (horas)</Label>
                    <Input type="number" value={reopenWindow} onChange={e => setReopenWindow(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Encerramento por inatividade (horas)</Label>
                    <Input type="number" value={inactivityClose} onChange={e => setInactivityClose(e.target.value)} className="h-9" />
                  </div>
                </div>
                <Separator />
                <div className="flex justify-end"><TabSaveButton /></div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== FINANCEIRO ====== */}
        <TabsContent value="financeiro" className="mt-4">
          <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parâmetros Financeiros</CardTitle>
                <CardDescription>Valores usados para estimar receita potencial das oportunidades.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ticket médio inicial (R$)</Label>
                    <Input type="number" value={avgTicket} onChange={e => setAvgTicket(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Taxa de conversão inicial (%)</Label>
                    <Input type="number" value={convRate} onChange={e => setConvRate(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amostra mínima</Label>
                    <Input type="number" value={minSample} onChange={e => setMinSample(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Teto por oportunidade (R$)</Label>
                    <Input type="number" value={opportunityCeiling} onChange={e => setOpportunityCeiling(e.target.value)} className="h-9" />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={showEstimates} onCheckedChange={setShowEstimates} />
                  <Label className="text-xs">Exibir estimativas de valor nas conversas</Label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Valores por Produto/Serviço</CardTitle>
                    <CardDescription>Valores de referência para cálculo automático.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" type="button" className="gap-1" onClick={addProduct}>
                    <Plus className="h-3.5 w-3.5" />Adicionar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Produto/Serviço</TableHead>
                      <TableHead className="text-xs w-36">Valor (R$)</TableHead>
                      <TableHead className="text-xs w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell><Input value={p.name} onChange={e => updateProduct(i, 'name', e.target.value)} className="h-8" placeholder="Nome" /></TableCell>
                        <TableCell><Input type="number" value={p.value} onChange={e => updateProduct(i, 'value', e.target.value)} className="h-8" /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" type="button" onClick={() => removeProduct(i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Probabilidade por Intenção</CardTitle>
                    <CardDescription>Probabilidade padrão de conversão por tipo de intenção.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" type="button" className="gap-1" onClick={addIntention}>
                    <Plus className="h-3.5 w-3.5" />Adicionar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Intenção</TableHead>
                      <TableHead className="text-xs w-36">Probabilidade (%)</TableHead>
                      <TableHead className="text-xs w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intentions.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell><Input value={it.name} onChange={e => updateIntention(i, 'name', e.target.value)} className="h-8" placeholder="Intenção" /></TableCell>
                        <TableCell><Input type="number" value={it.probability} onChange={e => updateIntention(i, 'probability', e.target.value)} className="h-8" /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" type="button" onClick={() => removeIntention(i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex justify-end"><TabSaveButton /></div>
          </form>
        </TabsContent>

        {/* ====== IA ====== */}
        <TabsContent value="ia" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurações de Inteligência Artificial</CardTitle>
              <CardDescription>Ajuste o comportamento da classificação e análise.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Idioma de análise</Label>
                    <Input value={aiLang} disabled className="h-9 bg-muted" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Segmento (contexto da IA)</Label>
                    <Select value={aiSegment} onValueChange={setAiSegment}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SEGMENTS.map(s => (
                          <SelectItem key={s} value={s}>{SEGMENT_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Termos e abreviações do setor (um por linha: termo = expansão)</Label>
                  <Textarea value={aiTerms} onChange={e => setAiTerms(e.target.value)} rows={6} className="text-xs font-mono" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Nível mínimo de confiança</Label>
                    <span className="text-xs font-mono font-medium text-emerald-600">{(aiConfidence[0] * 100).toFixed(0)}%</span>
                  </div>
                  <Slider value={aiConfidence} onValueChange={setAiConfidence} min={0} max={1} step={0.05} className="[&_[role=slider]]:bg-emerald-600" />
                  <p className="text-[11px] text-muted-foreground">Classificações abaixo deste limiar serão marcadas como "baixa confiança".</p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs">Processamento de áudio</Label>
                      <p className="text-[11px] text-muted-foreground">Transcrever e analisar mensagens de áudio.</p>
                    </div>
                    <Switch checked={aiAudio} onCheckedChange={setAiAudio} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs">Mascaramento antes do provedor</Label>
                      <p className="text-[11px] text-muted-foreground">Remover dados sensíveis antes de enviar ao provedor de IA.</p>
                    </div>
                    <Switch checked={aiMasking} onCheckedChange={setAiMasking} />
                  </div>
                </div>

                <Separator />
                <div className="flex justify-end"><TabSaveButton /></div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== NOTIFICAÇÕES ====== */}
        <TabsContent value="notificacoes" className="mt-4">
          <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Relatórios Agendados</CardTitle>
                <CardDescription>Configure relatórios automáticos por e-mail.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4">
                  <Switch checked={notifDailyEnabled} onCheckedChange={setNotifDailyEnabled} className="mt-1" />
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs font-medium">Relatório diário</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Horário</Label>
                        <Input type="time" value={notifDailyTime} onChange={e => setNotifDailyTime(e.target.value)} disabled={!notifDailyEnabled} className="h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Dias (2=seg, 3=ter, ..., 6=sáb)</Label>
                        <Input value={notifDailyDays} onChange={e => setNotifDailyDays(e.target.value)} disabled={!notifDailyEnabled} className="h-8 font-mono" />
                      </div>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex items-start gap-4">
                  <Switch checked={notifWeeklyEnabled} onCheckedChange={setNotifWeeklyEnabled} className="mt-1" />
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs font-medium">Relatório semanal</Label>
                    <div className="space-y-1 max-w-[200px]">
                      <Label className="text-[11px] text-muted-foreground">Horário</Label>
                      <Input type="time" value={notifWeeklyTime} onChange={e => setNotifWeeklyTime(e.target.value)} disabled={!notifWeeklyEnabled} className="h-8" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alertas</CardTitle>
                <CardDescription>Configure como os alertas são entregues.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">Alertas imediatos</Label>
                    <p className="text-[11px] text-muted-foreground">Receber alertas críticos e de alta severidade imediatamente.</p>
                  </div>
                  <Switch checked={notifImmediate} onCheckedChange={setNotifImmediate} />
                </div>
                <Separator />
                <div className="flex items-start gap-4">
                  <Switch checked={notifDigestEnabled} onCheckedChange={setNotifDigestEnabled} className="mt-1" />
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs font-medium">Digest de alertas</Label>
                    <p className="text-[11px] text-muted-foreground">Agrupar alertas em um resumo periódico.</p>
                    <div className="space-y-1 max-w-[200px]">
                      <Label className="text-[11px] text-muted-foreground">Frequência (minutos)</Label>
                      <Input type="number" value={notifDigestFreq} onChange={e => setNotifDigestFreq(e.target.value)} disabled={!notifDigestEnabled} className="h-8" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Destinatários</CardTitle>
                <CardDescription>E-mails que receberão notificações.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="email@exemplo.com"
                    value={newRecipient}
                    onChange={e => setNewRecipient(e.target.value)}
                    className="h-8"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                  />
                  <Button variant="outline" size="sm" type="button" onClick={addRecipient} className="gap-1 shrink-0">
                    <Plus className="h-3.5 w-3.5" />Adicionar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {notifRecipients.map(r => (
                    <Badge key={r} variant="secondary" className="text-xs gap-1 pr-1">
                      {r}
                      <button type="button" onClick={() => removeRecipient(r)} className="ml-0.5 hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {notifRecipients.length === 0 && <p className="text-xs text-muted-foreground">Nenhum destinatário adicionado.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horários de Silêncio</CardTitle>
                <CardDescription>Período sem notificações (somente alertas críticos).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Início</Label>
                    <Input type="time" value={silenceStart} onChange={e => setSilenceStart(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fim</Label>
                    <Input type="time" value={silenceEnd} onChange={e => setSilenceEnd(e.target.value)} className="h-9" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end"><TabSaveButton /></div>
          </form>
        </TabsContent>

        {/* ====== PRIVACIDADE ====== */}
        <TabsContent value="privacidade" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Privacidade e Retenção de Dados</CardTitle>
              <CardDescription>Configure a retenção e proteção dos dados processados.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Retenção conteúdo (dias)</Label>
                    <Input type="number" value={retContent} onChange={e => setRetContent(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Retenção metadados (dias)</Label>
                    <Input type="number" value={retMetadata} onChange={e => setRetMetadata(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Retenção anexos (dias)</Label>
                    <Input type="number" value={retAttachments} onChange={e => setRetAttachments(e.target.value)} className="h-9" />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs">Mascaramento automático</Label>
                      <p className="text-[11px] text-muted-foreground">Ocultar dados sensíveis (CPF, cartão, etc.) nas análises.</p>
                    </div>
                    <Switch checked={privMasking} onCheckedChange={setPrivMasking} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs">Exportação pelo titular</Label>
                      <p className="text-[11px] text-muted-foreground">Permitir que o titular dos dados solicite exportação.</p>
                    </div>
                    <Switch checked={privExport} onCheckedChange={setPrivExport} />
                  </div>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-xs">Números excluídos do monitoramento (um por linha)</Label>
                  <Textarea value={privExcluded} onChange={e => setPrivExcluded(e.target.value)} rows={3} className="text-xs font-mono" placeholder="11999999999&#10;11888888888" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Base legal</Label>
                    <Select value={privLegalBasis} onValueChange={setPrivLegalBasis}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consentimento">Consentimento do titular</SelectItem>
                        <SelectItem value="legitimo_interesse">Legítimo interesse</SelectItem>
                        <SelectItem value="obrigacao_legal">Obrigação legal</SelectItem>
                        <SelectItem value="contrato">Execução de contrato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Contato do encarregado (DPO)</Label>
                    <Input value={privDPO} onChange={e => setPrivDPO(e.target.value)} className="h-9" />
                  </div>
                </div>

                <Separator />
                <div className="flex justify-end"><TabSaveButton onSave={() => { fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: empDisplay, name: empName, cnpj: empCnpj, segment: empSegment, website: empSite, phone: empPhone, adminEmail: empEmail, timezone: empTimezone }) }).then(() => {}).catch(() => {}) }} /></div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Regras de Alerta (from API) ── */}
        <TabsContent value="regras" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-lg">Regras de Alerta</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Configure quando e como os alertas são gerados.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                    <TableHead className="w-[80px] text-center">Ativa</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead className="hidden md:table-cell">Cooldown</TableHead>
                    <TableHead className="hidden lg:table-cell">Canais</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rulesData.map((rule: any) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{rule.type}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={rule.active}
                          onCheckedChange={(checked: boolean) => {
                            fetch(`/api/alert-rules/${rule.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ active: checked }),
                            }).then(() => fetch('/api/alert-rules').then(r => r.ok ? r.json() : {}).then(d => setRulesData(d.rules || [])).catch(() => {})).catch(() => {})
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={rule.severity === 'critical' ? 'destructive' : rule.severity === 'high' ? 'default' : 'secondary'} className="gap-1 text-xs">{rule.severity}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{rule.cooldownMinutes} min</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(rule.channels || []).map((ch: string) => (
                            <Badge key={ch} variant="outline" className="text-xs">{ch}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
