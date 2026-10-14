import { test, expect } from '@playwright/test'
import { anonymous, createUser, loginAs, signupOrg, STRONG, uid } from './helpers'
import { lastTokenFor, mailsTo, testDb } from './db'

// P7 · troca do e-mail de acesso em "Meu perfil": pede a senha atual, o link vai para o NOVO e-mail (uso único, 24 h),
// o e-mail só muda depois da confirmação e o endereço antigo é avisado. Recusa e-mail já usado. Tudo na auditoria.

type Entry = { action: string; targetId: string | null; targetLabel: string | null }
const auditOf = async (api: Awaited<ReturnType<typeof loginAs>>) => ((await (await api.get('/api/audit?limit=200')).json()).entries as Entry[])

test.describe('P7 · troca de e-mail', () => {
  test('o e-mail só muda depois da confirmação; o token não serve duas vezes; o antigo é avisado', async () => {
    const { email, password } = await signupOrg()
    const api = await loginAs(email, password)
    const novo = `novo.${uid()}@cliente.test`

    const r = await api.post('/api/profile/email', { data: { newEmail: novo.toUpperCase(), currentPassword: password } })
    expect(r.status()).toBe(200)
    expect((await r.json()).pendingEmail).toBe(novo) // normalizado

    // ainda NÃO mudou: o login continua sendo o antigo, o novo fica pendente
    const pend = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
    expect(pend.pendingEmail).toBe(novo)
    expect((await (await api.get('/api/profile')).json()).profile).toMatchObject({ email, pendingEmail: novo })
    const antesNovo = await loginAs(novo, password)
    expect((await antesNovo.get('/api/me')).status()).toBe(401)
    await antesNovo.dispose()

    // link vai só para o novo; o antigo recebe um aviso sem o endereço inteiro e sem link
    const token = await lastTokenFor(novo)
    const avisos = await mailsTo(email)
    const avisoPedido = avisos.find((m) => /Pedido de troca/.test(m.subject))
    expect(avisoPedido).toBeTruthy()
    expect(avisoPedido!.body).not.toContain(novo)
    expect(avisoPedido!.body).not.toContain('token=')

    const anon = await anonymous()
    const ok = await anon.post('/api/auth/confirm-email', { data: { token } })
    expect(ok.status()).toBe(200)
    // reaproveitar o mesmo link falha
    const again = await anon.post('/api/auth/confirm-email', { data: { token } })
    expect(again.status()).toBe(400)
    expect((await again.json()).error).toMatch(/inválido ou expirado/)
    expect((await anon.post('/api/auth/confirm-email', { data: { token: 'nao-existe' } })).status()).toBe(400)
    expect((await anon.post('/api/auth/confirm-email', { data: {} })).status()).toBe(400)
    await anon.dispose()

    const m = await testDb.organizationMember.findUniqueOrThrow({ where: { id: pend.id } })
    expect(m.email).toBe(novo)
    expect(m.pendingEmail).toBeNull()
    expect(m.emailVerifiedAt).not.toBeNull()

    // entra com o novo; o antigo não entra mais
    const comNovo = await loginAs(novo, password)
    expect((await comNovo.get('/api/me')).status()).toBe(200)
    const comAntigo = await loginAs(email, password)
    expect((await comAntigo.get('/api/me')).status()).toBe(401)
    await comAntigo.dispose()

    expect((await mailsTo(email)).some((x) => /foi trocado/.test(x.subject))).toBe(true)
    const actions = (await auditOf(comNovo)).map((e) => e.action)
    expect(actions).toEqual(expect.arrayContaining(['account.email_change_requested', 'account.email_changed']))
    // o novo endereço não vai para o registro no pedido (só o antigo, como alvo)
    const pedido = (await auditOf(comNovo)).find((e) => e.action === 'account.email_change_requested')!
    expect(pedido.targetLabel).toBe(email)
    await comNovo.dispose()
    await api.dispose()
  })

  test('senha atual errada, mesmo e-mail, e-mail inválido e e-mail já usado por outra conta são recusados', async () => {
    const { email, password } = await signupOrg()
    const api = await loginAs(email, password)
    const outro = await signupOrg()

    const wrong = await api.post('/api/profile/email', { data: { newEmail: `x.${uid()}@cliente.test`, currentPassword: 'errada-123456' } })
    expect(wrong.status()).toBe(400)
    expect((await wrong.json()).error).toBe('Senha atual incorreta.')
    expect((await api.post('/api/profile/email', { data: { newEmail: email, currentPassword: password } })).status()).toBe(400)
    expect((await api.post('/api/profile/email', { data: { newEmail: 'nao-e-email', currentPassword: password } })).status()).toBe(400)
    const used = await api.post('/api/profile/email', { data: { newEmail: outro.email, currentPassword: password } })
    expect(used.status()).toBe(409)
    expect((await used.json()).error).toMatch(/já é usado/)
    // membro da MESMA empresa também conta
    const admin = api
    const colega = `colega.${uid()}@test.local`
    await createUser(admin, { email: colega, role: 'member' })
    expect((await api.post('/api/profile/email', { data: { newEmail: colega, currentPassword: password } })).status()).toBe(409)

    const m = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
    expect(m.pendingEmail).toBeNull()
    expect(await testDb.authToken.count({ where: { memberId: m.id, type: 'email_change' } })).toBe(0)
    await api.dispose()
  })

  test('5 senhas erradas bloqueiam a troca por 15 minutos (429), mesmo com a senha certa depois', async () => {
    const { email, password } = await signupOrg()
    const api = await loginAs(email, password)
    for (let i = 0; i < 5; i++) {
      expect((await api.post('/api/profile/email', { data: { newEmail: `b.${uid()}@cliente.test`, currentPassword: `errada-${i}-xx` } })).status()).toBe(400)
    }
    expect((await api.post('/api/profile/email', { data: { newEmail: `b.${uid()}@cliente.test`, currentPassword: password } })).status()).toBe(429)
    await api.dispose()
  })

  test('endereço tomado por outra conta antes da confirmação: o link falha com 409 e nada muda', async () => {
    const { email, password } = await signupOrg()
    const api = await loginAs(email, password)
    const novo = `disputado.${uid()}@cliente.test`
    expect((await api.post('/api/profile/email', { data: { newEmail: novo, currentPassword: password } })).status()).toBe(200)
    const token = await lastTokenFor(novo)
    await signupOrg({ email: novo }) // alguém se cadastra com o endereço no meio-tempo
    const anon = await anonymous()
    const r = await anon.post('/api/auth/confirm-email', { data: { token } })
    expect(r.status()).toBe(409)
    await anon.dispose()
    const m = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
    expect(m.pendingEmail).toBeNull()
    await api.dispose()
  })

  test('cancelar a troca invalida o link; novo pedido invalida o anterior', async () => {
    const { email, password } = await signupOrg()
    const api = await loginAs(email, password)
    const a = `a.${uid()}@cliente.test`
    const b = `b.${uid()}@cliente.test`
    expect((await api.post('/api/profile/email', { data: { newEmail: a, currentPassword: password } })).status()).toBe(200)
    const tokenA = await lastTokenFor(a)
    expect((await api.post('/api/profile/email', { data: { newEmail: b, currentPassword: password } })).status()).toBe(200)
    const tokenB = await lastTokenFor(b)
    const anon = await anonymous()
    expect((await anon.post('/api/auth/confirm-email', { data: { token: tokenA } })).status()).toBe(400) // substituído

    const del = await api.delete('/api/profile/email')
    expect(del.status()).toBe(200)
    expect((await anon.post('/api/auth/confirm-email', { data: { token: tokenB } })).status()).toBe(400) // cancelado
    await anon.dispose()
    const m = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
    expect(m.pendingEmail).toBeNull()
    expect((await auditOf(api)).map((e) => e.action)).toContain('account.email_change_canceled')
    await api.dispose()
  })

  test('atendente que troca o e-mail continua vendo as conversas dele (o vínculo com o atendente acompanha)', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    const att = `att.${uid()}@test.local`
    const member = await createUser(admin, { email: att, role: 'atendente' })
    const org = await testDb.organizationMember.findUniqueOrThrow({ where: { id: member.id }, select: { organizationId: true } })
    await testDb.agent.create({ data: { organizationId: org.organizationId, name: 'Att', email: att } })

    const api = await loginAs(att, STRONG)
    const novo = `att.novo.${uid()}@test.local`
    expect((await api.post('/api/profile/email', { data: { newEmail: novo, currentPassword: STRONG } })).status()).toBe(200)
    const anon = await anonymous()
    expect((await anon.post('/api/auth/confirm-email', { data: { token: await lastTokenFor(novo) } })).status()).toBe(200)
    await anon.dispose()
    expect(await testDb.agent.count({ where: { organizationId: org.organizationId, email: novo } })).toBe(1)
    expect(await testDb.agent.count({ where: { organizationId: org.organizationId, email: att } })).toBe(0)
    await api.dispose()
    await admin.dispose()
  })
})
