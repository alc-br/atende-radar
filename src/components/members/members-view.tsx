'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserPlus, MoreHorizontal, Mail, Shield, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'

type Role = 'admin' | 'supervisor' | 'agent'
type MemberStatus = 'active' | 'pending' | 'inactive'

interface Member {
  id: string
  name: string
  email: string
  role: Role
  team: string
  status: MemberStatus
  lastAccess: string
  avatar: string
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Atendente',
}

const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  supervisor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  agent: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
}

const STATUS_LABELS: Record<MemberStatus, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  inactive: 'Inativo',
}

const STATUS_COLORS: Record<MemberStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
}

const mockMembers: Member[] = [
  { id: '1', name: 'Ana Silva', email: 'ana@empresa.com', role: 'admin', team: 'Geral', status: 'active', lastAccess: 'Agora mesmo', avatar: 'AS' },
  { id: '2', name: 'Carlos Oliveira', email: 'carlos@empresa.com', role: 'supervisor', team: 'Vendas', status: 'active', lastAccess: 'Há 5 min', avatar: 'CO' },
  { id: '3', name: 'Maria Santos', email: 'maria@empresa.com', role: 'agent', team: 'Vendas', status: 'active', lastAccess: 'Há 12 min', avatar: 'MS' },
  { id: '4', name: 'João Lima', email: 'joao@empresa.com', role: 'agent', team: 'Suporte', status: 'active', lastAccess: 'Há 30 min', avatar: 'JL' },
  { id: '5', name: 'Fernanda Costa', email: 'fernanda@empresa.com', role: 'supervisor', team: 'Suporte', status: 'active', lastAccess: 'Há 1h', avatar: 'FC' },
  { id: '6', name: 'Pedro Rocha', email: 'pedro@empresa.com', role: 'agent', team: 'Vendas', status: 'pending', lastAccess: '—', avatar: 'PR' },
  { id: '7', name: 'Lucia Ferreira', email: 'lucia@empresa.com', role: 'agent', team: 'Suporte', status: 'inactive', lastAccess: 'Há 7 dias', avatar: 'LF' },
]

export default function MembersView() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('agent')
  const [inviteTeam, setInviteTeam] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setMembers(mockMembers)
      setLoading(false)
    }, 600)
    return () => clearTimeout(timer)
  }, [])

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleInvite = () => {
    if (!inviteEmail.trim()) return
    const newMember: Member = {
      id: String(Date.now()),
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      team: inviteTeam || 'Geral',
      status: 'pending',
      lastAccess: '—',
      avatar: inviteEmail.substring(0, 2).toUpperCase(),
    }
    setMembers((prev) => [...prev, newMember])
    setInviteEmail('')
    setInviteRole('agent')
    setInviteTeam('')
    setInviteOpen(false)
    toast.success('Convite enviado com sucesso!')
  }

  const changeRole = (id: string, role: Role) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)))
    toast.success('Função atualizada.')
  }

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id))
    toast.success('Membro removido.')
  }

  const resendInvite = (email: string) => {
    toast.success(`Convite reenviado para ${email}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Membros</h1>
          <p className="text-muted-foreground mt-1">Gerencie os membros da sua organização.</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="w-4 h-4 mr-2" />Convidar membro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar membro</DialogTitle>
              <DialogDescription>Envie um convite por e-mail para adicionar um novo membro à organização.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">E-mail</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colaborador@empresa.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Função</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="agent">Atendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Equipe</Label>
                <Select value={inviteTeam} onValueChange={setInviteTeam}>
                  <SelectTrigger><SelectValue placeholder="Selecione a equipe" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Geral">Geral</SelectItem>
                    <SelectItem value="Vendas">Vendas</SelectItem>
                    <SelectItem value="Suporte">Suporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
              <Button onClick={handleInvite} disabled={!inviteEmail.trim()}>Enviar convite</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" />Membros da organização
            </CardTitle>
            <div className="flex items-center gap-2 sm:ml-auto">
              <Input
                placeholder="Buscar membro..."
                className="w-full sm:w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">E-mail</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead className="hidden sm:table-cell">Equipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Último acesso</TableHead>
                    <TableHead className="w-10">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum membro encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                              {member.avatar}
                            </div>
                            <span className="font-medium">{member.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {member.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={ROLE_COLORS[member.role]}>
                            {ROLE_LABELS[member.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{member.team}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[member.status]}>
                            {STATUS_LABELS[member.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                          {member.lastAccess}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => changeRole(member.id, 'admin')}>
                                <Shield className="w-4 h-4 mr-2" />Tornar admin
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => changeRole(member.id, 'supervisor')}>
                                <Shield className="w-4 h-4 mr-2" />Tornar supervisor
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => changeRole(member.id, 'agent')}>
                                <Shield className="w-4 h-4 mr-2" />Tornar atendente
                              </DropdownMenuItem>
                              {member.status === 'pending' && (
                                <DropdownMenuItem onClick={() => resendInvite(member.email)}>
                                  <Mail className="w-4 h-4 mr-2" />Reenviar convite
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => removeMember(member.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />Remover
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
