import { test, expect, type APIRequestContext } from '@playwright/test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { basename } from 'node:path'
import { anonymous, loginAs } from './helpers'
import { FAKE_PIPER_LOG, FAKE_PIPER_VOICE, TOUR_AUDIO_TEST_DIR } from './tour-audio-env'
import { SYSTEM_TOUR_CHAPTERS } from '../../src/lib/system-tour/content'
import { stepSpokenText } from '../../src/lib/system-tour/engine'
import { tourAudioKey } from '../../src/lib/system-tour/tts'

// Narração do tour: o áudio é gerado no servidor UMA vez (Piper; aqui um "Piper falso" que conta as chamadas) e depois
// servido do cache, com ETag e cache longo no navegador. O texto vem só do conteúdo do servidor.

const AUDIO = '/api/tours/system/audio'
const calls = () => (existsSync(FAKE_PIPER_LOG) ? readFileSync(FAKE_PIPER_LOG, 'utf8').split('\n').filter(Boolean).length : 0)
const clearCache = () => rmSync(TOUR_AUDIO_TEST_DIR, { recursive: true, force: true })

let admin: APIRequestContext
test.beforeAll(async () => {
  admin = await loginAs('admin.a@test.local')
})
test.afterAll(async () => {
  await admin.dispose()
})

test('sem login: 401', async () => {
  const anon = await anonymous()
  expect((await anon.get(`${AUDIO}?chapter=primeiros-passos&step=0`)).status()).toBe(401)
  await anon.dispose()
})

test('capítulo ou passo inexistente: 404 (e nenhum texto livre é aceito)', async () => {
  for (const q of ['chapter=primeiros-passos&step=99', 'chapter=nao-existe&step=0', 'chapter=primeiros-passos&step=abc', 'chapter=primeiros-passos', '', 'text=Ol%C3%A1&step=0']) {
    const res = await admin.get(`${AUDIO}?${q}`)
    expect(res.status(), q).toBe(404)
  }
})

test('capítulo que o papel não vê: 404', async () => {
  const atendente = await loginAs('atendente.a@test.local')
  expect((await atendente.get(`${AUDIO}?chapter=equipes&step=0`)).status()).toBe(404)
  expect((await atendente.get(`${AUDIO}?chapter=admin&step=0`)).status()).toBe(404)
  expect((await atendente.get(`${AUDIO}?chapter=conversas&step=0`)).status()).toBe(200)
  await atendente.dispose()
  expect((await admin.get(`${AUDIO}?chapter=admin&step=0`)).status(), 'Admin só para o operador da plataforma').toBe(404)
})

test('o servidor avisa que tem a narração em áudio', async () => {
  const body = await (await admin.get('/api/tours/system')).json()
  expect(body.audio).toBe(true)
})

test('gera uma vez, depois serve do cache com o mesmo ETag; If-None-Match devolve 304', async () => {
  clearCache()
  const before = calls()

  const first = await admin.get(`${AUDIO}?chapter=visao-geral&step=1`)
  expect(first.status()).toBe(200)
  expect(first.headers()['content-type']).toBe('audio/wav')
  expect(first.headers()['cache-control']).toBe('private, max-age=31536000, immutable')
  const body = await first.body()
  expect(body.subarray(0, 4).toString()).toBe('RIFF')
  expect(body.subarray(8, 12).toString()).toBe('WAVE')
  const etag = first.headers()['etag']
  expect(etag).toMatch(/^"[0-9a-f]{64}"$/)
  expect(calls(), 'a 1ª chamada gera o áudio').toBe(before + 1)

  // A chave é sha256(voz + versão + formato + texto da narração do passo)
  const step = SYSTEM_TOUR_CHAPTERS.find((c) => c.id === 'visao-geral')!.steps[1]
  expect(etag).toBe(`"${tourAudioKey(basename(FAKE_PIPER_VOICE), stepSpokenText(step), 'wav')}"`)
  expect(existsSync(`${TOUR_AUDIO_TEST_DIR}/${etag.slice(1, -1)}.wav`)).toBe(true)

  const second = await admin.get(`${AUDIO}?chapter=visao-geral&step=1`)
  expect(second.status()).toBe(200)
  expect(second.headers()['etag']).toBe(etag)
  expect(Buffer.compare(await second.body(), body)).toBe(0)
  expect(calls(), 'a 2ª chamada não chama o gerador').toBe(before + 1)

  const cached = await admin.get(`${AUDIO}?chapter=visao-geral&step=1`, { headers: { 'If-None-Match': etag } })
  expect(cached.status()).toBe(304)
  expect(cached.headers()['etag']).toBe(etag)

  // O Safari pede o áudio em pedaços
  const part = await admin.get(`${AUDIO}?chapter=visao-geral&step=1`, { headers: { Range: 'bytes=0-99' } })
  expect(part.status()).toBe(206)
  expect(part.headers()['content-range']).toBe(`bytes 0-99/${body.length}`)
  expect((await part.body()).length).toBe(100)
  expect(calls()).toBe(before + 1)
})

test('pedidos simultâneos do mesmo passo geram o áudio uma vez só', async () => {
  clearCache()
  const before = calls()
  const res = await Promise.all([0, 1, 2, 3].map(() => admin.get(`${AUDIO}?chapter=alertas&step=2`)))
  for (const r of res) expect(r.status()).toBe(200)
  expect(new Set(res.map((r) => r.headers()['etag'])).size).toBe(1)
  expect(calls()).toBe(before + 1)
})
