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

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
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

const getRoleBadge = (role: string) => {
  const label = ROLE_LABELS[role] || role
  switch (role) {
    case 'admin':
      return <Badge className="bg-destructive/15 text-destructive border-destructive/25 hover:bg-destructive/25">{label}</Badge>
    case 'gestor':
      return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25">{label}</Badge>
    default:
      return <Badge variant="secondary">{label}</Badge>
  }
}

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
    { label: 'Organizações Ativas', value: formatNumber(data.kpis.activeOrgs), icon: Building2, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10' },
    { label: 'Conexões WhatsApp', value: formatNumber(data.kpis.whatsappConnections), icon: MessageSquare, color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-500/10' },
    { label: 'Usuários Cadastrados', value: formatNumber(data.kpis.totalUsers), icon: Users, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10' },
    { label: 'Conversas Hoje', value: formatNumber(data.kpis.conversationsToday), icon: Activity, color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-500/10' },
    { label: 'Receita Mensal', value: formatCurrency(data.kpis.monthlyRevenue), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10' },
    { label: 'Alertas Ativos', value: formatNumber(data.kpis.activeAlerts), icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10' },
  ] : []

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={() => fetchData()} className="text-sm text-primary underline">Tentar novamente</button>
      </div>
    )
  }

  const storagePct = data ? Math.min(100, Math.round((data.system.storageBytes / STORAGE_QUOTA_BYTES) * 100)) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Painel Administrativo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie organizações, usuários e configurações da plataforma
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Recarregar dados do painel</TooltipContent>
        </Tooltip>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview" className="gap-1.5">
            <Activity className="w-4 h-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-1.5">
            <Building2 className="w-4 h-4" />
            Organizações
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="w-4 h-4" />
            Usuários Globais
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5">
            <Server className="w-4 h-4" />
            Sistema
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Visão Geral ───────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
              : kpiCards.map((kpi) => {
                const Icon = kpi.icon
                return (
                  <Card key={kpi.label} className="relative overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                          <p className="text-xl font-bold tracking-tight">{kpi.value}</p>
                        </div>
                        <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${kpi.bgColor}`}>
                          <Icon className={`w-5 h-5 ${kpi.color}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>

          {/* Recent Organizations Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Organizações Recentes</CardTitle>
              <CardDescription>Últimas organizações cadastradas na plataforma</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="hidden sm:table-cell">Plano</TableHead>
                      <TableHead className="hidden md:table-cell">Conexões</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizations.slice(0, 5).map((org) => (
                      <TableRow
                        key={org.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedOrg(org)}
                      >
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {org.plan ? <Badge variant="outline">{org.plan}</Badge> : '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{org.connections}</TableCell>
                        <TableCell>{getStatusBadge(org.status)}</TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {formatDate(org.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Organizações ────────────────────────────────────── */}
        <TabsContent value="organizations" className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar organização..."
                className="pl-9"
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
              />
            </div>
            <Select value={orgStatusFilter} onValueChange={setOrgStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
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

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="hidden lg:table-cell">CNPJ</TableHead>
                      <TableHead className="hidden md:table-cell">Segmento</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead className="hidden md:table-cell">Conexões</TableHead>
                      <TableHead className="hidden lg:table-cell">Agentes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrganizations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                          {loading ? 'Carregando...' : 'Nenhuma organização encontrada.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrganizations.map((org) => (
                        <TableRow
                          key={org.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedOrg(org)}
                        >
                          <TableCell className="font-medium">{org.name}</TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground font-mono text-xs">
                            {org.cnpj || '—'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {org.segment}
                          </TableCell>
                          <TableCell>
                            {org.plan ? <Badge variant="outline">{org.plan}</Badge> : '—'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{org.connections}</TableCell>
                          <TableCell className="hidden lg:table-cell">{org.agents}</TableCell>
                          <TableCell>{getStatusBadge(org.status)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {formatDate(org.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Usuários Globais ─────────────────────────────────── */}
        <TabsContent value="users" className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                className="pl-9"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
            <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
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

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="hidden lg:table-cell">Email</TableHead>
                      <TableHead className="hidden md:table-cell">Organização</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Último acesso</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          {loading ? 'Carregando...' : 'Nenhum usuário encontrado.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                            {user.email}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {user.organization}
                          </TableCell>
                          <TableCell>{getRoleBadge(user.role)}</TableCell>
                          <TableCell>{getStatusBadge(user.status)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                            {user.lastAccessAt ? formatDateTime(user.lastAccessAt) : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Sistema ──────────────────────────────────────────── */}
        <TabsContent value="system" className="space-y-6">
          {/* System Health */}
          <div>
            <h3 className="text-base font-semibold mb-3">Saúde do Sistema</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Database */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10">
                      <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Banco de Dados</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${data?.system.databaseHealthy !== false ? 'bg-emerald-500 animate-pulse' : 'bg-destructive'}`} />
                        <span className={`text-xs font-medium ${data?.system.databaseHealthy !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                          {data?.system.databaseHealthy !== false ? 'Operacional' : 'Indisponível'}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Auth */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10">
                      <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Autenticação</p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Operacional</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Storage */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-500/10">
                      <HardDrive className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-sm font-medium">Armazenamento</p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{formatBytes(data?.system.storageBytes || 0)} / 10 GB</span>
                          <span className="font-medium text-teal-600 dark:text-teal-400">{storagePct}%</span>
                        </div>
                        <Progress value={storagePct} className="h-2" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Activity Log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Atividade Recente
              </CardTitle>
              <CardDescription>Últimas notificações geradas na plataforma</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Data/Hora</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead className="hidden md:table-cell">Organização</TableHead>
                      <TableHead className="hidden lg:table-cell">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.activity || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                          {loading ? 'Carregando...' : 'Nenhuma atividade recente.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (data?.activity || []).map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatDateTime(entry.timestamp)}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{entry.action}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {entry.organization}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-xs truncate">
                            {entry.details || '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Organization Detail Dialog ───────────────────────────────── */}
      <Dialog open={!!selectedOrg} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedOrg && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
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
    </div>
  )
}
