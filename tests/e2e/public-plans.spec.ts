import { test, expect } from '@playwright/test'
import { anonymous } from './helpers'

// V3 · a página de vendas mostra os planos REAIS (uma única fonte: a tabela Plan), sem exigir login.
test.describe('V3 · planos públicos', () => {
  test('sem login devolve os planos ativos, em ordem, com preço e limites', async () => {
    const anon = await anonymous()
    const res = await anon.get('/api/public/plans')
    expect(res.status()).toBe(200)
    const { plans } = await res.json()
    expect(plans.map((p: { code: string }) => p.code)).toEqual(['essencial', 'gestao', 'performance'])
    expect(plans.map((p: { monthlyPrice: number }) => p.monthlyPrice)).toEqual([149, 299, 599])
    const gestao = plans[1]
    expect(gestao.highlight).toBe(true)
    expect(gestao.limits.maxConnections).toBe(3)
    expect(gestao.limits.maxAgents).toBe(10)
    await anon.dispose()
  })

  test('não vaza nada além do catálogo (sem ids de gateway, sem assinaturas, sem organizações)', async () => {
    const anon = await anonymous()
    const body = await (await anon.get('/api/public/plans')).text()
    for (const forbidden of ['stripe', 'price_monthly', 'subscription', 'organization', 'Clínica B', 'OdontoVida']) {
      expect(body.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase())
    }
    await anon.dispose()
  })

  test('o resto da API continua fechado', async () => {
    const anon = await anonymous()
    expect((await anon.get('/api/plans')).status()).toBe(401)
    expect((await anon.get('/api/public/outra-coisa')).status()).toBe(404)
    await anon.dispose()
  })
})
