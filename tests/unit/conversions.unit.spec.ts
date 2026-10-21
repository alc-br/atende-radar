import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { attributionFrom, consentFrom, normalizedPhone, sha256, withCampaign } from '../../src/lib/attribution'
import { hashedContact, pageUrl, purchaseEventId, sendConversion, signUpEventId, type ConversionPayload } from '../../src/lib/conversions'
import { contentSecurityPolicy } from '../../src/lib/csp'
import { CONSENT_DEFAULT_SCRIPT, gtmId, gtmSnippet } from '../../src/lib/gtm'

// Medição (docs/operacao/medicao.md): origem da venda lida dos cookies, envio das conversões pelo servidor (GA4 e Meta,
// com fetch simulado: sem rede), consentimento, CSP e o ID do GTM. Funções puras.

const headers = (cookie: string) => new Headers({ cookie })
const ALL = encodeURIComponent(JSON.stringify({ v: 1, analytics: true, ads: true }))
const NONE = encodeURIComponent(JSON.stringify({ v: 1, analytics: false, ads: false }))
const ATTR = encodeURIComponent(JSON.stringify({ utm_source: 'google', utm_campaign: 'lancamento', gclid: 'abc', fbclid: 'IwAR1', nome: 'Fulano', landing: '/', at: '2026-10-21T10:00:00.000Z' }))

test.describe('medição: origem e consentimento lidos dos cookies', () => {
  test('lê campanha, _ga, _ga_<stream>, _fbp e a escolha; ignora chaves desconhecidas', () => {
    const a = attributionFrom(headers(`ar_attr=${ATTR}; _ga=GA1.1.123456789.1729500000; _ga_1KVLT8H1ZP=GS2.1.s1729511111$o1$g1; _fbp=fb.1.1729500000.987; ar_consent=${ALL}`))
    expect(a).toMatchObject({ utm_source: 'google', utm_campaign: 'lancamento', gclid: 'abc', ga: '123456789.1729500000', gs: '1729511111', fbp: 'fb.1.1729500000.987', consent: { analytics: true, ads: true } })
    expect(a).not.toHaveProperty('nome')
    // sem _fbc, monta o fbc do fbclid da visita (formato da Meta)
    expect(a!.fbc).toBe(`fb.1.${Date.parse('2026-10-21T10:00:00.000Z')}.IwAR1`)
  })

  test('sem cookie nenhum: sem origem; consentimento negado por padrão', () => {
    expect(attributionFrom(headers(''))).toBeNull()
    expect(consentFrom(headers('ar_consent=lixo'))).toEqual({ analytics: false, ads: false })
  })

  test('sem campanha na visita, usa a do cadastro da empresa', () => {
    const visit = { ga: '1.2', consent: { analytics: true, ads: false } }
    expect(withCampaign(visit, { utm_source: 'meta', landing: '/inicio' })).toEqual({ utm_source: 'meta', landing: '/inicio', ga: '1.2', consent: { analytics: true, ads: false } })
    expect(withCampaign({ utm_source: 'google' }, { utm_source: 'meta' })).toEqual({ utm_source: 'google' })
  })

  test('e-mail e celular só em hash SHA-256 normalizado (país 55)', () => {
    expect(sha256('  Ana@Exemplo.COM ')).toBe(createHash('sha256').update('ana@exemplo.com').digest('hex'))
    expect(normalizedPhone('(41) 99111-2233')).toBe('5541991112233')
    const h = hashedContact('ana@exemplo.com', '41991112233', 'org1')
    expect(h.ph).toBe(createHash('sha256').update('5541991112233').digest('hex'))
    expect(JSON.stringify(h)).not.toContain('ana@')
  })

  test('página da conversão sem query string', () => {
    expect(pageUrl('https://app.atenderadar.com.br/?modo=cadastro&email=x', 'https://x/')).toBe('https://app.atenderadar.com.br/')
    expect(pageUrl(null, 'https://app.atenderadar.com.br/login')).toBe('https://app.atenderadar.com.br/login')
  })
})

test.describe('medição: envio pelo servidor', () => {
  const env = { ...process.env }
  const realFetch = globalThis.fetch
  let calls: { url: string; body: Record<string, unknown> }[] = []

  test.beforeEach(() => {
    calls = []
    process.env.GA4_MEASUREMENT_ID = 'G-TESTE'
    process.env.GA4_API_SECRET = 'segredo-ga4'
    process.env.META_PIXEL_ID = '123'
    process.env.META_CAPI_TOKEN = 'token-meta'
    delete process.env.META_TEST_EVENT_CODE
    delete process.env.GA4_DEBUG
    delete process.env.META_GRAPH_VERSION
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) })
      return new Response('{}', { status: 200 })
    }) as typeof fetch
  })
  test.afterEach(() => {
    process.env = { ...env }
    globalThis.fetch = realFetch
  })

  const purchase = (consent: { analytics: boolean; ads: boolean }, extra: Partial<ConversionPayload> = {}): ConversionPayload => ({
    eventTime: 1729500000, sourceUrl: 'https://app.atenderadar.com.br/',
    attribution: { ga: '123.456', gs: '789', fbp: 'fb.1.1.2', fbc: 'fb.1.1.IwAR', utm_source: 'google', consent },
    ...hashedContact('ana@exemplo.com', '41991112233', 'org1'),
    value: 299, currency: 'BRL', transactionId: 'sub_1',
    items: [{ item_id: 'essencial', item_name: 'Essencial', item_variant: 'monthly', price: 299, quantity: 1 }],
    ...extra,
  })

  test('1ª cobrança paga com consentimento: GA4 purchase e Meta Purchase com o mesmo event_id', async () => {
    const id = purchaseEventId('sub_1')
    expect(await sendConversion('purchase', id, purchase({ analytics: true, ads: true }))).toEqual(['ga4:ok', 'meta:ok'])
    expect(calls).toHaveLength(2)
    const [ga, meta] = calls
    expect(ga.url).toContain('https://www.google-analytics.com/mp/collect?measurement_id=G-TESTE')
    expect(ga.body).toMatchObject({ client_id: '123.456', events: [{ name: 'purchase', params: { transaction_id: 'sub_1', value: 299, currency: 'BRL', session_id: '789', campaign_source: 'google' } }] })
    expect(meta.url).toContain('https://graph.facebook.com/v23.0/123/events')
    const ev = (meta.body.data as Record<string, unknown>[])[0]
    expect(ev).toMatchObject({ event_name: 'Purchase', event_id: 'purchase.sub_1', action_source: 'website', custom_data: { currency: 'BRL', value: 299 } })
    expect(ev.user_data).toMatchObject({ em: [sha256('ana@exemplo.com')], ph: [sha256('5541991112233')], fbp: 'fb.1.1.2', fbc: 'fb.1.1.IwAR' })
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain('ana@exemplo.com')
  })

  test('sem consentimento: nada vai, "sem-consentimento"', async () => {
    expect(await sendConversion('purchase', 'purchase.sub_2', purchase({ analytics: false, ads: false }))).toEqual(['ga4:sem-consentimento', 'meta:sem-consentimento'])
    expect(await sendConversion('purchase', 'purchase.sub_3', purchase({ analytics: true, ads: false }))).toEqual(['ga4:ok', 'meta:sem-consentimento'])
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['www.google-analytics.com'])
  })

  test('sem os segredos: "sem-id", sem chamada de rede', async () => {
    delete process.env.GA4_API_SECRET
    delete process.env.META_CAPI_TOKEN
    expect(await sendConversion('purchase', 'purchase.sub_4', purchase({ analytics: true, ads: true }))).toEqual(['ga4:sem-id', 'meta:sem-id'])
    expect(calls).toEqual([])
  })

  test('renovação e sandbox não são enviados', async () => {
    expect(await sendConversion('renewal', 'renewal.in_1', purchase({ analytics: true, ads: true }))).toEqual(['nao-enviado:renovacao'])
    expect(await sendConversion('purchase', 'purchase.sub_5', purchase({ analytics: true, ads: true }, { sandbox: true }))).toEqual(['ignorado:sandbox'])
    expect(calls).toEqual([])
  })

  test('cadastro: só a Meta (CompleteRegistration), com o event_id do navegador e o código de teste', async () => {
    process.env.META_TEST_EVENT_CODE = 'TEST123'
    const id = signUpEventId('org1')
    const r = await sendConversion('sign_up', id, { eventTime: 1, sourceUrl: 'https://app.atenderadar.com.br/', attribution: { consent: { analytics: true, ads: true } }, em: sha256('ana@exemplo.com') })
    expect(r).toEqual(['meta:ok'])
    expect(calls[0].body).toMatchObject({ test_event_code: 'TEST123', data: [{ event_name: 'CompleteRegistration', event_id: 'sign_up.org1' }] })
  })

  test('erro HTTP lança (nova tentativa) sem expor o token', async () => {
    globalThis.fetch = (async () => new Response('erro', { status: 500 })) as typeof fetch
    const err = await sendConversion('purchase', 'purchase.sub_6', purchase({ analytics: false, ads: true })).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('Meta HTTP 500')
  })
})

test.describe('medição: GTM e CSP', () => {
  test('GTM só com ID válido', () => {
    expect(gtmId('GTM-P43TS3SF')).toBe('GTM-P43TS3SF')
    expect(gtmId(' GTM-P43TS3SF ')).toBe('GTM-P43TS3SF')
    for (const bad of [undefined, '', 'GTM-', 'gtm-p43ts3sf', 'G-1KVLT8H1ZP', 'GTM-ABC', 'GTM-P43TS3SF"><script>']) expect(gtmId(bad)).toBeNull()
    expect(gtmSnippet('GTM-P43TS3SF')).toContain("'dataLayer',\"GTM-P43TS3SF\"")
  })

  test('padrão do Consent Mode: negado até escolher', () => {
    expect(CONSENT_DEFAULT_SCRIPT).toContain("gtag('consent','default'")
    expect(CONSENT_DEFAULT_SCRIPT).toContain("c.analytics===true?'granted':'denied'")
  })

  test('CSP libera as tags de medição e mais nada', () => {
    const csp = contentSecurityPolicy({ nonce: 'abc', dev: false })
    const dir = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' '))!.split(' ').slice(1)
    expect(dir('script-src')).toEqual(expect.arrayContaining(["'nonce-abc'", "'strict-dynamic'", 'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://www.googleadservices.com', 'https://googleads.g.doubleclick.net']))
    const connect = ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://*.g.doubleclick.net', 'https://www.google.com', 'https://www.facebook.com', 'https://connect.facebook.net']
    expect(dir('connect-src')).toEqual(["'self'", 'https://api.pagar.me', 'https://viacep.com.br', ...connect])
    expect(dir('img-src')).toEqual(["'self'", 'data:', 'blob:', ...connect, 'https://www.google.com.br'])
    expect(dir('frame-src')).toEqual(['https://www.googletagmanager.com', 'https://td.doubleclick.net'])
    expect(dir('frame-ancestors')).toEqual(["'none'"])
  })
})
