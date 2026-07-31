'use client'

import { useState, useMemo } from 'react'
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
  Plus,
  RefreshCw,
  Settings,
  Globe,
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
import { Switch } from '@/components/ui/switch'
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
import { Label } from '@/components/ui/label'

// ─── Mock Data ────────────────────────────────────────────────────────────

const mockKpis = {
  activeOrgs: 47,
  whatsappConnections: 128,
  totalUsers: 342,
  conversationsToday: 1_847,
  monthlyRevenue: 89750,
  activeAlerts: 12,
}

const mockOrganizations = [
  { id: '1', name: 'TechSoft Brasil', cnpj: '12.345.678/0001-90', segment: 'Tecnologia', plan: 'Empresarial', connections: 8, agents: 24, status: 'Ativa', createdAt: '2024-03-15' },
  { id: '2', name: 'Clínica Saúde+', cnpj: '23.456.789/0001-01', segment: 'Saúde', plan: 'Profissional', connections: 3, agents: 12, status: 'Ativa', createdAt: '2024-05-22' },
  { id: '3', name: 'Imobiliária Casa Nova', cnpj: '34.567.890/0001-12', segment: 'Imobiliário', plan: 'Starter', connections: 2, agents: 5, status: 'Suspensa', createdAt: '2024-07-10' },
  { id: '4', name: 'Loja Virtual Express', cnpj: '45.678.901/0001-23', segment: 'E-commerce', plan: 'Empresarial', connections: 12, agents: 38, status: 'Ativa', createdAt: '2024-01-08' },
  { id: '5', name: 'Consultoria Jurídica Silva', cnpj: '56.789.012/0001-34', segment: 'Jurídico', plan: 'Profissional', connections: 2, agents: 8, status: 'Ativa', createdAt: '2024-06-30' },
  { id: '6', name: 'Auto Peças Central', cnpj: '67.890.123/0001-45', segment: 'Automotivo', plan: 'Starter', connections: 1, agents: 3, status: 'Inativa', createdAt: '2024-09-12' },
  { id: '7', name: 'Academia FitPro', cnpj: '78.901.234/0001-56', segment: 'Fitness', plan: 'Profissional', connections: 4, agents: 10, status: 'Ativa', createdAt: '2024-04-18' },
  { id: '8', name: 'Restaurante Sabor Mineiro', cnpj: '89.012.345/0001-67', segment: 'Alimentação', plan: 'Starter', connections: 2, agents: 6, status: 'Ativa', createdAt: '2024-08-05' },
  { id: '9', name: 'Escola Idiomas Global', cnpj: '90.123.456/0001-78', segment: 'Educação', plan: 'Empresarial', connections: 6, agents: 18, status: 'Ativa', createdAt: '2024-02-20' },
  { id: '10', name: 'Seguradora Protege+', cnpj: '01.234.567/0001-89', segment: 'Seguros', plan: 'Empresarial', connections: 10, agents: 32, status: 'Ativa', createdAt: '2024-01-03' },
]

const mockGlobalUsers = [
  { id: '1', name: 'Carlos Mendes', email: 'carlos@techsoft.com.br', organization: 'TechSoft Brasil', role: 'admin', status: 'Ativo', lastAccess: '2025-01-15T14:32:00' },
  { id: '2', name: 'Ana Beatriz Lima', email: 'ana.lima@clinicasaude.com.br', organization: 'Clínica Saúde+', role: 'gestor', status: 'Ativo', lastAccess: '2025-01-15T13:10:00' },
  { id: '3', name: 'Roberto Silva', email: 'roberto@imobiliariacasanova.com.br', organization: 'Imobiliária Casa Nova', role: 'admin', status: 'Ativo', lastAccess: '2025-01-14T16:45:00' },
  { id: '4', name: 'Fernanda Costa', email: 'fernanda@lojaexpress.com.br', organization: 'Loja Virtual Express', role: 'gestor', status: 'Ativo', lastAccess: '2025-01-15T10:20:00' },
  { id: '5', name: 'Pedro Almeida', email: 'pedro.almeida@consultoria.com.br', organization: 'Consultoria Jurídica Silva', role: 'admin', status: 'Inativo', lastAccess: '2024-12-20T09:15:00' },
  { id: '6', name: 'Juliana Santos', email: 'juliana@fitpro.com.br', organization: 'Academia FitPro', role: 'membro', status: 'Ativo', lastAccess: '2025-01-15T08:50:00' },
  { id: '7', name: 'Lucas Oliveira', email: 'lucas@sabormineiro.com.br', organization: 'Restaurante Sabor Mineiro', role: 'atendente', status: 'Ativo', lastAccess: '2025-01-15T11:05:00' },
  { id: '8', name: 'Mariana Ferreira', email: 'mariana@globalidiomas.com.br', organization: 'Escola Idiomas Global', role: 'gestor', status: 'Ativo', lastAccess: '2025-01-15T15:40:00' },
  { id: '9', name: 'Thiago Barbosa', email: 'thiago@protegeplus.com.br', organization: 'Seguradora Protege+', role: 'admin', status: 'Ativo', lastAccess: '2025-01-15T12:30:00' },
  { id: '10', name: 'Camila Rodrigues', email: 'camila@lojaexpress.com.br', organization: 'Loja Virtual Express', role: 'atendente', status: 'Ativo', lastAccess: '2025-01-15T09:00:00' },
  { id: '11', name: 'Diego Martins', email: 'diego@autopartescentral.com.br', organization: 'Auto Peças Central', role: 'admin', status: 'Inativo', lastAccess: '2024-11-30T14:20:00' },
  { id: '12', name: 'Isabela Nascimento', email: 'isabela@clinicasaude.com.br', organization: 'Clínica Saúde+', role: 'atendente', status: 'Ativo', lastAccess: '2025-01-15T07:30:00' },
]

const mockActivityLog = [
  { id: '1', timestamp: '2025-01-15T15:42:00', action: 'Organização criada', user: 'Sistema', details: 'Nova organização "Escola Idiomas Global" registrada' },
  { id: '2', timestamp: '2025-01-15T15:30:00', action: 'Conexão WhatsApp', user: 'Carlos Mendes', details: 'Nova conexão "+55 11 98765-4321" ativada' },
  { id: '3', timestamp: '2025-01-15T14:55:00', action: 'Plano alterado', user: 'Sistema', details: 'Imobiliária Casa Nova: Profissional → Starter' },
  { id: '4', timestamp: '2025-01-15T14:20:00', action: 'Usuário suspenso', user: 'Carlos Mendes', details: 'Pedro Almeida suspenso por inatividade' },
  { id: '5', timestamp: '2025-01-15T13:10:00', action: 'Login admin', user: 'Carlos Mendes', details: 'Login bem-sucedido via SSO' },
  { id: '6', timestamp: '2025-01-15T12:00:00', action: 'Backup automático', user: 'Sistema', details: 'Backup diário concluído (2.3 GB)' },
  { id: '7', timestamp: '2025-01-15T10:30:00', action: 'Alerta resolvido', user: 'Ana Beatriz Lima', details: 'Alerta #4821: tempo de resposta acima do SLA' },
  { id: '8', timestamp: '2025-01-15T09:15:00', action: 'Integração configurada', user: 'Fernanda Costa', details: 'Webhook configurado para Loja Virtual Express' },
]

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

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'Ativa':
    case 'Ativo':
      return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25">{status}</Badge>
    case 'Suspensa':
    case 'Suspenso':
      return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/25">{status}</Badge>
    case 'Inativa':
    case 'Inativo':
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">{status}</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

const getRoleBadge = (role: string) => {
  switch (role) {
    case 'admin':
      return <Badge className="bg-destructive/15 text-destructive border-destructive/25 hover:bg-destructive/25">Administrador</Badge>
    case 'gestor':
      return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25">Gestor</Badge>
    case 'membro':
      return <Badge variant="secondary">Membro</Badge>
    case 'atendente':
      return <Badge variant="secondary">Atendente</Badge>
    default:
      return <Badge variant="secondary">{role}</Badge>
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export default function AdminView() {
  // Organizações tab state
  const [orgSearch, setOrgSearch] = useState('')
  const [orgStatusFilter, setOrgStatusFilter] = useState('todas')
  const [selectedOrg, setSelectedOrg] = useState<(typeof mockOrganizations)[0] | null>(null)

  // Usuários tab state
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('todos')

  // Sistema tab state
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [platformName, setPlatformName] = useState('AtendeRadar')
  const [supportEmail, setSupportEmail] = useState('suporte@atenderadar.com.br')

  // ─── Derived Data ──────────────────────────────────────────────────────

  const filteredOrganizations = useMemo(() => {
    return mockOrganizations.filter((org) => {
      const matchesSearch = org.name.toLowerCase().includes(orgSearch.toLowerCase())
      const matchesStatus = orgStatusFilter === 'todas' || org.status === orgStatusFilter
      return matchesSearch && matchesStatus
    })
  }, [orgSearch, orgStatusFilter])

  const filteredUsers = useMemo(() => {
    return mockGlobalUsers.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearch.toLowerCase())
      const matchesRole = userRoleFilter === 'todos' || user.role === userRoleFilter
      return matchesSearch && matchesRole
    })
  }, [userSearch, userRoleFilter])

  // ─── KPI Cards ─────────────────────────────────────────────────────────

  const kpiCards = [
    { label: 'Organizações Ativas', value: formatNumber(mockKpis.activeOrgs), icon: Building2, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10' },
    { label: 'Conexões WhatsApp', value: formatNumber(mockKpis.whatsappConnections), icon: MessageSquare, color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-500/10' },
    { label: 'Usuários Cadastrados', value: formatNumber(mockKpis.totalUsers), icon: Users, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10' },
    { label: 'Conversas Hoje', value: formatNumber(mockKpis.conversationsToday), icon: Activity, color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-500/10' },
    { label: 'Receita Mensal', value: formatCurrency(mockKpis.monthlyRevenue), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10' },
    { label: 'Alertas Ativos', value: formatNumber(mockKpis.activeAlerts), icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10' },
  ]

  // ─── Render ────────────────────────────────────────────────────────────

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
              onClick={() => toast.success('Dados atualizados com sucesso')}
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
            {kpiCards.map((kpi) => {
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
                    {mockOrganizations.slice(0, 5).map((org) => (
                      <TableRow
                        key={org.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedOrg(org)}
                      >
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline">{org.plan}</Badge>
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
                <SelectItem value="Ativa">Ativa</SelectItem>
                <SelectItem value="Suspensa">Suspensa</SelectItem>
                <SelectItem value="Inativa">Inativa</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              onClick={() => toast.info('Funcionalidade em desenvolvimento')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Organização
            </Button>
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
                          Nenhuma organização encontrada.
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
                            {org.cnpj}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {org.segment}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{org.plan}</Badge>
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
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="membro">Membro</SelectItem>
                <SelectItem value="atendente">Atendente</SelectItem>
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
                          Nenhum usuário encontrado.
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
                            {formatDateTime(user.lastAccess)}
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
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Operacional</span>
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
                          <span>2.3 GB / 10 GB</span>
                          <span className="font-medium text-teal-600 dark:text-teal-400">23%</span>
                        </div>
                        <Progress value={23} className="h-2" />
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
              <CardDescription>Registro das ações mais recentes na plataforma</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Data/Hora</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead className="hidden md:table-cell">Usuário</TableHead>
                      <TableHead className="hidden lg:table-cell">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockActivityLog.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {formatDateTime(entry.timestamp)}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{entry.action}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {entry.user}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-xs truncate">
                          {entry.details}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                Configurações da Plataforma
              </CardTitle>
              <CardDescription>Ajustes globais do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Platform Name */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="platform-name">Nome da Plataforma</Label>
                  <p className="text-xs text-muted-foreground">
                    Nome exibido em e-mails, notificações e páginas públicas
                  </p>
                </div>
                <Input
                  id="platform-name"
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="sm:max-w-xs"
                />
              </div>

              <Separator />

              {/* Support Email */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="support-email">Email de Suporte</Label>
                  <p className="text-xs text-muted-foreground">
                    Endereço de email para contato de suporte técnico
                  </p>
                </div>
                <Input
                  id="support-email"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="sm:max-w-xs"
                />
              </div>

              <Separator />

              {/* Maintenance Mode */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                  <Label>Modo de Manutenção</Label>
                  <p className="text-xs text-muted-foreground">
                    Ativar modo de manutenção impede o acesso de todos os usuários não-administradores
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {maintenanceMode && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Ativado
                    </Badge>
                  )}
                  <Switch
                    checked={maintenanceMode}
                    onCheckedChange={(checked) => {
                      setMaintenanceMode(checked)
                      toast.info(
                        checked
                          ? 'Modo de manutenção ativado'
                          : 'Modo de manutenção desativado'
                      )
                    }}
                  />
                </div>
              </div>

              <Separator />

              {/* Save Button */}
              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => toast.success('Configurações salvas com sucesso')}
                >
                  Salvar Configurações
                </Button>
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
                    <p className="font-mono">{selectedOrg.cnpj}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Segmento</p>
                    <p>{selectedOrg.segment}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Plano</p>
                    <Badge variant="outline">{selectedOrg.plan}</Badge>
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
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => toast.info('Funcionalidade em desenvolvimento')}
                  >
                    Editar
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => toast.info('Funcionalidade em desenvolvimento')}
                  >
                    Ver Dashboard
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
