'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Users, UsersRound, Plus, UserCircle, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/permissions'

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
  const me = useAppStore((s) => s.me)
  const canManage = can(me?.role, 'teams.manage')
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
      <div className="cartao vazio" role="alert">
        <strong>{error}</strong>
        <button type="button" onClick={fetchData} className="btn btn--sm mt-3">Tentar novamente</button>
      </div>
    )
  }

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><UsersRound className="ic" /></span>
          <div>
            <h1>Equipes</h1>
            <p>Gerencie equipes e unidades da organização.</p>
          </div>
        </div>
        {canManage && (
          <div className="cab-pagina__acoes">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <button type="button" className="btn btn--primario" data-tour="teams-create"><Plus className="ic" aria-hidden="true" />Criar equipe</button>
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
                      <SelectTrigger aria-label="Selecione o supervisor"><SelectValue placeholder="Selecione o supervisor" /></SelectTrigger>
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
        )}
      </div>

      <section className="grade grade-3" aria-label="Resumo das equipes">
        <article className="cartao kpi-h kpi-h--grande">
          <span className="kpi__icone tom-verde" aria-hidden="true"><Users className="ic" /></span>
          <div><p className="kpi-h__rotulo">Equipes totais</p><p className="kpi-h__valor">{teams.length}</p></div>
        </article>
        <article className="cartao kpi-h kpi-h--grande">
          <span className="kpi__icone tom-azul" aria-hidden="true"><Activity className="ic" /></span>
          <div><p className="kpi-h__rotulo">Equipes ativas</p><p className="kpi-h__valor">{activeTeams}</p></div>
        </article>
        <article className="cartao kpi-h kpi-h--grande">
          <span className="kpi__icone tom-laranja" aria-hidden="true"><UserCircle className="ic" /></span>
          <div><p className="kpi-h__rotulo">Membros totais</p><p className="kpi-h__valor">{totalMembers}</p></div>
        </article>
      </section>

      <div data-tour="teams-list" className="grade grade-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div className="cartao cartao--pad space-y-3" key={i}>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))
          : teams.length === 0
            ? (
              <div className="cartao vazio col-span-full">
                <UsersRound className="ic" aria-hidden="true" />
                <strong>Nenhuma equipe cadastrada</strong>
                {canManage ? 'Use "Criar equipe" para organizar os atendentes.' : 'Ainda não há equipes nesta organização.'}
              </div>
            )
            : teams.map((team) => (
              <section key={team.id} className={`cartao flex flex-col ${!team.active ? 'opacity-70' : ''}`} aria-labelledby={`equipe-${team.id}`}>
                <div className="cartao__cab">
                  <div className="linha-flex">
                    <span className="cab-pagina__icone cab-pagina__icone--caixa mini-caixa" aria-hidden="true"><Users className="ic" /></span>
                    <div>
                      <h2 id={`equipe-${team.id}`}>{team.name}</h2>
                      <p>Supervisor: {team.supervisorName || 'Não definido'}</p>
                    </div>
                  </div>
                  <span className={`tag ${team.active ? 'tag--verde' : 'tag--cinza'}`}>
                    {team.active && <span className="ponto" aria-hidden="true" />}
                    {team.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <div className="cartao__corpo flex flex-1 flex-col gap-3">
                  <div className="linha-flex entre text-[13.5px]">
                    <span className="suave">Membros</span>
                    <span className="forte">{team.memberCount}</span>
                  </div>
                  {team.members.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Membros de ${team.name}`}>
                      {team.members.map((m) => (
                        <li key={m} className="tag tag--contorno">{m}</li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="btn btn--sm mt-auto w-full justify-center" onClick={() => toggleActive(team)}>
                    {team.active ? 'Desativar' : 'Ativar'} equipe
                  </button>
                </div>
              </section>
            ))
        }
      </div>
    </>
  )
}
