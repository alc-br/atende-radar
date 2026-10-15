import { test, expect } from '@playwright/test'
import { bearerMatches, simulationAccess } from '../../src/lib/simulation/access'
import { simulationEnabled, isSimulationEmail } from '../../src/lib/sandbox'
import { SCENARIOS } from '../../src/lib/simulation/scenarios'

// S1 · Porta do ambiente de simulação (funções puras e o caso "desligado", que o servidor de teste não cobre:
// lá a simulação está ligada).
const SECRET = 'segredo-de-teste-com-mais-de-16'

test.describe('segredo da simulação (Bearer)', () => {
  test('só aceita o segredo exato, com 16+ caracteres', () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true)
    expect(bearerMatches(`Bearer   ${SECRET}  `, SECRET)).toBe(true)
    expect(bearerMatches(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(bearerMatches(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe(false)
    expect(bearerMatches(SECRET, SECRET)).toBe(false) // sem "Bearer"
    expect(bearerMatches(`Basic ${SECRET}`, SECRET)).toBe(false)
    expect(bearerMatches(null, SECRET)).toBe(false)
    expect(bearerMatches('Bearer curto', 'curto')).toBe(false) // segredo curto demais nunca vale
    expect(bearerMatches('Bearer ', '')).toBe(false)
    expect(bearerMatches(`Bearer ${SECRET}`, undefined)).toBe(false) // sem SIMULATION_SECRET: Bearer nunca entra
  })
})

test.describe('chave SIMULATION_ENABLED', () => {
  const original = { enabled: process.env.SIMULATION_ENABLED, secret: process.env.SIMULATION_SECRET }
  test.afterEach(() => {
    if (original.enabled === undefined) delete process.env.SIMULATION_ENABLED
    else process.env.SIMULATION_ENABLED = original.enabled
    if (original.secret === undefined) delete process.env.SIMULATION_SECRET
    else process.env.SIMULATION_SECRET = original.secret
  })

  test('só "on" liga; qualquer outro valor (ou ausente) deixa desligado', () => {
    for (const v of [undefined, '', 'off', 'true', '1', 'ON', ' on']) {
      if (v === undefined) delete process.env.SIMULATION_ENABLED
      else process.env.SIMULATION_ENABLED = v
      expect(simulationEnabled(), String(v)).toBe(false)
    }
    process.env.SIMULATION_ENABLED = 'on'
    expect(simulationEnabled()).toBe(true)
  })

  test('desligado: 404 para todos, inclusive com o segredo certo', async () => {
    delete process.env.SIMULATION_ENABLED
    process.env.SIMULATION_SECRET = SECRET
    const r = await simulationAccess(new Request('http://x/api/admin/simulation/scenarios', { headers: { Authorization: `Bearer ${SECRET}` } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.res.status).toBe(404)
  })

  test('ligado: segredo certo entra como "token"; errado → 401', async () => {
    process.env.SIMULATION_ENABLED = 'on'
    process.env.SIMULATION_SECRET = SECRET
    const ok = await simulationAccess(new Request('http://x/', { headers: { Authorization: `Bearer ${SECRET}` } }))
    expect(ok.ok && ok.by).toBe('token')
    const bad = await simulationAccess(new Request('http://x/', { headers: { Authorization: 'Bearer outro-segredo-qualquer-123' } }))
    expect(!bad.ok && bad.res.status).toBe(401)
  })
})

test.describe('catálogo de cenários', () => {
  test('pelo menos 6, ids únicos, cada um com passos e verificações', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(6)
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length)
    for (const s of SCENARIOS) {
      expect(s.id, s.id).toMatch(/^[a-z0-9-]+$/)
      expect(s.steps.length, s.id).toBeGreaterThan(0)
      const checks = (s.expect?.length ?? 0) + s.steps.reduce((n, st) => n + ('expectStatus' in st ? 1 : 'expect' in st && Array.isArray(st.expect) ? st.expect.length : 0), 0)
      expect(checks, `${s.id} sem verificações`).toBeGreaterThan(0)
    }
  })

  test('membros sintéticos usam o domínio reservado', () => {
    expect(isSimulationEmail('gestor.abc@sim.invalid')).toBe(true)
    expect(isSimulationEmail('GESTOR.abc@SIM.INVALID')).toBe(true)
    expect(isSimulationEmail('alguem@sim.invalid.com.br')).toBe(false)
    expect(isSimulationEmail('platform@test.local')).toBe(false)
  })
})
