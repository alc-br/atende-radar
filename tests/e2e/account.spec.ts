import { test, expect } from '@playwright/test'
import { anonymous, createUser, loginAs, signupOrg, STRONG, uid } from './helpers'
import { lastTokenFor, testDb } from './db'
import { TERMS_VERSION, PRIVACY_VERSION, TERMS_REQUIRED_MESSAGE } from '../../src/lib/legal'

// P7/B1/B9/V4/T1 · Conta: aceite dos termos no cadastro e no convite, "Meu perfil" (nome, senha, sair de todos os
// aparelhos) e convites pendentes (reenviar/cancelar). Tudo registrado na auditoria, sem dados sensíveis.

const NEW_PASS = 'Outra-Senha-2026y'
type Entry = { action: string; actorEmail: string; targetId: string | null; details: Record<string, unknown> | null }
const auditActions = async (api: Awaited<ReturnType<typeof loginAs>>) =>
  ((await (await api.get('/api/audit?limit=200')).json()).entries as Entry[])

test.describe('Aceite dos termos', () => {
  test('cadastro sem aceitar os termos é recusado (400, mensagem em português); aceito, guarda versão e data', async () => {
    const anon = await anonymous()
    const email = `termos.${uid()}@cliente.test`
    const base = { name: 'Teresa', email, password: STRONG, organizationName: `Org Termos ${uid()}` }
    for (const extra of [{}, { acceptTerms: false }, { acceptTerms: 'sim' }]) {
      const r = await anon.post('/api/auth/signup', { data: { ...base, ...extra } })
      expect(r.status(), JSON.stringify(extra)).toBe(400)
      expect((await r.json()).error).toBe(TERMS_REQUIRED_MESSAGE)
    }
    expect(await testDb.organizationMember.count({ where: { email } })).toBe(0)

    const antes = Date.now()
    expect((await anon.post('/api/auth/signup', { data: { ...base, acceptTerms: true } })).status()).toBe(201)
    const m = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
    expect(m.termsVersion).toBe(TERMS_VERSION)
    expect(m.privacyVersion).toBe(PRIVACY_VERSION)
    expect(m.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(antes - 5000)
    await anon.dispose()
  })

  test('aceite de convite sem os termos é recusado e o link continua valendo; aceito, guarda versão e data', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    const convidado = `conv.termos.${uid()}@test.local`
    expect((await admin.post('/api/members', { data: { name: 'Conv Termos', email: convidado, role: 'member' } })).status()).toBe(201)
    const token = await lastTokenFor(convidado)
    const anon = await anonymous()

    const r = await anon.post('/api/auth/accept-invite', { data: { token, password: STRONG } })
    expect(r.status()).toBe(400)
    expect((await r.json()).error).toBe(TERMS_REQUIRED_MESSAGE)
    expect((await testDb.organizationMember.findFirstOrThrow({ where: { email: convidado } })).status).toBe('invited')

    expect((await anon.post('/api/auth/accept-invite', { data: { token, password: STRONG, acceptTerms: true } })).status()).toBe(200)
    const m = await testDb.organizationMember.findFirstOrThrow({ where: { email: convidado } })
    expect(m).toMatchObject({ status: 'active', termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION })
    expect(m.termsAcceptedAt).not.toBeNull()
    await Promise.all([anon.dispose(), admin.dispose()])
  })
})

test.describe('Meu perfil', () => {
  test('vê os próprios dados e altera o nome; nome inválido dá 400; fica na auditoria sem o nome', async () => {
    const { email, password } = await signupOrg({ name: 'Nome Antigo' })
    const api = await loginAs(email, password)
    const p = (await (await api.get('/api/profile')).json()).profile
    expect(p).toMatchObject({ email, name: 'Nome Antigo', role: 'admin', hasPassword: true, termsVersion: TERMS_VERSION })
    expect(p.passwordHash).toBeUndefined()

    for (const name of ['', ' a ', 'x'.repeat(121)]) {
      const r = await api.patch('/api/profile', { data: { name } })
      expect(r.status(), name).toBe(400)
      expect(typeof (await r.json()).error).toBe('string')
    }
    expect((await api.patch('/api/profile', { data: { name: '  Nome Novo  ' } })).status()).toBe(200)
    expect((await (await api.get('/api/profile')).json()).profile.name).toBe('Nome Novo')

    const e = (await auditActions(api)).find((x) => x.action === 'account.profile_updated')
    expect(e).toBeTruthy()
    expect(e!.details).toEqual({ keys: ['name'] }) // só a chave alterada, nunca o valor
    await api.dispose()
  })

  test('qualquer papel altera o próprio perfil (atendente inclusive); demonstração não altera', async () => {
    const admin = await loginAs('admin.a@test.local')
    const email = `perfil.member.${uid()}@test.local`
    await createUser(admin, { email, role: 'member' })
    await admin.dispose()
    const api = await loginAs(email, STRONG)
    expect((await api.patch('/api/profile', { data: { name: 'Atendente Renomeado' } })).status()).toBe(200)
    await api.dispose()

    const demo = await loginAs('demo@atenderadar.com', 'demo123')
    expect((await demo.patch('/api/profile', { data: { name: 'Hacker' } })).status()).toBe(403)
    expect((await demo.post('/api/profile/password', { data: { currentPassword: 'demo123', newPassword: NEW_PASS } })).status()).toBe(403)
    expect((await demo.delete('/api/profile/sessions')).status()).toBe(403)
    await demo.dispose()
  })

  test('trocar senha: exige a atual e as regras do cadastro; derruba os outros aparelhos e mantém este', async () => {
    const { email, password } = await signupOrg()
    const aqui = await loginAs(email, password)
    const outro = await loginAs(email, password)
    expect((await outro.get('/api/profile')).status()).toBe(200)

    const tenta = (data: object) => aqui.post('/api/profile/password', { data })
    expect((await tenta({ newPassword: NEW_PASS })).status()).toBe(400)
    const errada = await tenta({ currentPassword: 'Errada-Senha-2026', newPassword: NEW_PASS })
    expect(errada.status()).toBe(400)
    expect((await errada.json()).error).toBe('Senha atual incorreta.')
    expect((await tenta({ currentPassword: password, newPassword: 'curta1' })).status()).toBe(400)
    expect((await tenta({ currentPassword: password, newPassword: 'somenteletrasaqui' })).status()).toBe(400)
    expect((await tenta({ currentPassword: password, newPassword: password })).status()).toBe(400)
    expect((await outro.get('/api/profile')).status()).toBe(200) // nada mudou ainda

    const ok = await tenta({ currentPassword: password, newPassword: NEW_PASS })
    expect(ok.status(), await ok.text()).toBe(200)
    expect((await ok.json()).keptSession).toBe(true)
    expect((await aqui.get('/api/profile')).status()).toBe(200)
    expect((await outro.get('/api/profile')).status()).toBe(401)

    const velha = await loginAs(email, password)
    expect((await velha.get('/api/profile')).status()).toBe(401)
    const nova = await loginAs(email, NEW_PASS)
    expect((await nova.get('/api/profile')).status()).toBe(200)

    const list = await auditActions(aqui)
    const e = list.find((x) => x.action === 'account.password_changed')
    expect(e?.actorEmail).toBe(email)
    expect(JSON.stringify(list)).not.toContain(NEW_PASS)
    await Promise.all([aqui.dispose(), outro.dispose(), velha.dispose(), nova.dispose()])
  })

  test('trocar senha: 5 tentativas com a senha atual errada bloqueiam (429), mesmo depois com a certa', async () => {
    const { email, password } = await signupOrg()
    const api = await loginAs(email, password)
    for (let i = 0; i < 5; i++) {
      expect((await api.post('/api/profile/password', { data: { currentPassword: `Errada-${i}-2026x`, newPassword: NEW_PASS } })).status()).toBe(400)
    }
    const r = await api.post('/api/profile/password', { data: { currentPassword: password, newPassword: NEW_PASS } })
    expect(r.status()).toBe(429)
    expect((await r.json()).error).toMatch(/Tente novamente/)
    await api.dispose()
    const ainda = await loginAs(email, password) // a senha não mudou
    expect((await ainda.get('/api/profile')).status()).toBe(200)
    await ainda.dispose()
  })

  test('sair de todos os aparelhos: os outros caem (401), este continua; fica na auditoria', async () => {
    const { email, password } = await signupOrg()
    const aqui = await loginAs(email, password)
    const outro = await loginAs(email, password)
    const r = await aqui.delete('/api/profile/sessions')
    expect(r.status()).toBe(200)
    expect((await r.json()).keptSession).toBe(true)
    expect((await aqui.get('/api/profile')).status()).toBe(200)
    expect((await outro.get('/api/profile')).status()).toBe(401)
    // entrar de novo funciona normalmente
    const denovo = await loginAs(email, password)
    expect((await denovo.get('/api/profile')).status()).toBe(200)
    expect((await auditActions(aqui)).find((x) => x.action === 'account.sessions_revoked')?.actorEmail).toBe(email)
    await Promise.all([aqui.dispose(), outro.dispose(), denovo.dispose()])
  })
})

test.describe('Convites pendentes', () => {
  test('reenviar: gera link novo (o antigo deixa de valer), devolve o link e registra na auditoria', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    const convidado = `reenvio.${uid()}@test.local`
    const { member } = await (await admin.post('/api/members', { data: { name: 'Reenvio', email: convidado, role: 'supervisor' } })).json()
    const antigo = await lastTokenFor(convidado)

    const r = await admin.post(`/api/members/${member.id}/invite`)
    expect(r.status(), await r.text()).toBe(200)
    const body = await r.json()
    expect(body.inviteLink).toContain('/accept-invite?token=')
    const novo = await lastTokenFor(convidado)
    expect(novo).not.toBe(antigo)
    expect(body.inviteLink).toContain(novo)
    // a resposta diz o que houve com o e-mail (nos testes não há provedor: fica na fila); a tela avisa se falhou
    expect(body.emailStatus).toBe('queued')

    const anon = await anonymous()
    expect((await anon.post('/api/auth/accept-invite', { data: { token: antigo, password: STRONG, acceptTerms: true } })).status()).toBe(400)
    expect((await anon.post('/api/auth/accept-invite', { data: { token: novo, password: STRONG, acceptTerms: true } })).status()).toBe(200)

    // já aceito: não há mais convite pendente
    expect((await admin.post(`/api/members/${member.id}/invite`)).status()).toBe(400)
    const e = (await auditActions(admin)).find((x) => x.action === 'member.invite_resent')
    expect(e).toMatchObject({ actorEmail: email, targetId: member.id, details: { role: 'supervisor' } })
    await Promise.all([anon.dispose(), admin.dispose()])
  })

  test('cancelar: o convite some, o link deixa de valer e fica na auditoria; membro ativo não é "cancelado"', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    const convidado = `cancela.${uid()}@test.local`
    const { member } = await (await admin.post('/api/members', { data: { name: 'Cancela', email: convidado, role: 'member' } })).json()
    const token = await lastTokenFor(convidado)

    expect((await admin.delete(`/api/members/${member.id}/invite`)).status()).toBe(200)
    expect(await testDb.organizationMember.count({ where: { id: member.id } })).toBe(0)
    const anon = await anonymous()
    expect((await anon.post('/api/auth/accept-invite', { data: { token, password: STRONG, acceptTerms: true } })).status()).toBe(400)
    expect((await admin.delete(`/api/members/${member.id}/invite`)).status()).toBe(404)

    const ativo = await createUser(admin, { email: `ativo.${uid()}@test.local`, role: 'member' })
    expect((await admin.delete(`/api/members/${ativo.id}/invite`)).status()).toBe(400)
    expect((await admin.post(`/api/members/${ativo.id}/invite`)).status()).toBe(400)
    expect(await testDb.organizationMember.count({ where: { id: ativo.id } })).toBe(1)

    const e = (await auditActions(admin)).find((x) => x.action === 'member.invite_canceled')
    expect(e).toMatchObject({ actorEmail: email, targetId: member.id })
    await Promise.all([anon.dispose(), admin.dispose()])
  })

  test('só quem convida (administrador) reenvia ou cancela; convite de outra organização dá 404', async () => {
    const admA = await loginAs('admin.a@test.local')
    const convidado = `rbac.convite.${uid()}@test.local`
    const { member } = await (await admA.post('/api/members', { data: { name: 'Pendente', email: convidado, role: 'member' } })).json()

    for (const role of ['gestor', 'supervisor', 'member']) {
      const email = `rbac.inv.${role}.${uid()}@test.local`
      await createUser(admA, { email, role })
      const api = await loginAs(email, STRONG)
      expect((await api.post(`/api/members/${member.id}/invite`)).status(), role).toBe(403)
      expect((await api.delete(`/api/members/${member.id}/invite`)).status(), role).toBe(403)
      await api.dispose()
    }

    const { email, password } = await signupOrg()
    const outraOrg = await loginAs(email, password)
    expect((await outraOrg.post(`/api/members/${member.id}/invite`)).status()).toBe(404)
    expect((await outraOrg.delete(`/api/members/${member.id}/invite`)).status()).toBe(404)
    expect(await testDb.organizationMember.count({ where: { id: member.id, status: 'invited' } })).toBe(1)

    expect((await admA.delete(`/api/members/${member.id}/invite`)).status()).toBe(200) // limpa
    await Promise.all([outraOrg.dispose(), admA.dispose()])
  })
})
