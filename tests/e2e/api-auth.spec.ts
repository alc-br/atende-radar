import { test, expect } from '@playwright/test'
import { PROTECTED_ROUTES, anonymous, loginAs } from './helpers'

test.describe('B2 · APIs exigem sessão', () => {
  for (const [method, path] of PROTECTED_ROUTES) {
    test(`sem login, ${method} ${path} devolve 401`, async () => {
      const ctx = await anonymous()
      const res = await ctx.fetch(path, { method, data: method === 'GET' ? undefined : {} })
      expect(res.status()).toBe(401)
      await ctx.dispose()
    })
  }

  test('login pelo NextAuth continua funcionando e libera as leituras', async () => {
    const ctx = await loginAs('contato@odontovida.com.br')
    for (const path of ['/api/dashboard', '/api/members', '/api/settings', '/api/conversations']) {
      const res = await ctx.get(path)
      expect(res.status(), path).toBe(200)
    }
    await ctx.dispose()
  })

  test('senha errada não gera sessão', async () => {
    const ctx = await loginAs('contato@odontovida.com.br', 'errada')
    const res = await ctx.get('/api/members')
    expect(res.status()).toBe(401)
    await ctx.dispose()
  })

  test('as rotas do NextAuth e a página de login seguem públicas', async () => {
    const ctx = await anonymous()
    expect((await ctx.get('/api/auth/csrf')).status()).toBe(200)
    expect((await ctx.get('/api/auth/providers')).status()).toBe(200)
    expect((await ctx.get('/login')).status()).toBe(200)
    await ctx.dispose()
  })
})
