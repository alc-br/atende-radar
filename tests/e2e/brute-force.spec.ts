import { test, expect, request } from '@playwright/test'
import { BASE_URL, signupOrg, uid } from './helpers'

// Ataques de senha: além do bloqueio por conta (5 erros, ver auth.spec), o IP que erra muitas senhas em contas
// diferentes ("uma senha em muitas contas") fica bloqueado por 15 min, e inventar X-Forwarded-For não escapa do limite.
const BASE = BASE_URL
const ipNovo = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

async function tenta(email: string, password: string, xff: string) {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': xff } })
  const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken
  await ctx.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email, password, json: 'true' } })
  const logado = (await ctx.get('/api/me')).status() === 200
  await ctx.dispose()
  return logado
}

test.describe('Força bruta no login', () => {
  test('30 senhas erradas do mesmo IP em contas diferentes bloqueiam o IP, até para a senha certa', async () => {
    test.setTimeout(120_000)
    const { email, password } = await signupOrg()
    const atacante = ipNovo()
    expect(await tenta(email, password, atacante)).toBe(true) // antes: entra normalmente
    for (let i = 0; i < 30; i++) expect(await tenta(`vitima.${uid()}@cliente.test`, 'Chute-Comum-2026', atacante)).toBe(false)
    expect(await tenta(email, password, atacante)).toBe(false) // IP bloqueado
    // forjar um X-Forwarded-For na frente não muda o IP que o proxy acrescenta no fim
    expect(await tenta(email, password, `${ipNovo()}, ${atacante}`)).toBe(false)
    // a conta em si não foi bloqueada: de outro IP a dona entra
    expect(await tenta(email, password, ipNovo())).toBe(true)
  })
})

test.describe('Cookie de sessão', () => {
  test('HttpOnly, SameSite e expira em até 7 dias', async () => {
    const { email, password } = await signupOrg()
    const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': ipNovo() } })
    const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken
    await ctx.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email, password, json: 'true' } })
    const sessao = (await ctx.storageState()).cookies.find((c) => /next-auth\.session-token$/.test(c.name))
    expect(sessao, 'cookie de sessão').toBeTruthy()
    expect(sessao!.httpOnly).toBe(true)
    expect(sessao!.sameSite).toBe('Lax')
    const dias = (sessao!.expires * 1000 - Date.now()) / 86400000
    expect(dias).toBeGreaterThan(6.9)
    expect(dias).toBeLessThanOrEqual(7.01)
    // sair invalida a sessão neste navegador
    const csrf2 = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken
    await ctx.post('/api/auth/signout', { form: { csrfToken: csrf2, json: 'true' } })
    expect((await ctx.get('/api/me')).status()).toBe(401)
    await ctx.dispose()
  })
})
