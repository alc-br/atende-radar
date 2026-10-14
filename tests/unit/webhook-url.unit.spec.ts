import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { isBlockedAddress, validateWebhookUrl, signBody, generateSecret } from '../../src/lib/webhook-url'

// P4 · Webhook de saída: proteção contra SSRF (endereços internos) e assinatura. Funções puras, sem rede.
test.describe('P4 · webhook: endereços bloqueados', () => {
  const BLOCKED = [
    '127.0.0.1', '127.9.9.9', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '::', '::1', 'fd00::1', 'fc12:3456::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2002:7f00:1::', 'lixo',
  ]
  const PUBLIC = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']

  for (const ip of BLOCKED) test(`bloqueia ${ip}`, () => expect(isBlockedAddress(ip)).toBe(true))
  for (const ip of PUBLIC) test(`libera ${ip}`, () => expect(isBlockedAddress(ip)).toBe(false))
})

test.describe('P4 · webhook: validação da URL', () => {
  const env = { ...process.env }
  test.afterEach(() => {
    process.env = { ...env }
  })

  test('aceita https público e normaliza', () => {
    expect(validateWebhookUrl('https://hooks.cliente.com.br/atende')).toEqual({ ok: true, url: 'https://hooks.cliente.com.br/atende' })
    expect(validateWebhookUrl('  https://8.8.8.8:8443/x  ').ok).toBe(true)
  })

  const BAD = [
    '', 'não é url', 'http://hooks.cliente.com.br/x', 'ftp://cliente.com.br/', 'https://user:senha@cliente.com.br/',
    'https://localhost/x', 'https://app.localhost/x', 'https://servidor.local/', 'https://intranet/', 'https://127.0.0.1/',
    'https://2130706433/', 'https://0x7f000001/', 'https://127.1/', 'https://10.0.0.5/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/',
    'https://169.254.169.254/latest/meta-data/', 'https://[fe80::1]/',
  ]
  for (const url of BAD) {
    test(`recusa ${JSON.stringify(url)}`, () => {
      delete process.env.WEBHOOK_ALLOW_LOCAL
      expect(validateWebhookUrl(url).ok).toBe(false)
    })
  }

  test('WEBHOOK_ALLOW_LOCAL libera só http(s)://127.0.0.1, e nunca em produção', () => {
    process.env.WEBHOOK_ALLOW_LOCAL = '1'
    ;(process.env as Record<string, string>).NODE_ENV = 'test'
    expect(validateWebhookUrl('http://127.0.0.1:4567/hook').ok).toBe(true)
    expect(validateWebhookUrl('http://localhost:4567/hook').ok).toBe(false)
    expect(validateWebhookUrl('http://10.0.0.1/hook').ok).toBe(false)
    expect(validateWebhookUrl('http://hooks.cliente.com.br/').ok).toBe(false)
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    expect(validateWebhookUrl('http://127.0.0.1:4567/hook').ok).toBe(false)
  })
})

test('P4 · webhook: assinatura = HMAC-SHA256 do corpo cru, em hex', () => {
  const secret = generateSecret()
  expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{40,}$/)
  expect(generateSecret()).not.toBe(secret)
  const body = '{"event":"alert.created","data":{"alertId":"a1"}}'
  expect(signBody(body, secret)).toBe(createHmac('sha256', secret).update(body).digest('hex'))
  expect(signBody(body + ' ', secret)).not.toBe(signBody(body, secret))
})
