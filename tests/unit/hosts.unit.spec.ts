import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'

// Domínios separados: site (página de vendas) em atenderadar.com.br, app (entrar, cadastro, painel) em app.atenderadar.com.br.
// Os endereços entram no build; aqui ficam definidos antes de carregar o proxy.
process.env.NEXT_PUBLIC_SITE_URL = 'https://atenderadar.com.br'
process.env.NEXT_PUBLIC_APP_URL = 'https://app.atenderadar.com.br'

const call = async (host: string, path: string, method = 'GET') => {
  const { proxy } = await import('../../src/proxy')
  const res = await proxy(new NextRequest(`https://${host}${path}`, { method, headers: { host } }))
  return { status: res.status, location: res.headers.get('location'), robots: res.headers.get('x-robots-tag'), rewrite: res.headers.get('x-middleware-rewrite') }
}

test.describe('domínios do site e do app', () => {
  test('site serve a página de vendas, os arquivos dela e o catálogo de planos', async () => {
    for (const path of ['/', '/brand/logo-atenderadar.webp', '/_next/static/x.js', '/api/public/plans', '/favicon.ico', '/conteudos', '/conteudos/vendas-perdidas-whatsapp', '/privacidade', '/termos', '/sitemap.xml', '/robots.txt']) {
      const r = await call('atenderadar.com.br', path)
      expect(r.location, path).toBeNull()
    }
  })

  test('no site, entrar, cadastro, convites e o painel vão para o app (mesmo caminho e parâmetros)', async () => {
    for (const path of ['/login', '/accept-invite?token=abc', '/reset-password?token=x', '/verify-email?token=y', '/api/me']) {
      const r = await call('atenderadar.com.br', path)
      expect(r.status, path).toBe(308)
      expect(r.location).toBe(`https://app.atenderadar.com.br${path}`)
    }
  })

  test('a raiz do site serve a página de vendas renderizada no servidor; /inicio não fica duplicado', async () => {
    const home = await call('atenderadar.com.br', '/?utm_source=x')
    expect(home.location).toBeNull()
    expect(new URL(home.rewrite!).pathname).toBe('/inicio')
    expect(new URL(home.rewrite!).search).toBe('?utm_source=x')
    for (const host of ['atenderadar.com.br', 'app.atenderadar.com.br']) {
      const r = await call(host, '/inicio')
      expect(r.status, host).toBe(308)
      expect(r.location).toBe('https://atenderadar.com.br/')
    }
    expect((await call('app.atenderadar.com.br', '/')).rewrite).toBeNull() // no app, "/" continua sendo o login/painel
  })

  test('www vai para o domínio principal', async () => {
    const r = await call('www.atenderadar.com.br', '/?utm_source=x')
    expect(r.status).toBe(308)
    expect(r.location).toBe('https://atenderadar.com.br/?utm_source=x')
  })

  test('domínio antigo: páginas vão para o app, APIs continuam (aviso do Pagar.me e gateway)', async () => {
    const page = await call('atende-radar.dev.alc.srv.br', '/')
    expect(page.status).toBe(308)
    expect(page.location).toBe('https://app.atenderadar.com.br/')
    const webhook = await call('atende-radar.dev.alc.srv.br', '/api/billing/webhook', 'POST')
    expect(webhook.location).toBeNull()
    expect(webhook.status).toBe(200)
  })

  test('app serve tudo, fica fora do Google e as APIs continuam exigindo sessão', async () => {
    const home = await call('app.atenderadar.com.br', '/')
    expect(home.location).toBeNull()
    expect(home.robots).toContain('noindex')
    expect((await call('app.atenderadar.com.br', '/api/me')).status).toBe(401)
  })

  test('no app, artigos e páginas legais levam ao site', async () => {
    for (const path of ['/conteudos', '/conteudos/vendas-perdidas-whatsapp', '/privacidade', '/termos']) {
      const r = await call('app.atenderadar.com.br', path)
      expect(r.status, path).toBe(308)
      expect(r.location).toBe(`https://atenderadar.com.br${path}`)
    }
  })

  test('chamadas internas do servidor (health check) não são redirecionadas', async () => {
    expect((await call('127.0.0.1:3200', '/')).location).toBeNull()
  })
})
