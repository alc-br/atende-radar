import { test, expect } from '@playwright/test'
import { testDb } from './db'
import { uid } from './helpers'
import { TEST_DB_URL } from './test-db-url'
import { join } from 'node:path'
import NodeModule from 'node:module'

// Medição (docs/operacao/medicao.md): a cobrança (applyProviderState, a mesma do checkout, do webhook e da sincronização)
// enfileira a conversão "purchase" só na 1ª cobrança paga de uma assinatura, uma vez; renovação fica registrada e não vai.
// Roda o código da cobrança neste processo, no banco dos testes, com o que o Pagar.me devolveria (sem rede) e com o
// fetch simulado: dá para conferir o que iria para o GA4 e para a Meta numa conta de produção (mode live).
process.env.DATABASE_URL = TEST_DB_URL
process.env.DB_QUIET = '1'

// o código do app importa com "@/..." (tsconfig paths), que o Playwright não resolve fora dos arquivos de teste
const Module = NodeModule as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string }
const resolve = Module._resolveFilename
Module._resolveFilename = (req, ...rest) => resolve(req.startsWith('@/') ? join(__dirname, '..', '..', 'src', req.slice(2)) : req, ...rest)

const DAY = 86_400_000

test('1ª cobrança paga envia purchase ao GA4 e à Meta uma vez; a renovação não é enviada', async () => {
  test.setTimeout(60_000)
  const { applyProviderState } = await import('../../src/lib/billing/service')
  const { sha256 } = await import('../../src/lib/attribution')

  const env = { ...process.env }
  const realFetch = globalThis.fetch
  const calls: { host: string; body: Record<string, unknown> }[] = []
  Object.assign(process.env, { GA4_MEASUREMENT_ID: 'G-TESTE', GA4_API_SECRET: 'segredo-ga4', META_PIXEL_ID: '123', META_CAPI_TOKEN: 'token-meta' })
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ host: new URL(String(url)).host, body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  try {
    const plan = await testDb.plan.findFirstOrThrow({ where: { code: 'essencial' } })
    const org = await testDb.organization.create({
      data: { name: `Medição ${uid()}`, displayName: 'Medição', status: 'active', attribution: JSON.stringify({ utm_source: 'meta', utm_campaign: 'cadastro' }) },
    })
    const subId = `sub_medicao_${uid()}`
    // o que o checkout grava: a origem da visita (cookies e escolha), o contato só em hash
    const origin = { sub: subId, at: { ga: '111.222', gs: '333', fbp: 'fb.1.1.2', consent: { analytics: true, ads: true } }, em: sha256('ana@exemplo.com'), externalId: sha256(org.id) }
    await testDb.subscription.create({
      data: { organizationId: org.id, planId: plan.id, status: 'trialing', trialEnd: new Date(Date.now() + 7 * DAY), currentPeriodEnd: new Date(Date.now() + 7 * DAY), attribution: JSON.stringify(origin) },
    })

    const cfg = { mode: 'live' as const, publicKey: 'pk_x', secretKey: 'sk_x' }
    const providerSub = {
      id: subId, status: 'active', customer: { id: 'cus_x' }, card: { brand: 'Visa', last_four_digits: '0010' },
      metadata: { app: 'atende-radar', organizationId: org.id, planId: plan.id, planCode: plan.code, cycle: 'monthly' },
    }
    const invoice = (id: string, paidAt: number, start: number) => ({
      id, status: 'paid', amount: 29900, subscription: { id: subId }, created_at: new Date(paidAt).toISOString(),
      charge: { id: `ch_${id}`, status: 'paid', paid_at: new Date(paidAt).toISOString() },
      cycle: { start_at: new Date(start).toISOString(), end_at: new Date(start + 30 * DAY).toISOString() },
    })
    const first = invoice(`in_a_${uid()}`, Date.now() - 31 * DAY, Date.now() - 31 * DAY)

    // contratação: a 1ª fatura paga ativa o plano e enfileira o purchase
    expect(await applyProviderState(cfg, org.id, providerSub, [first])).toMatchObject({ kind: 'activated' })
    const purchaseId = `purchase.${subId}`
    await expect.poll(async () => (await testDb.conversionEvent.findUnique({ where: { id: purchaseId } }))?.status, { timeout: 15_000 }).toBe('sent')
    const sent = await testDb.conversionEvent.findUniqueOrThrow({ where: { id: purchaseId } })
    expect(sent.result).toBe('ga4:ok meta:ok')
    expect(calls.map((c) => c.host).sort()).toEqual(['graph.facebook.com', 'www.google-analytics.com'])
    const ga = calls.find((c) => c.host === 'www.google-analytics.com')!.body
    expect(ga).toMatchObject({ client_id: '111.222', events: [{ name: 'purchase', params: { transaction_id: subId, value: 299, currency: 'BRL', session_id: '333', campaign_source: 'meta' } }] })
    const meta = (calls.find((c) => c.host === 'graph.facebook.com')!.body.data as Record<string, unknown>[])[0]
    expect(meta).toMatchObject({ event_name: 'Purchase', event_id: purchaseId, custom_data: { value: 299, currency: 'BRL' }, user_data: { em: [sha256('ana@exemplo.com')], fbp: 'fb.1.1.2' } })

    // sincronização de novo e a renovação paga: nada novo vai para fora
    const renewal = invoice(`in_b_${uid()}`, Date.now() - DAY, Date.now() - DAY)
    expect(await applyProviderState(cfg, org.id, providerSub, [first])).toMatchObject({ kind: 'synced', status: 'active' })
    expect(await applyProviderState(cfg, org.id, providerSub, [first, renewal])).toMatchObject({ kind: 'synced', status: 'active' })
    await new Promise((r) => setTimeout(r, 1500)) // a fila roda 0,5 s depois de enfileirar
    expect(calls).toHaveLength(2)
    expect(await testDb.conversionEvent.count({ where: { organizationId: org.id, kind: 'purchase' } })).toBe(1)
    expect(await testDb.conversionEvent.findUniqueOrThrow({ where: { id: `renewal.${renewal.id}` } })).toMatchObject({ kind: 'renewal', status: 'skipped', result: 'nao-enviado:renovacao' })
  } finally {
    process.env = env
    globalThis.fetch = realFetch
  }
})
