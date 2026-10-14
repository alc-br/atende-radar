import { request as httpRequest } from 'node:http'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { BASE_URL, loginAs } from './helpers'
import { gatewayClient, GATEWAY_SECRET } from './gw'

// B2/T4 · Corpo JSON: malformado → 400 (antes caía no catch e virava 500); acima de 5 MB → 413 (src/lib/json-body.ts).
const JSON_HEADERS = { 'content-type': 'application/json' }
const LIMIT = 5 * 1024 * 1024

let admin: APIRequestContext
let gw: APIRequestContext

test.beforeAll(async () => {
  admin = await loginAs('admin.a@test.local')
  gw = await gatewayClient()
})
test.afterAll(async () => {
  await admin.dispose()
  await gw.dispose()
})

// Rotas representativas: as que liam request.json() direto (500 antes) e as que já toleravam corpo ruim.
const MALFORMED: Array<[method: string, path: string]> = [
  ['POST', '/api/alerts/x/dismiss'],
  ['POST', '/api/conversations/x/feedback'],
  ['PATCH', '/api/members/x'],
  ['PATCH', '/api/tours'],
  ['PATCH', '/api/settings'],
  ['POST', '/api/subscription/request'],
]

test.describe('B2 · corpo JSON das APIs', () => {
  for (const [method, path] of MALFORMED) {
    test(`JSON malformado em ${method} ${path} devolve 400`, async () => {
      const res = await admin.fetch(path, { method, headers: JSON_HEADERS, data: '{"reason": "sem fechar' })
      expect(res.status()).toBe(400)
      expect(await res.json()).toEqual({ error: 'JSON inválido' })
    })
  }

  test('corpo vazio, null ou texto solto onde a rota exige objeto devolve 400 (não 500)', async () => {
    for (const data of ['', 'null', '"texto"', '42']) {
      const res = await admin.fetch('/api/alerts/x/dismiss', { method: 'POST', headers: JSON_HEADERS, data })
      expect(res.status(), `corpo ${JSON.stringify(data)}`).toBe(400)
    }
  })

  test('JSON válido continua funcionando como antes', async () => {
    const res = await admin.patch('/api/tours', { data: { tourId: 'teste-corpo-json' } })
    expect(res.status()).toBe(200)
    expect((await res.json()).seen).toContain('teste-corpo-json')
    // validação da própria rota segue igual
    const semMotivo = await admin.post('/api/alerts/x/dismiss', { data: {} })
    expect(semMotivo.status()).toBe(400)
    expect((await semMotivo.json()).error).toBe('reason is required')
  })

  test('rota com autenticação própria (gateway) também recusa JSON malformado com 400', async () => {
    const res = await gw.post('/api/gateway/events', { headers: JSON_HEADERS, data: '{nao é json' })
    expect(res.status()).toBe(400)
    // corpo válido no tick (corpo opcional) segue respondendo 200; empresa inexistente = nada a analisar
    const tick = await gw.post('/api/gateway/tick', { data: { organizationId: 'org-que-nao-existe' } })
    expect(tick.status()).toBe(200)
  })

  test('corpo acima de 5 MB devolve 413 (pelo Content-Length)', async () => {
    const big = JSON.stringify({ reason: 'a'.repeat(LIMIT + 1024) })
    const res = await admin.fetch('/api/alerts/x/dismiss', { method: 'POST', headers: JSON_HEADERS, data: big })
    expect(res.status()).toBe(413)
  })

  test('corpo acima de 5 MB sem Content-Length (envio em partes) também devolve 413', async () => {
    // Envio "chunked": o limite tem de valer pelos bytes lidos, não só pelo cabeçalho.
    const status = await new Promise<number>((resolve, reject) => {
      const url = new URL('/api/gateway/events', BASE_URL)
      const req = httpRequest(
        { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { ...JSON_HEADERS, authorization: `Bearer ${GATEWAY_SECRET}` } }, // sem content-length → Node envia em partes
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        }
      )
      let answered = false
      req.on('response', () => (answered = true))
      // depois da resposta o servidor pode fechar a conexão no meio do envio: isso não é falha
      req.on('error', (e) => (answered ? undefined : reject(e)))
      req.setTimeout(60_000, () => req.destroy(new Error('sem resposta em 60 s')))
      const chunk = 'a'.repeat(256 * 1024)
      req.write('{"eventId":"grande","connectionId":"x","type":"message.received","payload":{"text":"')
      let sent = 0
      const pump = () => {
        while (sent < LIMIT + 512 * 1024 && !answered) {
          sent += chunk.length
          if (!req.write(chunk)) return void req.once('drain', pump)
        }
        if (!answered) req.end('"}}')
      }
      pump()
    })
    expect(status).toBe(413)
  })
})
