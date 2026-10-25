import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { attributionFrom, consentFrom, normalizedPhone, sha256, withCampaign } from '../../src/lib/attribution'
import { activationEventId, hashedContact, pageUrl, purchaseEventId, sendConversion, signUpEventId, type ConversionPayload } from '../../src/lib/conversions'
import { isInternalEmail, normalizeRules } from '../../src/lib/internal'
import { brTime, googleAdsCsv, periodFrom, toCsv } from '../../src/lib/marketing-report'
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
    delete process.env.GA4_SERVER_SIGNUP
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

  test('cadastro: a Meta (CompleteRegistration) com o event_id do navegador; o GA4 fica com a tag do GTM', async () => {
    process.env.META_TEST_EVENT_CODE = 'TEST123'
    const id = signUpEventId('org1')
    const r = await sendConversion('sign_up', id, { eventTime: 1, sourceUrl: 'https://app.atenderadar.com.br/', attribution: { ga: '1.2', consent: { analytics: true, ads: true } }, em: sha256('ana@exemplo.com') })
    expect(r).toEqual(['ga4:pelo-navegador', 'meta:ok'])
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toMatchObject({ test_event_code: 'TEST123', data: [{ event_name: 'CompleteRegistration', event_id: 'sign_up.org1' }] })
  })

  test('cadastro com GA4_SERVER_SIGNUP=on: sign_up vai também ao GA4 pelo servidor, com a campanha', async () => {
    process.env.GA4_SERVER_SIGNUP = 'on'
    const r = await sendConversion('sign_up', signUpEventId('org1'), { eventTime: 1, sourceUrl: 'x', attribution: { ga: '1.2', gs: '9', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'pre_anuncio', consent: { analytics: true, ads: false } } })
    expect(r).toEqual(['ga4:ok', 'meta:sem-consentimento'])
    expect(calls[0].body).toMatchObject({ client_id: '1.2', events: [{ name: 'sign_up', params: { method: 'email', session_id: '9', campaign_source: 'google', campaign_medium: 'cpc', campaign: 'pre_anuncio' } }] })
  })

  test('ativação: GA4 "activation" e Meta "StartTrial" com o mesmo event_id do dataLayer', async () => {
    const id = activationEventId('org1')
    expect(id).toBe('activation.org1')
    const r = await sendConversion('activation', id, { eventTime: 5, sourceUrl: 'https://app.atenderadar.com.br/', attribution: { ga: '1.2', fbp: 'fb.1.1.2', gclid: 'g1', consent: { analytics: true, ads: true } }, ...hashedContact('ana@exemplo.com', '', 'org1') })
    expect(r).toEqual(['ga4:ok', 'meta:ok'])
    expect(calls[0].body).toMatchObject({ client_id: '1.2', events: [{ name: 'activation', params: { method: 'whatsapp' } }] })
    expect((calls[1].body.data as Record<string, unknown>[])[0]).toMatchObject({ event_name: 'StartTrial', event_id: 'activation.org1', event_time: 5, user_data: { em: [sha256('ana@exemplo.com')], fbp: 'fb.1.1.2' } })
    expect(await sendConversion('activation', id, { eventTime: 5, sourceUrl: 'x', attribution: null })).toEqual(['ga4:sem-consentimento', 'meta:sem-consentimento'])
  })

  test('erro HTTP lança (nova tentativa) sem expor o token', async () => {
    globalThis.fetch = (async () => new Response('erro', { status: 500 })) as typeof fetch
    const err = await sendConversion('purchase', 'purchase.sub_6', purchase({ analytics: false, ads: true })).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('Meta HTTP 500')
  })

  test('2º pixel: o mesmo evento, com o mesmo event_id, vai aos dois pixels', async () => {
    process.env.META_PIXEL_ID_2 = '456'
    process.env.META_CAPI_TOKEN_2 = 'token-meta-2'
    const r = await sendConversion('activation', activationEventId('org1'), { eventTime: 5, sourceUrl: 'x', attribution: { consent: { analytics: false, ads: true } } })
    expect(r).toEqual(['ga4:sem-consentimento', 'meta:ok', 'meta2:ok'])
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/v23.0/123/events', '/v23.0/456/events'])
    expect(calls[1].url).toContain('access_token=token-meta-2')
    expect(calls[0].body).toEqual(calls[1].body)
    expect((calls[1].body.data as Record<string, unknown>[])[0]).toMatchObject({ event_name: 'StartTrial', event_id: 'activation.org1' })
  })

  test('2º pixel sem o token: "meta2:sem-id"; sem o id, nem aparece', async () => {
    process.env.META_PIXEL_ID_2 = '456'
    expect(await sendConversion('sign_up', signUpEventId('org1'), { eventTime: 1, sourceUrl: 'x', attribution: { consent: { analytics: false, ads: true } } })).toEqual(['ga4:pelo-navegador', 'meta:ok', 'meta2:sem-id'])
    expect(calls).toHaveLength(1)
  })

  test('2º pixel com erro: o 1º recebe mesmo assim e a conversão lança (nova tentativa) sem expor o token', async () => {
    process.env.META_PIXEL_ID_2 = '456'
    process.env.META_CAPI_TOKEN_2 = 'token-meta-2'
    const urls: string[] = []
    globalThis.fetch = (async (url: string) => { urls.push(String(url)); return new Response('erro', { status: String(url).includes('/456/') ? 400 : 200 }) }) as typeof fetch
    const err = await sendConversion('purchase', 'purchase.sub_7', purchase({ analytics: false, ads: true })).catch((e: Error) => e)
    expect((err as Error).message).toBe('Meta 2 HTTP 400')
    expect(urls.map((u) => new URL(u).pathname)).toEqual(['/v23.0/123/events', '/v23.0/456/events'])
  })
})

test.describe('medição: internos e arquivos do Admin', () => {
  test('lista de internos: limpa o que foi digitado e casa e-mail exato ou domínio (com subdomínio)', () => {
    const r = normalizeRules({ emails: ' Ana@Exemplo.com, lixo;ana@exemplo.com ', domains: ['@ALC.com.br', 'sem ponto', 'teste.dev'] })
    expect(r).toEqual({ emails: ['ana@exemplo.com'], domains: ['alc.com.br', 'teste.dev'] })
    expect(isInternalEmail('ANA@exemplo.com', r)).toBe(true)
    expect(isInternalEmail('bia@exemplo.com', r)).toBe(false)
    expect(isInternalEmail('x@time.alc.com.br', r)).toBe(true)
    expect(isInternalEmail('x@naoalc.com.br', r)).toBe(false)
    expect(isInternalEmail(null, r)).toBe(false)
  })

  test('CSV do Google Ads no formato da importação, hora de Brasília', () => {
    expect(brTime(new Date('2026-10-23T17:30:05Z'))).toBe('2026-10-23 14:30:05')
    const csv = googleAdsCsv([
      { gclid: 'TESTE123', name: 'AtendeRadar - Ativacao', time: '2026-10-23 14:30:05', value: null, currency: 'BRL', kind: 'activation', organizationId: 'o' },
      { gclid: 'TESTE123', name: 'AtendeRadar - Assinatura', time: '2026-10-23 15:00:00', value: 299, currency: 'BRL', kind: 'purchase', organizationId: 'o' },
    ])
    expect(csv).toBe(
      'Parameters:TimeZone=America/Sao_Paulo\r\n' +
      'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\r\n' +
      'TESTE123,AtendeRadar - Ativacao,2026-10-23 14:30:05,,BRL\r\n' +
      'TESTE123,AtendeRadar - Assinatura,2026-10-23 15:00:00,299.00,BRL\r\n',
    )
  })

  test('CSV nunca vira fórmula na planilha e escapa vírgula e aspas', () => {
    expect(toCsv([['=HYPERLINK("x")', 'a,b', '-1']])).toBe(`"'=HYPERLINK(""x"")","a,b",'-1\r\n`)
  })

  test('período em dias de Brasília, até 1 ano', () => {
    const p = periodFrom(new URLSearchParams('from=2026-10-01&to=2026-10-23'))!
    expect(p.from.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(p.to.toISOString()).toBe('2026-10-24T02:59:59.999Z')
    expect(periodFrom(new URLSearchParams('from=2026-10-23&to=2026-10-01'))).toBeNull()
    expect(periodFrom(new URLSearchParams('from=2024-01-01&to=2026-10-01'))).toBeNull()
    expect(periodFrom(new URLSearchParams('from=ontem'))).toBeNull()
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
    // tráfego interno: marcado antes do GTM carregar
    expect(CONSENT_DEFAULT_SCRIPT).toContain("traffic_type:'internal'")
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
