import { test, expect } from '@playwright/test'
import { PROTECTED_ROUTES, anonymous, loginAs } from './helpers'
import { OWN_AUTH_ROUTES, PUBLIC_ROUTES, discoverRoutes } from './api-routes'

// ---- descoberta automática (api-routes.ts): toda rota nova em src/app/api entra no teste sem ninguém lembrar de listá-la ----
const DISCOVERED = discoverRoutes()

test.describe('B2 · APIs exigem sessão (descoberta automática das rotas)', () => {
  test('a varredura encontrou as rotas e as listas de exceção estão vivas', () => {
    expect(DISCOVERED.length, 'poucas rotas: a varredura de src/app/api falhou?').toBeGreaterThan(40)
    const patterns = new Set(DISCOVERED.map((r) => r.pattern))
    for (const p of [...Object.keys(PUBLIC_ROUTES), ...Object.keys(OWN_AUTH_ROUTES)]) {
      expect(patterns.has(p), `rota da lista de exceções não existe mais: ${p}`).toBe(true)
    }
  })

  for (const route of DISCOVERED.filter((r) => !(r.pattern in PUBLIC_ROUTES))) {
    for (const method of route.methods) {
      test(`sem login, ${method} ${route.path} (${route.pattern}) é recusado`, async () => {
        const ctx = await anonymous()
        const res = await ctx.fetch(route.path, { method, data: method === 'GET' ? undefined : {} })
        expect([401, 403, 404, 405], `${method} ${route.path} respondeu ${res.status()}`).toContain(res.status())
        await ctx.dispose()
      })
    }
  }
})

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
