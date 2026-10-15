import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'

// Canais da regra de alerta: só os que o motor entende (in_app, email). A tela escolhe; a API valida.
test.describe('regra de alerta: canais', () => {
  test('cria com no sistema + e-mail, recusa canal desconhecido ou lista vazia, e a edição troca os canais', async () => {
    const { email, password } = await signupOrg()
    const api = await loginAs(email, password)

    const created = await api.post('/api/alert-rules', { data: { name: 'Canais teste', type: 'no_response', channels: ['in_app', 'email'] } })
    expect(created.status()).toBe(201)
    const { rule } = await created.json()

    const list = async () => ((await (await api.get('/api/alert-rules')).json()).rules as Array<{ id: string; channels: string[] }>)
    expect((await list()).find((r) => r.id === rule.id)?.channels).toEqual(['in_app', 'email'])

    for (const channels of [['sms'], [], 'email', ['email', 42]]) {
      const bad = await api.post('/api/alert-rules', { data: { name: 'Canal ruim', type: 'no_response', channels } })
      expect(bad.status(), JSON.stringify(channels)).toBe(400)
      expect((await bad.json()).code).toBe('invalid_channels')
    }

    // sem a lista, só no sistema (como antes)
    const plain = await api.post('/api/alert-rules', { data: { name: 'Sem canais', type: 'no_response' } })
    expect(plain.status()).toBe(201)
    const plainId = (await plain.json()).rule.id
    expect((await list()).find((r) => r.id === plainId)?.channels).toEqual(['in_app'])

    const put = await api.put(`/api/alert-rules/${rule.id}`, { data: { channels: ['email', 'email'] } })
    expect(put.status()).toBe(200)
    expect((await list()).find((r) => r.id === rule.id)?.channels).toEqual(['email'])

    const badPut = await api.put(`/api/alert-rules/${rule.id}`, { data: { channels: [] } })
    expect(badPut.status()).toBe(400)
    expect((await list()).find((r) => r.id === rule.id)?.channels).toEqual(['email'])
    await api.dispose()
  })
})
