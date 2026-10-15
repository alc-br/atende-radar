'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { UserRound, KeyRound, MonitorSmartphone, Save, LogOut, FileCheck, Mail, AtSign, ImageUp, Trash2, X } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/lib/store'
import { fetchMutation } from '@/lib/mutation'

interface Profile {
  name: string
  email: string
  role: string
  hasPassword: boolean
  termsVersion: string | null
  termsAcceptedAt: string | null
  alertEmails: boolean
  pendingEmail: string | null
  avatarUrl: string | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', supervisor: 'Supervisor', analista: 'Analista',
  member: 'Membro', atendente: 'Atendente', viewer: 'Visualizador',
}

function SecaoCab({ icon, title, id, children }: { icon: ReactNode; title: string; id: string; children?: ReactNode }) {
  return (
    <header className="secao-config__cab">
      <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true">{icon}</span>
      <div><h2 id={id}>{title}</h2>{children && <p>{children}</p>}</div>
    </header>
  )
}

const erro = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Não foi possível concluir a ação. Tente novamente.')

// Meu perfil (P7): nome, troca de senha e "sair de todos os aparelhos". Aberto pelo menu do usuário.
export default function ProfileView() {
  const me = useAppStore((s) => s.me)
  const setMe = useAppStore((s) => s.setMe)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [savingAlertEmails, setSavingAlertEmails] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { profile: Profile }) => {
        if (cancelled) return
        setProfile(d.profile)
        setName(d.profile.name)
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [])

  // Sessão atual não pôde ser mantida (raro): a pessoa entra de novo com a senha.
  const afterRevoke = async (keptSession: boolean) => {
    if (!keptSession) await signOut({ callbackUrl: '/login' })
  }

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingName(true)
    try {
      await fetchMutation('/api/profile', { method: 'PATCH', json: { name } })
      const trimmed = name.trim()
      setProfile((p) => (p ? { ...p, name: trimmed } : p))
      if (me) setMe({ ...me, name: trimmed })
      toast.success('Nome atualizado.')
    } catch (err) {
      toast.error(erro(err))
    } finally {
      setSavingName(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (next !== confirm) {
      setPasswordError('A confirmação não é igual à nova senha.')
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetchMutation('/api/profile/password', { method: 'POST', json: { currentPassword: current, newPassword: next } })
      const data = (await res.json().catch(() => ({}))) as { keptSession?: boolean }
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('Senha alterada. Os outros aparelhos precisarão entrar de novo.')
      await afterRevoke(data.keptSession !== false)
    } catch (err) {
      setPasswordError(erro(err))
    } finally {
      setSavingPassword(false)
    }
  }

  const logoutAll = async () => {
    setLoggingOut(true)
    try {
      const res = await fetchMutation('/api/profile/sessions', { method: 'DELETE' })
      const data = (await res.json().catch(() => ({}))) as { keptSession?: boolean }
      toast.success('Pronto: você saiu de todos os outros aparelhos.')
      setConfirmLogoutAll(false)
      await afterRevoke(data.keptSession !== false)
    } catch (err) {
      toast.error(erro(err))
    } finally {
      setLoggingOut(false)
    }
  }

  const toggleAlertEmails = async (on: boolean) => {
    setSavingAlertEmails(true)
    try {
      await fetchMutation('/api/profile/notifications', { method: 'PATCH', json: { alertEmails: on } })
      setProfile((p) => (p ? { ...p, alertEmails: on } : p))
      toast.success(on ? 'Alertas por e-mail ligados.' : 'Alertas por e-mail desligados.')
    } catch (err) {
      toast.error(erro(err))
    } finally {
      setSavingAlertEmails(false)
    }
  }

  const requestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')
    setSavingEmail(true)
    try {
      const res = await fetchMutation('/api/profile/email', { method: 'POST', json: { newEmail, currentPassword: emailPassword } })
      const data = (await res.json().catch(() => ({}))) as { pendingEmail?: string }
      setProfile((p) => (p ? { ...p, pendingEmail: data.pendingEmail || newEmail.trim().toLowerCase() } : p))
      setNewEmail('')
      setEmailPassword('')
      toast.success('Enviamos um link de confirmação para o novo e-mail.')
    } catch (err) {
      setEmailError(erro(err))
    } finally {
      setSavingEmail(false)
    }
  }

  const cancelEmailChange = async () => {
    setSavingEmail(true)
    try {
      await fetchMutation('/api/profile/email', { method: 'DELETE' })
      setProfile((p) => (p ? { ...p, pendingEmail: null } : p))
      toast.success('Troca de e-mail cancelada. O link enviado não vale mais.')
    } catch (err) {
      toast.error(erro(err))
    } finally {
      setSavingEmail(false)
    }
  }

  const setAvatar = (url: string | null) => {
    setProfile((p) => (p ? { ...p, avatarUrl: url } : p))
    if (me) setMe({ ...me, avatarUrl: url })
  }

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return
    setSavingAvatar(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetchMutation('/api/profile/avatar', { method: 'POST', body: form })
      const data = (await res.json()) as { avatarUrl: string | null }
      setAvatar(data.avatarUrl)
      toast.success('Foto atualizada.')
    } catch (err) {
      toast.error(erro(err))
    } finally {
      setSavingAvatar(false)
      if (avatarInput.current) avatarInput.current.value = ''
    }
  }

  const removeAvatar = async () => {
    setSavingAvatar(true)
    try {
      await fetchMutation('/api/profile/avatar', { method: 'DELETE' })
      setAvatar(null)
      toast.success('Foto removida.')
    } catch (err) {
      toast.error(erro(err))
    } finally {
      setSavingAvatar(false)
    }
  }

  if (loadError) {
    return (
      <div className="cartao vazio" role="alert">
        <strong>Não foi possível carregar o seu perfil.</strong>
      </div>
    )
  }

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><UserRound className="ic" /></span>
          <div>
            <h1>Meu perfil</h1>
            <p>Seus dados de acesso ao AtendeRadar.</p>
          </div>
        </div>
      </div>

      {!profile ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando perfil">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-[18px]">
          <form className="cartao secao-config" onSubmit={saveName} aria-labelledby="t-perfil-dados">
            <SecaoCab icon={<UserRound className="ic" />} title="Dados pessoais" id="t-perfil-dados">
              O nome aparece para a sua equipe e no registro de auditoria.
            </SecaoCab>
            <div className="form-grade">
              <div className="campo">
                <label htmlFor="profile-name">Nome</label>
                <input className="entrada" id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" disabled={savingName} />
              </div>
              <div className="campo">
                <label htmlFor="profile-email">E-mail</label>
                <input className="entrada" id="profile-email" type="email" value={profile.email} readOnly aria-describedby="profile-email-hint" />
                <p id="profile-email-hint" className="ajuda-campo">O e-mail é o seu login. Para trocá-lo, use “Trocar e-mail” abaixo.</p>
              </div>
              <div className="campo">
                <span className="text-sm font-medium">Função</span>
                <span><span className="tag tag--azul">{ROLE_LABELS[profile.role] || profile.role}</span></span>
              </div>
            </div>
            <footer className="secao-config__rodape">
              <button className="btn btn--escuro btn--lg" type="submit" disabled={savingName || name.trim().length < 2 || name.trim() === profile.name}>
                <Save className="ic" aria-hidden="true" />{savingName ? 'Salvando...' : 'Salvar nome'}
              </button>
            </footer>
          </form>

          <section className="cartao secao-config secao-config--linha" aria-labelledby="t-perfil-foto">
            <span className="perfil-foto" aria-hidden="true">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : (profile.name.trim()[0] || '?').toUpperCase()}
            </span>
            <div>
              <h2 id="t-perfil-foto">Foto do perfil</h2>
              <p className="suave">Aparece no menu do usuário. PNG, JPG ou WEBP de até 2 MB; a imagem é recortada em quadrado.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={avatarInput} id="profile-avatar-file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Escolher foto do perfil" onChange={(e) => void uploadAvatar(e.target.files?.[0])} disabled={savingAvatar} />
              <button className="btn btn--lg" type="button" onClick={() => avatarInput.current?.click()} disabled={savingAvatar}>
                <ImageUp className="ic" aria-hidden="true" />{savingAvatar ? 'Enviando...' : profile.avatarUrl ? 'Trocar foto' : 'Enviar foto'}
              </button>
              {profile.avatarUrl && (
                <button className="btn btn--lg" type="button" onClick={() => void removeAvatar()} disabled={savingAvatar}>
                  <Trash2 className="ic" aria-hidden="true" />Remover foto
                </button>
              )}
            </div>
          </section>

          <form className="cartao secao-config" onSubmit={requestEmailChange} aria-labelledby="t-perfil-email">
            <SecaoCab icon={<AtSign className="ic" />} title="Trocar e-mail" id="t-perfil-email">
              Enviamos um link para o novo endereço. O e-mail de acesso só muda quando você abrir esse link; o e-mail atual recebe um aviso.
            </SecaoCab>
            {profile.pendingEmail && (
              <div role="status" className="aviso-pendente">
                <span>Aguardando confirmação de <strong>{profile.pendingEmail}</strong>. Abra o link enviado para esse endereço (vale por 24 horas).</span>
                <button className="btn" type="button" onClick={() => void cancelEmailChange()} disabled={savingEmail}>
                  <X className="ic" aria-hidden="true" />Cancelar troca
                </button>
              </div>
            )}
            {profile.hasPassword ? (
              <>
                <div className="form-grade">
                  <div className="campo">
                    <label htmlFor="profile-new-email">Novo e-mail</label>
                    <input className="entrada" id="profile-new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required maxLength={200} autoComplete="email" disabled={savingEmail} />
                  </div>
                  <div className="campo">
                    <label htmlFor="profile-email-password">Senha atual</label>
                    <input className="entrada" id="profile-email-password" type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required autoComplete="current-password" disabled={savingEmail} />
                  </div>
                  {emailError && <p role="alert" className="form-grade__todo text-sm text-[var(--vermelho)]">{emailError}</p>}
                </div>
                <footer className="secao-config__rodape">
                  <button className="btn btn--escuro btn--lg" type="submit" disabled={savingEmail || !newEmail.trim() || !emailPassword}>
                    <Mail className="ic" aria-hidden="true" />{savingEmail ? 'Enviando...' : 'Enviar link de confirmação'}
                  </button>
                </footer>
              </>
            ) : (
              <p className="suave">Para trocar o e-mail, primeiro crie uma senha própria com “Esqueceu sua senha?” na tela de entrar.</p>
            )}
          </form>

          <form className="cartao secao-config" onSubmit={changePassword} aria-labelledby="t-perfil-senha">
            <SecaoCab icon={<KeyRound className="ic" />} title="Trocar senha" id="t-perfil-senha">
              Ao trocar a senha, as sessões abertas em outros aparelhos são encerradas. Este aparelho continua conectado.
            </SecaoCab>
            {profile.hasPassword ? (
              <>
                <div className="form-grade">
                  <div className="campo form-grade__todo">
                    <label htmlFor="profile-current-password">Senha atual</label>
                    <input className="entrada" id="profile-current-password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" disabled={savingPassword} />
                  </div>
                  <div className="campo">
                    <label htmlFor="profile-new-password">Nova senha</label>
                    <input className="entrada" id="profile-new-password" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" aria-describedby="profile-new-password-hint" disabled={savingPassword} />
                    <p id="profile-new-password-hint" className="ajuda-campo">Mínimo de 10 caracteres, com letras e números.</p>
                  </div>
                  <div className="campo">
                    <label htmlFor="profile-confirm-password">Repita a nova senha</label>
                    <input className="entrada" id="profile-confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" disabled={savingPassword} />
                  </div>
                  {passwordError && <p role="alert" className="form-grade__todo text-sm text-[var(--vermelho)]">{passwordError}</p>}
                </div>
                <footer className="secao-config__rodape">
                  <button className="btn btn--escuro btn--lg" type="submit" disabled={savingPassword}>
                    <KeyRound className="ic" aria-hidden="true" />{savingPassword ? 'Salvando...' : 'Trocar senha'}
                  </button>
                </footer>
              </>
            ) : (
              <p className="suave">Esta conta ainda não tem senha própria. Para criar uma, use “Esqueceu sua senha?” na tela de entrar.</p>
            )}
          </form>

          <section className="cartao secao-config secao-config--linha" aria-labelledby="t-perfil-alertas-email">
            <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><Mail className="ic" /></span>
            <div>
              <h2 id="t-perfil-alertas-email">Alertas por e-mail</h2>
              <p className="suave">Receber por e-mail os alertas que você pode ver, quando a regra tiver o canal e-mail. Desligado, eles continuam no sino e na tela Alertas.</p>
            </div>
            <label className="interruptor">
              <input type="checkbox" role="switch" aria-label="Receber alertas por e-mail" checked={profile.alertEmails} disabled={savingAlertEmails} onChange={(e) => void toggleAlertEmails(e.target.checked)} />
              <span />
            </label>
          </section>

          <section className="cartao secao-config secao-config--linha" aria-labelledby="t-perfil-sessoes">
            <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true"><MonitorSmartphone className="ic" /></span>
            <div>
              <h2 id="t-perfil-sessoes">Aparelhos conectados</h2>
              <p className="suave">Esqueceu a conta aberta em outro computador ou celular? Encerre todas as outras sessões. Este aparelho continua conectado.</p>
            </div>
            <button className="btn btn--lg" type="button" onClick={() => setConfirmLogoutAll(true)}>
              <LogOut className="ic" aria-hidden="true" />Sair de todos os aparelhos
            </button>
          </section>

          {profile.termsAcceptedAt && (
            <p className="suave flex items-center gap-2 text-sm">
              <FileCheck className="ic" aria-hidden="true" />
              Termos de Uso e Política de Privacidade aceitos em {new Date(profile.termsAcceptedAt).toLocaleDateString('pt-BR')}
              {profile.termsVersion ? ` (versão de ${profile.termsVersion.split('-').reverse().join('/')})` : ''}.
            </p>
          )}
        </div>
      )}

      <AlertDialog open={confirmLogoutAll} onOpenChange={(o) => !loggingOut && setConfirmLogoutAll(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair de todos os aparelhos?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as sessões abertas com a sua conta em outros computadores e celulares serão encerradas. Quem estiver lá vai precisar entrar de novo com a senha. Este aparelho continua conectado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loggingOut}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={loggingOut} onClick={(e) => { e.preventDefault(); void logoutAll() }}>
              {loggingOut ? 'Encerrando...' : 'Sair dos outros aparelhos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
