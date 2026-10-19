'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Building2,
  Users,
  MessageSquare,
  DollarSign,
  AlertTriangle,
  Database,
  Shield,
  Server,
  HardDrive,
  Activity,
  Search,
  RefreshCw,
  Settings,
  BarChart3,
  LifeBuoy,
  Package,
  FlaskConical,
} from 'lucide-react'
import { toast } from 'sonner'
import { ProductAnalyticsPanel } from '@/components/admin/product-analytics'
import { SupportTickets } from './support-tickets'
import { PlanCatalog } from './plan-catalog'
import { SimulationPanel, useSimulationAvailable } from './simulation-panel'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'

interface AdminSubscription {
  planId: string
  status: string
  storedStatus: string
  currentPeriodEnd: string
  trialEnd: string | null
  recurring: boolean
  graceEndsAt?: string | null
}

interface AdminOrganization {
  id: string
  name: string
  cnpj: string | null
  segment: string
  plan: string | null
  subscription: AdminSubscription | null
  connections: number
  agents: number
  status: string
  createdAt: string
  deletionRequestedAt?: string | null
  deletionScheduledFor?: string | null
}

interface AdminPendingDeletion {
  id: string
  name: string
  requestedAt: string | null
  scheduledFor: string
}

interface AdminPlan {
  id: string
  code: string
  name: string
  active: boolean
  monthlyPrice: number
}

interface AdminUser {
  id: string
  name: string
  email: string
  organization: string
  role: string
  status: string
  lastAccessAt: string | null
}

interface AdminActivity {
  id: string
  timestamp: string
  action: string
  organization: string
  details: string | null
}

interface AdminData {
  kpis: {
    activeOrgs: number
    whatsappConnections: number
    totalUsers: number
    conversationsToday: number
    monthlyRevenue: number
    activeAlerts: number
    delinquentOrgs?: number
  }
  organizations: AdminOrganization[]
  plans: AdminPlan[]
  pendingDeletions?: AdminPendingDeletion[]
  users: AdminUser[]
  activity: AdminActivity[]
  system: {
    databaseHealthy: boolean
    authHealthy: boolean
    storageBytes: number
  }
}

const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB documented platform limit

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  supervisor: 'Supervisor',
  analista: 'Analista',
  member: 'Membro',
  atendente: 'Atendente',
  viewer: 'Visualizador',
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('pt-BR')

const formatDateTime = (dateStr: string) =>
  new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const formatNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR').format(value)

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

// situação que o servidor calcula (além das que o operador grava): unpaid = 7 dias de tolerância vencidos, painel bloqueado
const SUB_STATUS_VIEW: Record<string, string> = { unpaid: 'Bloqueada por atraso no pagamento' }
const DELINQUENT = new Set(['past_due', 'unpaid'])

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  inactive: 'Inativa',
}

const getStatusBadge = (status: string) => {
  const label = STATUS_LABELS[status] || status
  switch (status) {
    case 'active':
      return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25">{label}</Badge>
    case 'suspended':
      return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/25">{label}</Badge>
    case 'inactive':
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">{label}</Badge>
    default:
      return <Badge variant="secondary">{label}</Badge>
  }
}

const STATUS_TAGS: Record<string, string> = {
  active: 'tag--verde',
  suspended: 'tag--ambar',
  inactive: 'tag--cinza',
}

const getStatusTag = (status: string) => (
  <span className={`tag ${STATUS_TAGS[status] || 'tag--cinza'}`}>
    {status === 'active' && <span className="ponto" aria-hidden="true" />}
    {STATUS_LABELS[status] || status}
  </span>
)

/** Status + aviso de exclusão agendada pelo dono (a empresa some de vez na data). */
const orgStatusCell = (org: AdminOrganization) => (
  <span className="flex flex-wrap gap-1">
    {getStatusTag(org.status)}
    {org.deletionScheduledFor && <span className="tag tag--vermelho">Exclusão em {formatDate(org.deletionScheduledFor)}</span>}
  </span>
)

const ROLE_TAGS: Record<string, string> = {
  admin: 'tag--vermelho',
  gestor: 'tag--verde',
}

const getRoleTag = (role: string) => (
  <span className={`tag ${ROLE_TAGS[role] || 'tag--cinza'}`}>{ROLE_LABELS[role] || role}</span>
)

// Situação da assinatura (o que o operador pode gravar em PATCH /api/admin/organizations/[id]/subscription)
const SUB_STATUS_LABELS: Record<string, string> = {
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
  expired: 'Teste encerrado',
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie)] px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

interface SubForm {
  planId: string
  status: string
  validUntil: string // AAAA-MM-DD (opcional)
}

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

// ─── Component ────────────────────────────────────────────────────────────

export default function AdminView() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // aba Simulação (S1): só quando o servidor tem SIMULATION_ENABLED=on
  const simulationAvailable = useSimulationAvailable()

  // Organizações tab state
  const [orgSearch, setOrgSearch] = useState('')
  const [orgStatusFilter, setOrgStatusFilter] = useState('todas')
  const [selectedOrg, setSelectedOrg] = useState<AdminOrganization | null>(null)

  // Usuários tab state
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('todos')

  // Assinatura da organização aberta no detalhe (B8: o operador ativa/troca o plano)
  const [subForm, setSubForm] = useState<SubForm>({ planId: '', status: 'active', validUntil: '' })
  const [confirmingSub, setConfirmingSub] = useState(false)
  const [savingSub, setSavingSub] = useState(false)
  const [subWarning, setSubWarning] = useState<string | null>(null)

  const fetchData = useCallback(async (silent = false, quiet = false): Promise<AdminData | null> => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin')
      if (!res.ok) throw new Error('Erro ao carregar painel administrativo')
      const json = await res.json()
      setData(json)
      if (silent && !quiet) toast.success('Dados atualizados com sucesso')
      return json as AdminData
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openOrg = (org: AdminOrganization) => {
    setSelectedOrg(org)
    setSubForm({ planId: org.subscription?.planId ?? '', status: org.subscription?.storedStatus ?? 'active', validUntil: '' })
    setConfirmingSub(false)
    setSubWarning(null)
  }

  const saveSubscription = async () => {
    if (!selectedOrg || !subForm.planId) return
    setSavingSub(true)
    try {
      const res = await fetch(`/api/admin/organizations/${selectedOrg.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: subForm.planId,
          status: subForm.status,
          // fim do dia no horário de Brasília
          ...(subForm.validUntil ? { periodEnd: `${subForm.validUntil}T23:59:59-03:00` } : {}),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Não foi possível alterar a assinatura')
      toast.success('Assinatura atualizada.')
      setSubWarning(body?.warning ?? null)
      setConfirmingSub(false)
      const fresh = await fetchData(true, true)
      const updated = fresh?.organizations.find((o) => o.id === selectedOrg.id)
      if (updated) setSelectedOrg(updated)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar a assinatura')
    } finally {
      setSavingSub(false)
    }
  }

  const organizations = data?.organizations || []
  const users = data?.users || []
  const pendingDeletions = data?.pendingDeletions || []

  const filteredOrganizations = useMemo(() => {
    return organizations.filter((org) => {
      const matchesSearch = org.name.toLowerCase().includes(orgSearch.toLowerCase())
      const matchesStatus =
        orgStatusFilter === 'todas' ||
        (orgStatusFilter === 'inadimplentes' ? DELINQUENT.has(org.subscription?.status ?? '') : org.status === orgStatusFilter)
      return matchesSearch && matchesStatus
    })
  }, [organizations, orgSearch, orgStatusFilter])

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearch.toLowerCase())
      const matchesRole = userRoleFilter === 'todos' || user.role === userRoleFilter
      return matchesSearch && matchesRole
    })
  }, [users, userSearch, userRoleFilter])

  const kpiCards = data ? [
    { label: 'Organizações Ativas', value: formatNumber(data.kpis.activeOrgs), icon: Building2, tone: 'tom-verde' },
    { label: 'Conexões WhatsApp', value: formatNumber(data.kpis.whatsappConnections), icon: MessageSquare, tone: 'tom-teal' },
    { label: 'Usuários Cadastrados', value: formatNumber(data.kpis.totalUsers), icon: Users, tone: 'tom-azul' },
    { label: 'Conversas Hoje', value: formatNumber(data.kpis.conversationsToday), icon: Activity, tone: 'tom-roxo' },
    { label: 'Receita Mensal', value: formatCurrency(data.kpis.monthlyRevenue), icon: DollarSign, tone: 'tom-verde' },
    { label: 'Alertas Ativos', value: formatNumber(data.kpis.activeAlerts), icon: AlertTriangle, tone: 'tom-laranja' },
  ] : []

  if (error) {
    return (
      <div className="cartao vazio" role="alert">
        <strong>{error}</strong>
        <button type="button" onClick={() => fetchData()} className="btn btn--sm mt-3">Tentar novamente</button>
      </div>
    )
  }

  const storagePct = data ? Math.min(100, Math.round((data.system.storageBytes / STORAGE_QUOTA_BYTES) * 100)) : 0
  const dbOk = data?.system.databaseHealthy !== false

  const orgNameCell = (org: AdminOrganization) => (
    <button type="button" className="forte text-left hover:underline" onClick={(e) => { e.stopPropagation(); openOrg(org) }}>
      {org.name}
    </button>
  )

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Settings className="ic" /></span>
          <div>
            <h1>Painel administrativo</h1>
            <p>Gerencie organizações, usuários e configurações da plataforma</p>
          </div>
        </div>
        <div className="cab-pagina__acoes">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="btn" onClick={() => fetchData(true)}>
                <RefreshCw className="ic" aria-hidden="true" />
                Atualizar
              </button>
            </TooltipTrigger>
            <TooltipContent>Recarregar dados do painel</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full gap-[18px]">
        <TabsList data-tour="admin-tabs" aria-label="Seções do painel administrativo">
          <TabsTrigger value="overview"><Activity className="ic" aria-hidden="true" />Visão Geral</TabsTrigger>
          <TabsTrigger value="organizations"><Building2 className="ic" aria-hidden="true" />Organizações</TabsTrigger>
          <TabsTrigger value="users"><Users className="ic" aria-hidden="true" />Usuários Globais</TabsTrigger>
          <TabsTrigger value="plans"><Package className="ic" aria-hidden="true" />Planos</TabsTrigger>
          <TabsTrigger value="system"><Server className="ic" aria-hidden="true" />Sistema</TabsTrigger>
          <TabsTrigger value="product"><BarChart3 className="ic" aria-hidden="true" />Produto</TabsTrigger>
          <TabsTrigger value="support"><LifeBuoy className="ic" aria-hidden="true" />Suporte</TabsTrigger>
          {simulationAvailable && <TabsTrigger value="simulation"><FlaskConical className="ic" aria-hidden="true" />Simulação</TabsTrigger>}
        </TabsList>

        {/* ── Produto (I7): funil, ativação, retenção, uso por tela, tour e custo de IA ── */}
        <TabsContent value="product">
          <ProductAnalyticsPanel />
        </TabsContent>

        {/* ── Visão Geral ─────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-[18px]">
          <div data-tour="admin-kpis" className="kpis">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
              : kpiCards.map((kpi) => {
                const Icon = kpi.icon
                return (
                  <article key={kpi.label} className="cartao kpi">
                    <span className={`kpi__icone ${kpi.tone}`} aria-hidden="true"><Icon className="ic" /></span>
                    <p className="kpi__rotulo">{kpi.label}</p>
                    <p className="kpi__valor">{kpi.value}</p>
                  </article>
                )
              })}
          </div>

          {pendingDeletions.length > 0 && (
            <section className="cartao" aria-labelledby="t-exclusoes" data-testid="admin-pending-deletions">
              <div className="cartao__cab">
                <div>
                  <h2 id="t-exclusoes">Exclusões agendadas</h2>
                  <p>Empresas cujo dono pediu o encerramento da conta. Na data, a empresa e todos os dados são apagados.</p>
                </div>
              </div>
              <div className="cartao__corpo">
                <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Exclusões agendadas">
                  <table className="tabela tabela--cab-cinza">
                    <thead>
                      <tr><th>Nome</th><th className="hidden sm:table-cell">Pedido em</th><th>Apagada em</th></tr>
                    </thead>
                    <tbody>
                      {pendingDeletions.map((d) => (
                        <tr key={d.id}>
                          <td className="forte">{d.name}</td>
                          <td className="hidden sm:table-cell suave">{d.requestedAt ? formatDateTime(d.requestedAt) : '—'}</td>
                          <td><span className="tag tag--vermelho">{formatDateTime(d.scheduledFor)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          <section className="cartao" aria-labelledby="t-orgs-recentes">
            <div className="cartao__cab">
              <div>
                <h2 id="t-orgs-recentes">Organizações Recentes</h2>
                <p>Últimas organizações cadastradas na plataforma</p>
              </div>
            </div>
            <div className="cartao__corpo">
              <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Organizações recentes">
                <table className="tabela tabela--cab-cinza">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th className="hidden sm:table-cell">Plano</th>
                      <th className="hidden md:table-cell">Conexões</th>
                      <th>Status</th>
                      <th className="hidden lg:table-cell">Criado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {organizations.length === 0 ? (
                      <tr><td colSpan={5} className="centro suave py-8">{loading ? 'Carregando...' : 'Nenhuma organização cadastrada.'}</td></tr>
                    ) : organizations.slice(0, 5).map((org) => (
                      <tr key={org.id} className="cursor-pointer" onClick={() => openOrg(org)}>
                        <td>{orgNameCell(org)}</td>
                        <td className="hidden sm:table-cell">{org.plan ? <span className="tag tag--contorno">{org.plan}</span> : '—'}</td>
                        <td className="hidden md:table-cell">{org.connections}</td>
                        <td>{orgStatusCell(org)}</td>
                        <td className="hidden lg:table-cell suave">{formatDate(org.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ── Organizações ────────────────────────────────────────── */}
        <TabsContent value="organizations">
          <section className="cartao" aria-labelledby="t-orgs">
            <div className="cartao__cab flex-wrap">
              <div><h2 id="t-orgs">Organizações</h2><p>{filteredOrganizations.length} de {organizations.length}</p></div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <label className="entrada-ic w-full sm:w-64">
                  <Search className="ic" aria-hidden="true" />
                  <span className="sr-only">Buscar organização</span>
                  <input
                    className="entrada"
                    type="search"
                    placeholder="Buscar organização..."
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                  />
                </label>
                <Select value={orgStatusFilter} onValueChange={setOrgStatusFilter}>
                  <SelectTrigger aria-label="Filtrar status" className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="suspended">Suspensa</SelectItem>
                    <SelectItem value="inactive">Inativa</SelectItem>
                    <SelectItem value="inadimplentes">Inadimplentes ({data?.kpis.delinquentOrgs ?? 0})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="cartao__corpo">
              <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Organizações">
                <table className="tabela tabela--cab-cinza">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th className="hidden lg:table-cell">CNPJ</th>
                      <th className="hidden md:table-cell">Segmento</th>
                      <th>Plano</th>
                      <th className="hidden md:table-cell">Conexões</th>
                      <th className="hidden lg:table-cell">Agentes</th>
                      <th>Status</th>
                      <th className="hidden sm:table-cell">Criado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrganizations.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="centro suave py-8">
                          {loading ? 'Carregando...' : 'Nenhuma organização encontrada.'}
                        </td>
                      </tr>
                    ) : (
                      filteredOrganizations.map((org) => (
                        <tr key={org.id} className="cursor-pointer" onClick={() => openOrg(org)}>
                          <td>{orgNameCell(org)}</td>
                          <td className="hidden lg:table-cell suave mono text-xs">{org.cnpj || '—'}</td>
                          <td className="hidden md:table-cell suave">{org.segment}</td>
                          <td>{org.plan ? <span className="tag tag--contorno">{org.plan}</span> : '—'}</td>
                          <td className="hidden md:table-cell">{org.connections}</td>
                          <td className="hidden lg:table-cell">{org.agents}</td>
                          <td>{orgStatusCell(org)}</td>
                          <td className="hidden sm:table-cell suave">{formatDate(org.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ── Usuários Globais ────────────────────────────────────── */}
        <TabsContent value="users">
          <section className="cartao" aria-labelledby="t-usuarios">
            <div className="cartao__cab flex-wrap">
              <div><h2 id="t-usuarios">Usuários Globais</h2><p>{filteredUsers.length} de {users.length}</p></div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <label className="entrada-ic w-full sm:w-64">
                  <Search className="ic" aria-hidden="true" />
                  <span className="sr-only">Buscar usuário</span>
                  <input
                    className="entrada"
                    type="search"
                    placeholder="Buscar por nome ou email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </label>
                <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                  <SelectTrigger aria-label="Filtrar papel" className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Filtrar papel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="cartao__corpo">
              <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Usuários globais">
                <table className="tabela tabela--cab-cinza">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th className="hidden lg:table-cell">Email</th>
                      <th className="hidden md:table-cell">Organização</th>
                      <th>Papel</th>
                      <th>Status</th>
                      <th className="hidden sm:table-cell">Último acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="centro suave py-8">
                          {loading ? 'Carregando...' : 'Nenhum usuário encontrado.'}
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                        <tr key={user.id}>
                          <td>
                            <div className="pessoa pessoa--forte">
                              <span className="av av--sm av--verde" aria-hidden="true">{initials(user.name)}</span>
                              <span><strong>{user.name}</strong><small className="lg:hidden">{user.email}</small></span>
                            </div>
                          </td>
                          <td className="hidden lg:table-cell suave">{user.email}</td>
                          <td className="hidden md:table-cell suave">{user.organization}</td>
                          <td>{getRoleTag(user.role)}</td>
                          <td>{getStatusTag(user.status)}</td>
                          <td className="hidden sm:table-cell suave">{user.lastAccessAt ? formatDateTime(user.lastAccessAt) : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ── Sistema ─────────────────────────────────────────────── */}
        <TabsContent value="system" className="space-y-[18px]">
          <section aria-labelledby="t-saude">
            <h2 id="t-saude" className="mb-3 text-base font-bold">Saúde do Sistema</h2>
            <div className="grade grade-3">
              <article className="cartao kpi-h">
                <span className="kpi__icone tom-verde" aria-hidden="true"><Database className="ic" /></span>
                <div>
                  <p className="kpi-h__rotulo">Banco de Dados</p>
                  <span className={`tag mt-1 ${dbOk ? 'tag--verde' : 'tag--vermelho'}`}>
                    <span className="ponto" aria-hidden="true" />
                    {dbOk ? 'Operacional' : 'Indisponível'}
                  </span>
                </div>
              </article>
              <article className="cartao kpi-h">
                <span className="kpi__icone tom-verde" aria-hidden="true"><Shield className="ic" /></span>
                <div>
                  <p className="kpi-h__rotulo">Autenticação</p>
                  <span className="tag tag--verde mt-1"><span className="ponto" aria-hidden="true" />Operacional</span>
                </div>
              </article>
              <article className="cartao kpi-h">
                <span className="kpi__icone tom-teal" aria-hidden="true"><HardDrive className="ic" /></span>
                <div className="flex-1">
                  <p className="kpi-h__rotulo">Armazenamento</p>
                  <div className="linha-flex entre mt-1 text-xs suave">
                    <span>{formatBytes(data?.system.storageBytes || 0)} / 10 GB</span>
                    <span className="forte">{storagePct}%</span>
                  </div>
                  <div
                    className="barra mt-2"
                    role="progressbar"
                    aria-label="Uso do armazenamento"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={storagePct}
                  >
                    <i style={{ width: `${storagePct}%` }} />
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className="cartao" aria-labelledby="t-atividade">
            <div className="cartao__cab">
              <div>
                <h2 id="t-atividade"><Activity className="ic verde-txt" aria-hidden="true" />Atividade Recente</h2>
                <p>Últimas notificações geradas na plataforma</p>
              </div>
            </div>
            <div className="cartao__corpo">
              <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Atividade recente">
                <table className="tabela tabela--cab-cinza">
                  <thead>
                    <tr>
                      <th className="w-[180px]">Data/Hora</th>
                      <th>Ação</th>
                      <th className="hidden md:table-cell">Organização</th>
                      <th className="hidden lg:table-cell">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.activity || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="centro suave py-8">
                          {loading ? 'Carregando...' : 'Nenhuma atividade recente.'}
                        </td>
                      </tr>
                    ) : (
                      (data?.activity || []).map((entry) => (
                        <tr key={entry.id}>
                          <td className="suave whitespace-nowrap">{formatDateTime(entry.timestamp)}</td>
                          <td className="forte">{entry.action}</td>
                          <td className="hidden md:table-cell suave">{entry.organization}</td>
                          <td className="hidden lg:table-cell suave max-w-xs truncate">{entry.details || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ── Planos (V7): catálogo editável; preço novo só para novas contratações ── */}
        <TabsContent value="plans">
          <PlanCatalog />
        </TabsContent>

        {/* ── Suporte (chamados de "Falar com o suporte") ─────────── */}
        <TabsContent value="support">
          <SupportTickets />
        </TabsContent>

        {simulationAvailable && (
          <TabsContent value="simulation">
            <SimulationPanel />
          </TabsContent>
        )}
      </Tabs>

      {/* ── Detalhe da organização (portal: componentes shadcn) ─────── */}
      <Dialog open={!!selectedOrg} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          {selectedOrg && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  {selectedOrg.name}
                </DialogTitle>
                <DialogDescription>Detalhes da organização</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">CNPJ</p>
                    <p className="font-mono">{selectedOrg.cnpj || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Segmento</p>
                    <p>{selectedOrg.segment}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Plano</p>
                    {selectedOrg.plan ? <Badge variant="outline">{selectedOrg.plan}</Badge> : '—'}
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Status</p>
                    {getStatusBadge(selectedOrg.status)}
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Conexões</p>
                    <p className="font-medium">{selectedOrg.connections}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Agentes</p>
                    <p className="font-medium">{selectedOrg.agents}</p>
                  </div>
                </div>
                <Separator />
                <div className="text-sm space-y-1">
                  <p className="text-muted-foreground">Criado em</p>
                  <p>{formatDate(selectedOrg.createdAt)}</p>
                </div>
                <Separator />
                {/* B8 · o operador ativa/troca o plano da empresa (pagamento combinado fora do checkout) */}
                <section aria-labelledby="t-assinatura" className="space-y-3 text-sm" data-testid="admin-assinatura">
                  <div>
                    <h3 id="t-assinatura" className="font-semibold">Assinatura</h3>
                    <p className="text-muted-foreground">
                      {selectedOrg.subscription
                        ? `${SUB_STATUS_LABELS[selectedOrg.subscription.status] || SUB_STATUS_VIEW[selectedOrg.subscription.status] || selectedOrg.subscription.status} · ${selectedOrg.subscription.storedStatus === 'trialing' && selectedOrg.subscription.trialEnd ? `teste até ${formatDate(selectedOrg.subscription.trialEnd)}` : selectedOrg.subscription.status === 'past_due' && selectedOrg.subscription.graceEndsAt ? `tolerância até ${formatDate(selectedOrg.subscription.graceEndsAt)}` : `válida até ${formatDate(selectedOrg.subscription.currentPeriodEnd)}`}`
                        : 'Sem assinatura cadastrada.'}
                    </p>
                    {selectedOrg.subscription?.recurring && (
                      <p className="mt-1 text-amber-700 dark:text-amber-400">
                        Esta empresa tem cobrança automática no Pagar.me. Mudar aqui não altera a cobrança no cartão.
                      </p>
                    )}
                  </div>

                  {!confirmingSub ? (
                    <form
                      className="space-y-3"
                      onSubmit={(e) => { e.preventDefault(); if (subForm.planId) { setSubWarning(null); setConfirmingSub(true) } }}
                    >
                      <div className="space-y-1">
                        <Label htmlFor="adm-sub-plano">Plano</Label>
                        <select
                          id="adm-sub-plano"
                          className={SELECT_CLASS}
                          value={subForm.planId}
                          required
                          onChange={(e) => setSubForm((f) => ({ ...f, planId: e.target.value }))}
                        >
                          {!subForm.planId && <option value="">Escolha o plano</option>}
                          {(data?.plans || [])
                            .filter((p) => p.active || p.id === subForm.planId)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({formatCurrency(p.monthlyPrice)}/mês){p.active ? '' : ' · inativo'}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="adm-sub-status">Situação</Label>
                        <select
                          id="adm-sub-status"
                          className={SELECT_CLASS}
                          value={subForm.status}
                          onChange={(e) => setSubForm((f) => ({ ...f, status: e.target.value }))}
                        >
                          {Object.entries(SUB_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="adm-sub-validade">Válido até (opcional)</Label>
                        <Input
                          id="adm-sub-validade"
                          type="date"
                          value={subForm.validUntil}
                          onChange={(e) => setSubForm((f) => ({ ...f, validUntil: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Em branco, a data atual é mantida. No teste grátis, é o fim do teste.</p>
                      </div>
                      <Button type="submit" className="w-full" disabled={!subForm.planId}>
                        Salvar assinatura
                      </Button>
                    </form>
                  ) : (
                    <div role="alertdialog" aria-labelledby="t-confirma-assinatura" aria-describedby="d-confirma-assinatura" className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                      <p id="t-confirma-assinatura" className="font-semibold">Confirmar alteração da assinatura?</p>
                      <p id="d-confirma-assinatura">
                        {selectedOrg.name}: plano <b>{data?.plans.find((p) => p.id === subForm.planId)?.name ?? '—'}</b>, situação{' '}
                        <b>{SUB_STATUS_LABELS[subForm.status] || subForm.status}</b>
                        {subForm.validUntil ? <>, válido até <b>{formatDate(`${subForm.validUntil}T12:00:00`)}</b></> : null}. A empresa passa a ter os limites deste plano na hora.
                      </p>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" className="flex-1" disabled={savingSub} onClick={() => setConfirmingSub(false)}>
                          Voltar
                        </Button>
                        <Button type="button" className="flex-1" disabled={savingSub} onClick={() => void saveSubscription()}>
                          {savingSub ? 'Salvando...' : 'Confirmar'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {subWarning && (
                    <p role="status" data-testid="admin-assinatura-aviso" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
                      {subWarning}
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
