'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { UserPlus, MoreHorizontal, Shield, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/utils'

type Role = 'admin' | 'gestor' | 'supervisor' | 'analista' | 'member' | 'atendente' | 'viewer'

interface Member {
  id: string
  name: string
  email: string
  role: string
  team: string | null
  status: string
  lastAccessAt: string | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  supervisor: 'Supervisor',
  analista: 'Analista',
  member: 'Membro',
  atendente: 'Atendente',
  viewer: 'Visualizador',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  gestor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  supervisor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  analista: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  member: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  atendente: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  inactive: 'Inativo',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
}

export default function MembersView() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('member')
  const [inviteTeam, setInviteTeam] = useState('')
  const [search, setSearch] = useState('')

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/members')
      if (!res.ok) throw new Error('Erro ao carregar membros')
      const data = await res.json()
      setMembers(data.members || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) return
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          role: inviteRole,
          team: inviteTeam || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao adicionar membro')
      }
      toast.success('Membro adicionado com sucesso!')
      setInviteName('')
      setInviteEmail('')
      setInviteRole('member')
      setInviteTeam('')
      setInviteOpen(false)
      fetchMembers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar membro')
    }
  }

  const changeRole = async (id: string, role: Role) => {
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error('Erro ao atualizar função')
      toast.success('Função atualizada.')
      fetchMembers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar função')
    }
  }

  const removeMember = async (id: string) => {
    try {
      const res = await fetch(`/api/members/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao remover membro')
      toast.success('Membro removido.')
      fetchMembers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover membro')
    }
  }

  const initials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={fetchMembers} className="text-sm text-primary underline">Tentar novamente</button>
      </div>
    )
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
            <Button data-tour="members-add"><UserPlus className="w-4 h-4 mr-2" />Adicionar membro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar membro</DialogTitle>
              <DialogDescription>Adicione um novo membro à organização.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Nome</Label>
                <Input
                  id="invite-name"
                  placeholder="Nome completo"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </div>
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
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-team">Equipe</Label>
                <Input
                  id="invite-team"
                  placeholder="Ex.: Recepção"
                  value={inviteTeam}
                  onChange={(e) => setInviteTeam(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
              <Button onClick={handleInvite} disabled={!inviteName.trim() || !inviteEmail.trim()}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-tour="members-table">
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
                              {initials(member.name)}
                            </div>
                            <span className="font-medium">{member.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {member.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={ROLE_COLORS[member.role] || ROLE_COLORS.member}>
                            {ROLE_LABELS[member.role] || member.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{member.team || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[member.status] || STATUS_COLORS.active}>
                            {STATUS_LABELS[member.status] || member.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                          {member.lastAccessAt ? timeAgo(member.lastAccessAt) : '—'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {Object.entries(ROLE_LABELS)
                                .filter(([value]) => value !== member.role)
                                .map(([value, label]) => (
                                  <DropdownMenuItem key={value} onClick={() => changeRole(member.id, value as Role)}>
                                    <Shield className="w-4 h-4 mr-2" />Tornar {label.toLowerCase()}
                                  </DropdownMenuItem>
                                ))}
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
