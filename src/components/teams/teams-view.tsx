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
import { Users, UsersRound, Plus, UserCircle, Activity, UserPlus, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { can, roleName } from '@/lib/permissions'
import { tourSignal } from '@/lib/system-tour/signals'
import { showInviteLink } from '@/lib/invite-toast'

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

interface SupervisorOption {
  id: string
  name: string
  role: string
  pending: boolean
}

// Valor especial do seletor: abre o cadastro de um membro supervisor sem sair do "Criar equipe"
const ADD_SUPERVISOR = '__novo__'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSupervisorId, setNewSupervisorId] = useState('')
  // cadastro rápido de supervisor dentro do diálogo (sem membros que possam supervisionar, ou para alguém novo)
  const [addingSupervisor, setAddingSupervisor] = useState(false)
  const [supName, setSupName] = useState('')
  const [supEmail, setSupEmail] = useState('')
  const [supSaving, setSupSaving] = useState(false)
  const canInvite = can(me?.role, 'members.manage')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const teamsRes = await fetch('/api/teams')
      if (!teamsRes.ok) throw new Error('Erro ao carregar equipes')
      const teamsData = await teamsRes.json()
      setTeams(teamsData.teams || [])
      setSupervisors(teamsData.supervisorOptions || [])
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
      tourSignal('team.created')
      setNewName('')
      setNewSupervisorId('')
      setCreateOpen(false)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar equipe')
    }
  }

  const openCreate = (open: boolean) => {
    setCreateOpen(open)
    if (!open) { setAddingSupervisor(false); setSupName(''); setSupEmail('') }
  }

  // Convida o membro com o papel Supervisor e volta ao "Criar equipe" com ele já escolhido
  const handleAddSupervisor = async () => {
    if (!supName.trim() || !EMAIL_RE.test(supEmail.trim())) return
    setSupSaving(true)
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: supName.trim(), email: supEmail.trim(), role: 'supervisor', team: newName.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao adicionar membro')
      await showInviteLink(supEmail.trim(), data.inviteLink, 'Convite criado.', data.emailStatus)
      const m = data.member as { id: string; name: string }
      setSupervisors((list) => [{ id: m.id, name: m.name, role: 'supervisor', pending: true }, ...list])
      setNewSupervisorId(m.id)
      setAddingSupervisor(false)
      setSupName('')
      setSupEmail('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar membro')
    } finally {
      setSupSaving(false)
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
            <Dialog open={createOpen} onOpenChange={openCreate}>
              <DialogTrigger asChild>
                <button type="button" className="btn btn--primario" data-tour="teams-create"><Plus className="ic" aria-hidden="true" />Criar equipe</button>
              </DialogTrigger>
              <DialogContent>
                {addingSupervisor ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Criar equipe</DialogTitle>
                      <DialogDescription>Adicionar membro supervisor: ele recebe um convite por e-mail para criar a senha.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4" data-testid="add-supervisor-form">
                      <div className="space-y-2">
                        <Label htmlFor="sup-name">Nome do supervisor</Label>
                        <Input id="sup-name" placeholder="Nome completo" value={supName} onChange={(e) => setSupName(e.target.value)} autoFocus />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sup-email">E-mail</Label>
                        <Input id="sup-email" type="email" placeholder="supervisor@empresa.com" value={supEmail} onChange={(e) => setSupEmail(e.target.value)} />
                      </div>
                      <p className="suave text-[13px]">Função: <b>{roleName('supervisor')}</b>. Ele enxerga só a equipe dele (e o que ainda não tem atendente).</p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddingSupervisor(false)}><ArrowLeft className="ic" aria-hidden="true" />Voltar</Button>
                      <Button onClick={handleAddSupervisor} disabled={supSaving || !supName.trim() || !EMAIL_RE.test(supEmail.trim())}>Adicionar e escolher</Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
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
                    <Select
                      value={newSupervisorId}
                      onValueChange={(v) => (v === ADD_SUPERVISOR ? setAddingSupervisor(true) : setNewSupervisorId(v))}
                    >
                      <SelectTrigger aria-label="Selecione o supervisor"><SelectValue placeholder="Selecione o supervisor" /></SelectTrigger>
                      <SelectContent>
                        {supervisors.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} <span className="suave">· {roleName(a.role)}{a.pending ? ' (convite pendente)' : ''}</span>
                          </SelectItem>
                        ))}
                        {canInvite && (
                          <SelectItem value={ADD_SUPERVISOR} data-testid="add-supervisor-option">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--verde-700)]"><UserPlus className="ic" aria-hidden="true" />Adicionar membro supervisor</span>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {supervisors.length === 0 && (
                      <p className="suave text-[13px]">
                        Ainda não há membros que possam supervisionar.{' '}
                        {canInvite && <button type="button" className="link-verde border-0 bg-transparent p-0 font-semibold" onClick={() => setAddingSupervisor(true)}>Adicionar membro supervisor</button>}
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => openCreate(false)}>Cancelar</Button>
                  <Button onClick={handleCreate} disabled={!newName.trim() || !newSupervisorId}>Criar</Button>
                </DialogFooter>
                  </>
                )}
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
