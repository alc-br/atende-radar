'use client'

import { useState, useEffect, useCallback } from 'react'
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
  code: string
  supervisorId: string | null
  supervisorName: string | null
  active: boolean
  memberCount: number
  members: string[]
}

interface AgentOption {
  id: string
  name: string
}

const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export default function TeamsView() {
  const [teams, setTeams] = useState<Team[]>([])
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSupervisorId, setNewSupervisorId] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [teamsRes, agentsRes] = await Promise.all([
        fetch('/api/teams'),
        fetch('/api/team'),
      ])
      if (!teamsRes.ok) throw new Error('Erro ao carregar equipes')
      const teamsData = await teamsRes.json()
      setTeams(teamsData.teams || [])
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json()
        setAgents((agentsData.agents || []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCreate = async () => {
    if (!newName.trim() || !newSupervisorId) return
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          code: slugify(newName),
          supervisorId: newSupervisorId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao criar equipe')
      }
      toast.success(`Equipe "${newName}" criada com sucesso!`)
      setNewName('')
      setNewSupervisorId('')
      setCreateOpen(false)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar equipe')
    }
  }

  const toggleActive = async (team: Team) => {
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !team.active }),
      })
      if (!res.ok) throw new Error('Erro ao atualizar equipe')
      toast.success('Status da equipe atualizado.')
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar equipe')
    }
  }

  const totalMembers = teams.reduce((sum, t) => sum + t.memberCount, 0)
  const activeTeams = teams.filter((t) => t.active).length

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={fetchData} className="text-sm text-primary underline">Tentar novamente</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipes</h1>
          <p className="text-muted-foreground mt-1">Gerencie equipes e unidades da organização.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-tour="teams-create"><Plus className="w-4 h-4 mr-2" />Criar equipe</Button>
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
                <Select value={newSupervisorId} onValueChange={setNewSupervisorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o supervisor" /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || !newSupervisorId}>Criar</Button>
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
      <div data-tour="teams-list" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                        <CardDescription className="text-xs mt-0.5">
                          Supervisor: {team.supervisorName || 'Não definido'}
                        </CardDescription>
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
                    onClick={() => toggleActive(team)}
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
