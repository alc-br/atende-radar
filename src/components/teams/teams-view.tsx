'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Users, Plus, UserCircle, Activity } from 'lucide-react'
import { toast } from 'sonner'

interface Team {
  id: string
  name: string
  supervisor: string
  memberCount: number
  active: boolean
  members: string[]
}

const mockTeams: Team[] = [
  { id: '1', name: 'Vendas', supervisor: 'Carlos Oliveira', memberCount: 3, active: true, members: ['Maria Santos', 'Pedro Rocha'] },
  { id: '2', name: 'Suporte', supervisor: 'Fernanda Costa', memberCount: 2, active: true, members: ['João Lima'] },
  { id: '3', name: 'Retenção', supervisor: 'Ana Silva', memberCount: 1, active: false, members: [] },
]

const supervisorOptions = [
  'Ana Silva', 'Carlos Oliveira', 'Fernanda Costa', 'Maria Santos',
]

export default function TeamsView() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSupervisor, setNewSupervisor] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setTeams(mockTeams)
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const handleCreate = () => {
    if (!newName.trim() || !newSupervisor) return
    const team: Team = {
      id: String(Date.now()),
      name: newName,
      supervisor: newSupervisor,
      memberCount: 0,
      active: true,
      members: [],
    }
    setTeams((prev) => [...prev, team])
    setNewName('')
    setNewSupervisor('')
    setCreateOpen(false)
    toast.success(`Equipe "${team.name}" criada com sucesso!`)
  }

  const toggleActive = (id: string) => {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, active: !t.active } : t)))
    toast.success('Status da equipe atualizado.')
  }

  const totalMembers = teams.reduce((sum, t) => sum + t.memberCount, 0)
  const activeTeams = teams.filter((t) => t.active).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipes</h1>
          <p className="text-muted-foreground mt-1">Gerencie equipes e unidades da organização.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Criar equipe</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar equipe</DialogTitle>
              <DialogDescription>Adicione uma nova equipe à sua organização.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="team-name">Nome da equipe</Label>
                <Input
                  id="team-name"
                  placeholder="Ex: Vendas Premium"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Supervisor</Label>
                <Select value={newSupervisor} onValueChange={setNewSupervisor}>
                  <SelectTrigger><SelectValue placeholder="Selecione o supervisor" /></SelectTrigger>
                  <SelectContent>
                    {supervisorOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || !newSupervisor}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{teams.length}</p>
              <p className="text-xs text-muted-foreground">Equipes totais</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeTeams}</p>
              <p className="text-xs text-muted-foreground">Equipes ativas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <UserCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalMembers}</p>
              <p className="text-xs text-muted-foreground">Membros totais</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))
          : teams.map((team) => (
              <Card key={team.id} className={!team.active ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{team.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">Supervisor: {team.supervisor}</CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={team.active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400'
                      }
                    >
                      {team.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Membros</span>
                    <span className="font-medium">{team.memberCount}</span>
                  </div>
                  {team.members.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {team.members.map((m) => (
                        <Badge key={m} variant="outline" className="text-xs font-normal">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => toggleActive(team.id)}
                  >
                    {team.active ? 'Desativar' : 'Ativar'} equipe
                  </Button>
                </CardContent>
              </Card>
            ))
        }
      </div>
    </div>
  )
}
