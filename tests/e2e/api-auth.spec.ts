import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test, expect } from '@playwright/test'
import { PROTECTED_ROUTES, anonymous, loginAs } from './helpers'

// ---- descoberta automática: toda rota nova em src/app/api entra no teste sem ninguém lembrar de listá-la ----
const API_DIR = join(process.cwd(), 'src', 'app', 'api')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/**
 * Rotas PÚBLICAS de propósito (sem sessão podem responder 200/400/429...). Não são chamadas aqui: só se confere
 * que continuam existindo (lista viva). Rota nova pública = acrescentar aqui, com o motivo.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  '/api/auth/[...nextauth]': 'login do NextAuth (csrf, providers, callback, session) — testado em auth.spec.ts',
  '/api/auth/signup': 'cadastro público (limite por IP)',
  '/api/auth/forgot': 'pedido de nova senha (limite por IP, não revela se o e-mail existe)',
  '/api/auth/reset': 'troca de senha com token do e-mail (limite por IP)',
  '/api/auth/accept-invite': 'aceite de convite com token do e-mail (limite por IP)',
  '/api/auth/verify-email': 'confirmação de e-mail com token',
  '/api/public/plans': 'catálogo de planos da página de vendas',
}

/**
 * Fora do proxy de sessão, mas com autenticação própria: sem a credencial devem recusar como as demais
 * (por isso CONTINUAM no teste genérico abaixo). Listadas para documentar a exceção do src/proxy.ts.
 */
const OWN_AUTH_ROUTES: Record<string, string> = {
  '/api/billing/webhook': 'aviso do Pagar.me: autenticação básica (PAGARME_WEBHOOK_USER/PASS)',
  '/api/gateway/events': 'serviço do WhatsApp: Bearer GATEWAY_SECRET',
  '/api/gateway/tick': 'serviço do WhatsApp / agendador: Bearer GATEWAY_SECRET',
  '/api/gateway/connections': 'serviço do WhatsApp: Bearer GATEWAY_SECRET',
}

function discoverRoutes(): Array<{ pattern: string; path: string; methods: string[] }> {
  if (!existsSync(API_DIR)) throw new Error(`pasta de rotas não encontrada: ${API_DIR} (rode a partir da raiz do projeto)`)
  const out: Array<{ pattern: string; path: string; methods: string[] }> = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name === 'route.ts') {
        const segs = relative(API_DIR, dir).split(sep).filter(Boolean)
        const pattern = '/' + ['api', ...segs].join('/')
        // segmento dinâmico ([id], [...slug], [[...slug]]) vira um id fictício
        const path = '/' + ['api', ...segs.map((s) => (s.startsWith('[') ? 'x' : s))].join('/')
        const src = readFileSync(full, 'utf8')
        const exported = METHODS.filter(
          (m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src) || new RegExp(`export\\s*\\{[^}]*\\bas\\s+${m}\\b`).test(src)
        )
        // sempre GET e POST (método não exportado deve dar 401 ou 405, nunca 200/500) + os que a rota exporta
        out.push({ pattern, path, methods: [...new Set(['GET', 'POST', ...exported])] })
      }
    }
  }
  walk(API_DIR)
  return out.sort((a, b) => a.pattern.localeCompare(b.pattern))
}

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
