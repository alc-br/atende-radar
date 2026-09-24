import { test, expect, request } from '@playwright/test'
import { BASE_URL, STRONG, anonymous, createUser, loginAs, signupOrg, uid } from './helpers'
import { lastTokenFor, mailsTo, testDb } from './db'

// B1 · Autenticação real: cadastro, senha própria, recuperação, convite, bloqueio de tentativas, sessão.

test.describe('B1 · cadastro cria a organização do cliente', () => {
  test('cadastro cria organização nova e vazia, e o dono entra como admin', async () => {
    const { email, password } = await signupOrg() // falha se o cadastro não devolver 201

    const ctx = await loginAs(email, password)
    const me = await (await ctx.get('/api/me')).json()
    expect(me.member.role).toBe('admin')
    expect(me.organizationId).not.toBe('org_seed_1')

    // organização vazia: nada da demonstração, e nenhuma tela quebra
    const convs = await (await ctx.get('/api/conversations')).json()
    expect(convs.conversations).toEqual([])
    for (const path of ['/api/dashboard', '/api/alerts', '/api/alert-rules', '/api/connections', '/api/recovery', '/api/team', '/api/teams', '/api/reports', '/api/settings', '/api/subscription', '/api/plans', '/api/members', '/api/notifications']) {
      const r = await ctx.get(path)
      expect(r.status(), path).toBe(200)
      await r.json()
    }
    const sub = await (await ctx.get('/api/subscription')).json()
    expect(sub.subscription.status).toBe('trialing')
    await ctx.dispose()
  })

  test('duas organizações criadas por cadastro não enxergam uma à outra', async () => {
    const a = await signupOrg({ organizationName: 'Empresa Alfa' })
    const b = await signupOrg({ organizationName: 'Empresa Beta' })
    const ca = await loginAs(a.email, a.password)
    const cb = await loginAs(b.email, b.password)
    await ca.post('/api/alert-rules', { data: { name: 'Regra da Alfa', type: 'no_response' } })
    expect(await (await cb.get('/api/alert-rules')).text()).not.toContain('Regra da Alfa')
    expect(await (await cb.get('/api/settings')).text()).toContain('Empresa Beta')
    expect(await (await cb.get('/api/members')).text()).not.toContain(a.email)
    await ca.dispose()
    await cb.dispose()
  })

  test('cadastro recusa senha fraca, e-mail repetido, e-mail inválido e dados faltando', async () => {
    const anon = await anonymous()
    const ok = { name: 'Xavier', email: `v.${uid()}@cliente.test`, password: STRONG, organizationName: 'Org V' }
    expect((await anon.post('/api/auth/signup', { data: { ...ok, password: 'curta1' } })).status()).toBe(400)
    expect((await anon.post('/api/auth/signup', { data: { ...ok, password: 'somenteletrasaqui' } })).status()).toBe(400)
    expect((await anon.post('/api/auth/signup', { data: { ...ok, password: 'demo123demo123' } })).status()).toBe(400)
    expect((await anon.post('/api/auth/signup', { data: { ...ok, email: 'nao-e-email' } })).status()).toBe(400)
    expect((await anon.post('/api/auth/signup', { data: { ...ok, organizationName: '' } })).status()).toBe(400)
    expect((await anon.post('/api/auth/signup', { data: { ...ok, email: 'gestor.a@test.local' } })).status()).toBe(409)
    expect((await anon.post('/api/auth/signup', { data: ok })).status()).toBe(201)
    expect((await anon.post('/api/auth/signup', { data: ok })).status()).toBe(409)
    await anon.dispose()
  })

  test('e-mail de confirmação é enviado e o link confirma o e-mail', async () => {
    const { email, password } = await signupOrg()
    const mails = await mailsTo(email)
    expect(mails.length).toBe(1)
    expect(mails[0].body).toContain('/verify-email?token=')
    const anon = await anonymous()
    expect((await anon.post('/api/auth/verify-email', { data: { token: await lastTokenFor(email) } })).status()).toBe(200)
    expect((await anon.post('/api/auth/verify-email', { data: { token: await lastTokenFor(email) } })).status()).toBe(400) // uso único
    await anon.dispose()
    const ctx = await loginAs(email, password)
    expect((await (await ctx.get('/api/me')).json()).member.emailVerified).toBe(true)
    await ctx.dispose()
  })
})

test.describe('Primeira experiência · organização nova já nasce pronta para uso', () => {
  test('cadastro cria as 8 regras de alerta e os 8 relatórios padrão, com o e-mail do dono (nunca os da demonstração)', async () => {
    const { email, password } = await signupOrg()
    const ctx = await loginAs(email, password)
    const rules = (await (await ctx.get('/api/alert-rules')).json()).rules
    expect(rules).toHaveLength(8)
    expect(new Set(rules.map((r: { type: string }) => r.type)).size).toBe(8)
    for (const r of rules) expect(r.recipients).toEqual([email])
    const reports = await (await ctx.get('/api/reports')).json()
    expect(reports.definitions).toHaveLength(8)
    for (const d of reports.definitions) expect(d.recipients).toEqual([email])
    const raw = JSON.stringify([rules, reports])
    expect(raw).not.toContain('odontovida')
    await ctx.dispose()
  })

  test('/api/setup-status: conta nova tem 3 passos pendentes; a organização de demonstração está completa', async () => {
    const { email, password } = await signupOrg()
    const nova = await loginAs(email, password)
    const s1 = await (await nova.get('/api/setup-status')).json()
    expect(s1.steps.map((x: { id: string }) => x.id)).toEqual(['connect', 'invite', 'conversations'])
    expect(s1.steps.every((x: { done: boolean }) => !x.done)).toBe(true)
    expect(s1.complete).toBe(false)
    expect(s1.canManage).toBe(true)
    await nova.dispose()

    const demo = await loginAs('admin.a@test.local')
    const s2 = await (await demo.get('/api/setup-status')).json()
    expect(s2.complete).toBe(true)
    await demo.dispose()
  })

  test('convidar alguém e conectar avança os passos (dados reais, não marcação manual)', async () => {
    const { email, password } = await signupOrg()
    const ctx = await loginAs(email, password)
    await createUser(ctx, { email: `colega.${uid()}@cliente.test`, role: 'atendente' })
    let s = await (await ctx.get('/api/setup-status')).json()
    expect(s.steps.find((x: { id: string }) => x.id === 'invite').done).toBe(true)
    expect(s.steps.find((x: { id: string }) => x.id === 'connect').done).toBe(false)
    await ctx.post('/api/connections', { data: { name: 'Recepção', phoneNumber: '+5511999990000' } })
    s = await (await ctx.get('/api/setup-status')).json()
    expect(s.steps.find((x: { id: string }) => x.id === 'connect').done).toBe(true)
    await ctx.dispose()
  })
})

test.describe('B1 · login só com credenciais válidas', () => {
  test('conta real não aceita a senha pública de demonstração', async () => {
    const { email } = await signupOrg()
    const ctx = await loginAs(email, 'demo123')
    expect((await ctx.get('/api/me')).status()).toBe(401)
    await ctx.dispose()
  })

  test('membro sem senha de outra organização (fora da demonstração) não entra com demo123', async () => {
    const ctx = await loginAs('semsenha.b@test.local', 'demo123')
    expect((await ctx.get('/api/me')).status()).toBe(401)
    await ctx.dispose()
  })

  test('senha errada não entra em conta com senha própria', async () => {
    const wrong = await loginAs('admin.b@test.local', 'outra-senha-qualquer1')
    expect((await wrong.get('/api/me')).status()).toBe(401)
    await wrong.dispose()
  })

  test('e-mail inexistente com senha qualquer não cria conta nem sessão (modo demo só com demo123 na org de demonstração)', async () => {
    const ctx = await loginAs(`fantasma.${uid()}@nada.test`, 'qualquer-coisa-123')
    expect((await ctx.get('/api/me')).status()).toBe(401)
    await ctx.dispose()
  })

  test('e-mail é normalizado (maiúsculas e espaços)', async () => {
    const { email, password } = await signupOrg()
    const ctx = await loginAs(`  ${email.toUpperCase()}  `, password)
    expect((await ctx.get('/api/me')).status()).toBe(200)
    await ctx.dispose()
  })

  test('5 senhas erradas bloqueiam a conta, mesmo para a senha certa; recuperar a senha desbloqueia', async () => {
    const { email, password } = await signupOrg()
    for (let i = 0; i < 5; i++) await (await loginAs(email, `errada-${i}-Zz9`)).dispose()

    const locked = await loginAs(email, password)
    expect((await locked.get('/api/me')).status()).toBe(401)
    await locked.dispose()

    const anon = await anonymous()
    await anon.post('/api/auth/forgot', { data: { email } })
    const novaSenha = 'Nova-Senha-Segura-77'
    expect((await anon.post('/api/auth/reset', { data: { token: await lastTokenFor(email), password: novaSenha } })).status()).toBe(200)
    await anon.dispose()

    const ok = await loginAs(email, novaSenha)
    expect((await ok.get('/api/me')).status()).toBe(200)
    await ok.dispose()
  })

  test('membro suspenso não consegue entrar', async () => {
    const adm = await loginAs('admin.a@test.local')
    const email = `susp.${uid()}@test.local`
    const m = await createUser(adm, { email, role: 'viewer' })
    await adm.patch(`/api/members/${m.id}`, { data: { status: 'suspended' } })
    const ctx = await loginAs(email, STRONG)
    expect((await ctx.get('/api/me')).status()).toBe(401)
    await ctx.dispose()
    await adm.dispose()
  })
})

test.describe('B1 · recuperação de senha', () => {
  test('pedir recuperação de e-mail inexistente responde igual (não revela quem tem conta) e não envia nada', async () => {
    const anon = await anonymous()
    const email = `ninguem.${uid()}@nada.test`
    const res = await anon.post('/api/auth/forgot', { data: { email } })
    expect(res.status()).toBe(200)
    expect((await mailsTo(email)).length).toBe(0)
    await anon.dispose()
  })

  test('fluxo completo: link único, senha nova vale, senha antiga e sessões antigas morrem', async () => {
    const { email, password } = await signupOrg()
    const sessaoAntiga = await loginAs(email, password)
    expect((await sessaoAntiga.get('/api/me')).status()).toBe(200)

    const anon = await anonymous()
    expect((await anon.post('/api/auth/forgot', { data: { email } })).status()).toBe(200)
    const mails = await mailsTo(email)
    expect(mails[mails.length - 1].body).toContain('/reset-password?token=')
    const token = await lastTokenFor(email)

    const nova = 'Outra-Senha-Forte-31'
    expect((await anon.post('/api/auth/reset', { data: { token, password: 'fraca' } })).status()).toBe(400)
    expect((await anon.post('/api/auth/reset', { data: { token, password: nova } })).status()).toBe(200)
    expect((await anon.post('/api/auth/reset', { data: { token, password: 'Mais-Uma-Senha-99x' } })).status()).toBe(400) // uso único
    await anon.dispose()

    expect((await sessaoAntiga.get('/api/me')).status()).toBe(401)
    await sessaoAntiga.dispose()
    const velha = await loginAs(email, password)
    expect((await velha.get('/api/me')).status()).toBe(401)
    await velha.dispose()
    const nv = await loginAs(email, nova)
    expect((await nv.get('/api/me')).status()).toBe(200)
    await nv.dispose()
  })

  test('token inventado ou expirado é recusado', async () => {
    const { email } = await signupOrg()
    const anon = await anonymous()
    expect((await anon.post('/api/auth/reset', { data: { token: 'token-que-nao-existe', password: STRONG } })).status()).toBe(400)
    await anon.post('/api/auth/forgot', { data: { email } })
    const token = await lastTokenFor(email)
    await testDb.authToken.updateMany({ where: { type: 'reset', usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await anon.post('/api/auth/reset', { data: { token, password: STRONG } })).status()).toBe(400)
    await anon.dispose()
  })

  test('só o hash do token fica no banco', async () => {
    const { email } = await signupOrg()
    const anon = await anonymous()
    const forgot = await anon.post('/api/auth/forgot', { data: { email } })
    expect(forgot.status(), await forgot.text()).toBe(200)
    const token = await lastTokenFor(email)
    const rows = await testDb.authToken.findMany({ where: { type: 'reset' } })
    expect(rows.some((r) => r.tokenHash === token)).toBe(false)
    await anon.dispose()
  })

  test('limite de pedidos: o 6º pedido seguido para o mesmo e-mail leva 429', async () => {
    const anon = await request.newContext({ baseURL: BASE_URL })
    const email = `flood.${uid()}@nada.test`
    const codes: number[] = []
    for (let i = 0; i < 6; i++) codes.push((await anon.post('/api/auth/forgot', { data: { email } })).status())
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
    expect(codes[5]).toBe(429)
    await anon.dispose()
  })
})

test.describe('B1 · convite de membro', () => {
  test('convidado nasce "invited", não entra antes de aceitar, e entra depois com a senha que escolheu', async () => {
    const adm = await loginAs('admin.a@test.local')
    const email = `convidado.${uid()}@test.local`
    const res = await adm.post('/api/members', { data: { name: 'Convidado', email, role: 'analista' } })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.member.status).toBe('invited')
    expect(JSON.stringify(body)).not.toContain('passwordHash')
    const mails = await mailsTo(email)
    expect(mails[0].body).toContain('/accept-invite?token=')

    // antes de aceitar: nada de login, nem com demo123
    for (const pw of ['demo123', STRONG]) {
      const c = await loginAs(email, pw)
      expect((await c.get('/api/me')).status()).toBe(401)
      await c.dispose()
    }

    const anon = await anonymous()
    const token = await lastTokenFor(email)
    expect((await anon.post('/api/auth/accept-invite', { data: { token, password: 'fraca' } })).status()).toBe(400)
    expect((await anon.post('/api/auth/accept-invite', { data: { token, password: STRONG } })).status()).toBe(200)
    expect((await anon.post('/api/auth/accept-invite', { data: { token, password: STRONG } })).status()).toBe(400) // uso único
    await anon.dispose()

    const c = await loginAs(email, STRONG)
    const me = await (await c.get('/api/me')).json()
    expect(me.member.role).toBe('analista')
    expect(me.organizationId).toBe('org_seed_1')
    await c.dispose()
    await adm.dispose()
  })

  test('sem provedor de e-mail, o convite devolve o link ao admin para repassar à pessoa', async () => {
    const adm = await loginAs('admin.a@test.local')
    const email = `manual.${uid()}@test.local`
    const body = await (await adm.post('/api/members', { data: { name: 'Manual', email, role: 'viewer' } })).json()
    expect(body.inviteLink).toContain('/accept-invite?token=')
    // o link funciona de verdade
    const token = new URL(body.inviteLink).searchParams.get('token')!
    const anon = await anonymous()
    expect((await anon.post('/api/auth/accept-invite', { data: { token, password: STRONG } })).status()).toBe(200)
    await anon.dispose()
    const c = await loginAs(email, STRONG)
    expect((await c.get('/api/me')).status()).toBe(200)
    await c.dispose()
    await adm.dispose()
  })

  test('respostas de /api/members nunca trazem hash de senha', async () => {
    const adm = await loginAs('admin.a@test.local')
    expect(await (await adm.get('/api/members')).text()).not.toContain('passwordHash')
    const patched = await adm.patch('/api/members/member_a_viewer', { data: { team: 'Recepção' } })
    expect(await patched.text()).not.toContain('passwordHash')
    await adm.dispose()
  })
})

test.describe('B1 · conta legada de demonstração', () => {
  test('demo@atenderadar.com continua entrando na org de demonstração (até o B7)', async () => {
    const c = await loginAs('demo@atenderadar.com', 'demo123')
    const me = await (await c.get('/api/me')).json()
    expect(me.organizationId).toBe('org_seed_1')
    await c.dispose()
  })
})
