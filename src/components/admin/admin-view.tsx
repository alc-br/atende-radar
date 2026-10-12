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
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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

interface AdminOrganization {
  id: string
  name: string
  cnpj: string | null
  segment: string
  plan: string | null
  connections: number
  agents: number
  status: string
  createdAt: string
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
  }
  organizations: AdminOrganization[]
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

const ROLE_TAGS: Record<string, string> = {
  admin: 'tag--vermelho',
  gestor: 'tag--verde',
}

const getRoleTag = (role: string) => (
  <span className={`tag ${ROLE_TAGS[role] || 'tag--cinza'}`}>{ROLE_LABELS[role] || role}</span>
)

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

// ─── Component ────────────────────────────────────────────────────────────

export default function AdminView() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Organizações tab state
  const [orgSearch, setOrgSearch] = useState('')
  const [orgStatusFilter, setOrgStatusFilter] = useState('todas')
  const [selectedOrg, setSelectedOrg] = useState<AdminOrganization | null>(null)

  // Usuários tab state
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('todos')

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin')
      if (!res.ok) throw new Error('Erro ao carregar painel administrativo')
      const json = await res.json()
      setData(json)
      if (silent) toast.success('Dados atualizados com sucesso')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const organizations = data?.organizations || []
  const users = data?.users || []

  const filteredOrganizations = useMemo(() => {
    return organizations.filter((org) => {
      const matchesSearch = org.name.toLowerCase().includes(orgSearch.toLowerCase())
      const matchesStatus = orgStatusFilter === 'todas' || org.status === orgStatusFilter
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
    <button type="button" className="forte text-left hover:underline" onClick={(e) => { e.stopPropagation(); setSelectedOrg(org) }}>
      {org.name}
    </button>
  )

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Settings className="ic" /></span>
          <div>
            <h1>Painel Administrativo</h1>
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
          <TabsTrigger value="system"><Server className="ic" aria-hidden="true" />Sistema</TabsTrigger>
        </TabsList>

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
                      <tr key={org.id} className="cursor-pointer" onClick={() => setSelectedOrg(org)}>
                        <td>{orgNameCell(org)}</td>
                        <td className="hidden sm:table-cell">{org.plan ? <span className="tag tag--contorno">{org.plan}</span> : '—'}</td>
                        <td className="hidden md:table-cell">{org.connections}</td>
                        <td>{getStatusTag(org.status)}</td>
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
                        <tr key={org.id} className="cursor-pointer" onClick={() => setSelectedOrg(org)}>
                          <td>{orgNameCell(org)}</td>
                          <td className="hidden lg:table-cell suave mono text-xs">{org.cnpj || '—'}</td>
                          <td className="hidden md:table-cell suave">{org.segment}</td>
                          <td>{org.plan ? <span className="tag tag--contorno">{org.plan}</span> : '—'}</td>
                          <td className="hidden md:table-cell">{org.connections}</td>
                          <td className="hidden lg:table-cell">{org.agents}</td>
                          <td>{getStatusTag(org.status)}</td>
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
      </Tabs>

      {/* ── Detalhe da organização (portal: componentes shadcn) ─────── */}
      <Dialog open={!!selectedOrg} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="sm:max-w-md">
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
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
