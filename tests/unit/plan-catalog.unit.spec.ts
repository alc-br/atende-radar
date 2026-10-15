import { test, expect } from '@playwright/test'
import { parsePlanPatch, catalogSyncPatch, PREVIOUS_CATALOG, PLAN_FEATURES, PLAN_CATALOG as plans } from '../../src/lib/plan-catalog'

// V7 · Admin › Planos: validação do que o operador edita e regra do sync do deploy (não sobrescreve edição do Admin).
test.describe('V7 · edição do catálogo de planos', () => {
  test('aceita só campos de vitrine e venda, normalizados', () => {
    expect(parsePlanPatch({ name: '  Gestão   Pro ', description: '  ', monthlyPrice: 149.9, annualPrice: 1490, highlight: true, active: false, features: { api_access: true } })).toEqual({
      ok: true,
      patch: { name: 'Gestão Pro', description: null, monthlyPrice: 149.9, annualPrice: 1490, highlight: true, active: false, features: { api_access: true } },
    })
    expect(parsePlanPatch({ description: null })).toEqual({ ok: true, patch: { description: null } })
  })

  test('recusa limites, código, campos desconhecidos e valores inválidos', () => {
    for (const body of [
      { maxAgents: 99 },
      { code: 'novo' },
      { name: 'Ok', currency: 'USD' },
      { name: 'x' },
      { name: 'x'.repeat(41) },
      { name: 12 },
      { description: 'x'.repeat(201) },
      { monthlyPrice: 0 },
      { monthlyPrice: -1 },
      { monthlyPrice: '149' },
      { monthlyPrice: 149.999 },
      { annualPrice: 100_001 },
      { features: { recurso_inventado: true } },
      { features: { api_access: 'sim' } },
      { features: [] },
      { active: 'true' },
      {},
      null,
      [],
    ]) {
      expect(parsePlanPatch(body).ok, JSON.stringify(body)).toBe(false)
    }
    expect(parsePlanPatch({ maxAgents: 99 })).toEqual({ ok: false, error: 'Campo não editável aqui: maxAgents' })
    expect(parsePlanPatch({})).toEqual({ ok: false, error: 'Nada para alterar' })
  })

  test('os destaques editáveis são as chaves usadas nos planos do código', () => {
    const keys = PLAN_FEATURES.map(([k]) => k).sort()
    for (const p of plans) expect(Object.keys(JSON.parse(p.features) as object).sort(), p.code).toEqual(keys)
  })
})

test.describe('V7 · sync do catálogo no deploy', () => {
  const gestao = plans.find((p) => p.code === 'gestao')!
  test('valor antigo do código é atualizado para o atual', () => {
    expect(catalogSyncPatch('gestao', { name: PREVIOUS_CATALOG.gestao.names[0], description: PREVIOUS_CATALOG.gestao.descriptions[0] }, gestao)).toEqual({
      name: gestao.name,
      description: gestao.description,
    })
  })
  test('valor editado no Admin fica como está', () => {
    expect(catalogSyncPatch('gestao', { name: 'Gestão Plus', description: 'Texto do operador' }, gestao)).toBeNull()
    // só a descrição ainda é a antiga: troca a descrição e mantém o nome editado
    expect(catalogSyncPatch('gestao', { name: 'Gestão Plus', description: PREVIOUS_CATALOG.gestao.descriptions[0] }, gestao)).toEqual({ description: gestao.description })
    // descrição apagada no Admin (null) não volta
    expect(catalogSyncPatch('gestao', { name: gestao.name, description: null }, gestao)).toBeNull()
  })
  test('já igual ao código, ou plano que o código não conhece: nada a fazer', () => {
    expect(catalogSyncPatch('gestao', { name: gestao.name, description: gestao.description }, gestao)).toBeNull()
    expect(catalogSyncPatch('plano_criado_no_admin', { name: 'A', description: 'B' }, { name: 'C', description: 'D' })).toBeNull()
  })
  test('todo plano do código tem histórico de valores antigos registrado', () => {
    for (const p of plans) expect(PREVIOUS_CATALOG[p.code], p.code).toBeDefined()
  })
})
