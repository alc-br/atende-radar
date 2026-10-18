import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'

// "Mais opções" da regra de alerta: equipes, números, dias e horários, encerrar sozinho e exceções.
// A API grava, devolve no GET e recusa o que o motor não entenderia (inclusive equipe/número de outra empresa).
test.describe('regra de alerta: filtros', () => {
  test('grava, devolve, edita e recusa valores inválidos ou de outra empresa', async () => {
    const a = await signupOrg()
    const api = await loginAs(a.email, a.password)
    const b = await signupOrg()
    const other = await loginAs(b.email, b.password)

    const team = await api.post('/api/teams', { data: { name: 'Vendas', code: 'VEN' } })
    expect(team.status()).toBe(201)
    const teamId = (await team.json()).team.id as string
    const foreign = await other.post('/api/teams', { data: { name: 'Deles', code: 'DEL' } })
    expect(foreign.status()).toBe(201)
    const foreignTeamId = (await foreign.json()).team.id as string

    const window = { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' }
    const created = await api.post('/api/alert-rules', {
      data: { name: 'Filtros teste', type: 'no_response', scopeTeams: [teamId, teamId], daysAndHours: window, autoCloseMinutes: 90, exceptions: [' Cliente VIP ', 'cliente vip', '', 'Atacado'] },
    })
    expect(created.status()).toBe(201)
    const id = (await created.json()).rule.id as string

    type R = { id: string; scopeTeams: string[]; scopeConnections: string[]; daysAndHours: unknown; autoCloseMinutes: number | null; exceptions: string[] }
    const get = async () => ((await (await api.get('/api/alert-rules')).json()).rules as R[]).find((r) => r.id === id)!
    let r = await get()
    expect(r.scopeTeams).toEqual([teamId])
    expect(r.daysAndHours).toEqual(window)
    expect(r.autoCloseMinutes).toBe(90)
    expect(r.exceptions).toEqual(['Cliente VIP', 'cliente vip', 'Atacado'])

    // inválidos: nada é gravado
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ scopeTeams: [foreignTeamId] }, 'invalid_scope_teams'],
      [{ scopeTeams: ['nao-existe'] }, 'invalid_scope_teams'],
      [{ scopeConnections: ['nao-existe'] }, 'invalid_scope_connections'],
      [{ scopeTeams: 'Vendas' }, 'invalid_list'],
      [{ daysAndHours: { days: [], start: '08:00', end: '18:00' } }, 'invalid_days_hours'],
      [{ daysAndHours: { days: [1], start: '8h', end: '18:00' } }, 'invalid_days_hours'],
      [{ daysAndHours: { days: [1], start: '08:00', end: '08:00' } }, 'invalid_days_hours'],
      [{ daysAndHours: [1, 2] }, 'invalid_days_hours'],
      [{ autoCloseMinutes: -5 }, 'invalid_auto_close'],
      [{ autoCloseMinutes: 1.5 }, 'invalid_auto_close'],
      [{ autoCloseMinutes: 43_201 }, 'invalid_auto_close'],
      [{ exceptions: ['x'.repeat(41)] }, 'invalid_exceptions'],
      [{ exceptions: Array.from({ length: 21 }, (_, i) => `t${i}`) }, 'invalid_exceptions'],
    ]
    for (const [data, code] of cases) {
      const put = await api.put(`/api/alert-rules/${id}`, { data })
      expect(put.status(), JSON.stringify(data)).toBe(400)
      expect((await put.json()).code, JSON.stringify(data)).toBe(code)
      const post = await api.post('/api/alert-rules', { data: { name: `Ruim ${code}`, type: 'no_response', ...data } })
      expect(post.status(), `POST ${JSON.stringify(data)}`).toBe(400)
      expect((await post.json()).code).toBe(code)
    }
    expect(await get()).toEqual(r)

    // edição: noturno que passa da meia-noite, 0 = não encerra sozinho, listas vazias = todas
    const night = { days: [0], start: '22:00', end: '06:00' }
    const put = await api.put(`/api/alert-rules/${id}`, { data: { daysAndHours: night, autoCloseMinutes: 0, exceptions: [], scopeTeams: [] } })
    expect(put.status()).toBe(200)
    r = await get()
    expect(r.daysAndHours).toEqual(night)
    expect(r.autoCloseMinutes).toBeNull()
    expect(r.exceptions).toEqual([])
    expect(r.scopeTeams).toEqual([])
    // {} = sempre
    expect((await api.put(`/api/alert-rules/${id}`, { data: { daysAndHours: {} } })).status()).toBe(200)
    expect((await get()).daysAndHours).toEqual({})

    // regras padrão de quem acabou de entrar: "encerrar sozinho" desligado (opt-in)
    const defaults = (await (await api.get('/api/alert-rules')).json()).rules as R[]
    expect(defaults.filter((x) => x.id !== id).every((x) => x.autoCloseMinutes == null)).toBe(true)

    await api.dispose()
    await other.dispose()
  })
})
