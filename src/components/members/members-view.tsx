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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { UserPlus, MoreHorizontal, Shield, Trash2, Users, UsersRound, Search, Send, MailX } from 'lucide-react'
import { toast } from 'sonner'
import { showInviteLink } from '@/lib/invite-toast'
import { timeAgo } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { can, ROLE_DESCRIPTIONS } from '@/lib/permissions'
import { HelpTip } from '@/components/ui/help-tip'
import { tourSignal } from '@/lib/system-tour/signals'

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

const ROLE_TAGS: Record<string, string> = {
  admin: 'tag--roxo',
  gestor: 'tag--azul',
  supervisor: 'tag--ambar',
  analista: 'tag--verde',
  member: 'tag--azul',
  atendente: 'tag--azul',
  viewer: 'tag--cinza',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  invited: 'Convite enviado',
  suspended: 'Suspenso',
  inactive: 'Inativo',
}

const STATUS_TAGS: Record<string, string> = {
  active: 'tag--verde',
  pending: 'tag--ambar',
  invited: 'tag--ambar',
  suspended: 'tag--vermelho',
  inactive: 'tag--cinza',
}

export default function MembersView() {
  const me = useAppStore((s) => s.me)
  const canManage = can(me?.role, 'members.manage')
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
      const created = await res.json().catch(() => ({}))
      await showInviteLink(inviteEmail, created.inviteLink, 'Convite criado.', created.emailStatus)
      tourSignal('member.invited')
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

  // Equipe do membro: para supervisor, define O QUE ele enxerga (só a equipe dele + o não atribuído).
  const [teamEdit, setTeamEdit] = useState<{ id: string; name: string; team: string } | null>(null)
  const saveTeam = async () => {
    if (!teamEdit) return
    try {
      const res = await fetch(`/api/members/${teamEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: teamEdit.team.trim() }),
      })
      if (!res.ok) throw new Error('Erro ao definir equipe')
      toast.success(teamEdit.team.trim() ? `Equipe definida: ${teamEdit.team.trim()}.` : 'Equipe removida.')
      setTeamEdit(null)
      fetchMembers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao definir equipe')
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

  // Convite pendente: reenviar (link novo; o anterior deixa de valer) ou cancelar (com confirmação).
  // emailStatus: sent | queued (sem provedor de e-mail) | failed (o provedor recusou; o sistema tenta de novo sozinho)
  const resendInvite = async (member: Member) => {
    try {
      const res = await fetch(`/api/members/${member.id}/invite`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao reenviar convite')
      await showInviteLink(member.email, data.inviteLink, 'Convite reenviado.', data.emailStatus)
      fetchMembers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reenviar convite')
    }
  }

  const [cancelTarget, setCancelTarget] = useState<Member | null>(null)
  const [canceling, setCanceling] = useState(false)
  const cancelInvite = async () => {
    if (!cancelTarget) return
    setCanceling(true)
    try {
      const res = await fetch(`/api/members/${cancelTarget.id}/invite`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao cancelar convite')
      }
      toast.success(`Convite de ${cancelTarget.email} cancelado.`)
      setCancelTarget(null)
      fetchMembers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cancelar convite')
    } finally {
      setCanceling(false)
    }
  }

  const initials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

  if (error) {
    return (
      <div className="cartao vazio" role="alert">
        <strong>{error}</strong>
        <button type="button" onClick={fetchMembers} className="btn btn--sm mt-3">Tentar novamente</button>
      </div>
    )
  }

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Users className="ic" /></span>
          <div>
            <h1>Membros</h1>
            <p>Gerencie os membros da sua organização.</p>
          </div>
        </div>
        {canManage && (
          <div className="cab-pagina__acoes">
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <button type="button" className="btn btn--primario" data-tour="members-add"><UserPlus className="ic" aria-hidden="true" />Adicionar membro</button>
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
                    <div className="rotulo-ajuda">
                      <Label>Função</Label>
                      <HelpTip label="cada função">
                        <dl className="grid gap-2">
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <div key={value}><dt className="font-semibold">{label}</dt><dd className="text-muted-foreground">{ROLE_DESCRIPTIONS[value as Role]}</dd></div>
                          ))}
                        </dl>
                      </HelpTip>
                    </div>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                      <SelectTrigger aria-label="Função"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="funcao-desc" data-testid="role-description" aria-live="polite">
                      <Shield className="ic" aria-hidden="true" />
                      <span><b>{ROLE_LABELS[inviteRole]}:</b> {ROLE_DESCRIPTIONS[inviteRole]}</span>
                    </p>
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
        )}
      </div>

      <section className="cartao" data-tour="members-table" aria-labelledby="t-membros">
        <div className="cartao__cab flex-wrap">
          <div className="linha-flex">
            <span className="cab-pagina__icone cab-pagina__icone--caixa mini-caixa" aria-hidden="true"><Users className="ic" /></span>
            <div><h2 id="t-membros">Membros da organização</h2><p>{loading ? 'Carregando…' : `${members.length} ${members.length === 1 ? 'membro' : 'membros'}`}</p></div>
          </div>
          <label className="entrada-ic w-full sm:w-64">
            <Search className="ic" aria-hidden="true" />
            <span className="sr-only">Buscar membro</span>
            <input
              className="entrada"
              type="search"
              placeholder="Buscar membro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="cartao__corpo">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Membros da organização">
              <table className="tabela tabela--cab-cinza tabela--equipe">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th className="hidden md:table-cell">E-mail</th>
                    <th>Função</th>
                    <th className="hidden sm:table-cell">Equipe</th>
                    <th>Status</th>
                    <th className="hidden lg:table-cell">Último acesso</th>
                    <th className="centro w-10">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="centro suave py-8">Nenhum membro encontrado.</td>
                    </tr>
                  ) : (
                    filtered.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <div className="pessoa pessoa--forte">
                            <span className="av av--verde" aria-hidden="true">{initials(member.name)}</span>
                            <span><strong>{member.name}</strong><small className="md:hidden">{member.email}</small></span>
                          </div>
                        </td>
                        <td className="hidden md:table-cell suave">{member.email}</td>
                        <td><span className={`tag ${ROLE_TAGS[member.role] || ROLE_TAGS.member}`}>{ROLE_LABELS[member.role] || member.role}</span></td>
                        <td className="hidden sm:table-cell">{member.team ? <span className="tag tag--azul">{member.team}</span> : '—'}</td>
                        <td>
                          <span className={`tag ${STATUS_TAGS[member.status] || STATUS_TAGS.active}`}>
                            {member.status === 'active' && <span className="ponto" aria-hidden="true" />}
                            {STATUS_LABELS[member.status] || member.status}
                          </span>
                        </td>
                        <td className="hidden lg:table-cell suave">{member.lastAccessAt ? timeAgo(member.lastAccessAt) : '—'}</td>
                        <td className="centro">
                          {canManage && <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" aria-label="Mais ações" className="reticencias">
                                <MoreHorizontal className="ic" aria-hidden="true" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {Object.entries(ROLE_LABELS)
                                .filter(([value]) => value !== member.role)
                                .map(([value, label]) => (
                                  <DropdownMenuItem key={value} title={ROLE_DESCRIPTIONS[value as Role]} onClick={() => changeRole(member.id, value as Role)}>
                                    <Shield className="w-4 h-4 mr-2" />Tornar {label.toLowerCase()}
                                  </DropdownMenuItem>
                                ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setTeamEdit({ id: member.id, name: member.name, team: member.team || '' })}>
                                <UsersRound className="w-4 h-4 mr-2" />Definir equipe
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {member.status === 'invited' ? (
                                <>
                                  <DropdownMenuItem onClick={() => resendInvite(member)}>
                                    <Send className="w-4 h-4 mr-2" />Reenviar convite
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => setCancelTarget(member)}>
                                    <MailX className="w-4 h-4 mr-2" />Cancelar convite
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => removeMember(member.id)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />Remover
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <Dialog open={!!teamEdit} onOpenChange={(o) => !o && setTeamEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir equipe de {teamEdit?.name}</DialogTitle>
            <DialogDescription>
              Use o mesmo nome de equipe dos atendentes (tela Equipe). Para um supervisor, a equipe define o que ele enxerga:
              só as conversas, alertas e atendentes da equipe dele, além do que ainda não tem atendente. Em branco = vê a organização toda.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="member-team">Equipe</Label>
            <Input id="member-team" value={teamEdit?.team ?? ''} onChange={(e) => setTeamEdit((t) => (t ? { ...t, team: e.target.value } : t))} placeholder="Ex.: Recepção" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamEdit(null)}>Cancelar</Button>
            <Button onClick={saveTeam}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && !canceling && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o convite de {cancelTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              O link enviado deixa de funcionar e a pessoa sai da lista de membros. Se precisar, você pode convidá-la de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={canceling} onClick={(e) => { e.preventDefault(); void cancelInvite() }}>
              {canceling ? 'Cancelando...' : 'Cancelar convite'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
