import { test, expect } from '@playwright/test'
import { welcomeStepsFor, TOURS } from '../../src/lib/tours'
import { canOpenView, ROLES } from '../../src/lib/permissions'

// P1 · O tour de boas-vindas é do papel de cada pessoa: só mostra o que ela pode usar e diz o que fazer primeiro.
test.describe('tour de boas-vindas por papel', () => {
  for (const role of ROLES) {
    test(`${role}: passos existem e nenhum aponta para um menu que ele não vê`, () => {
      const steps = welcomeStepsFor(role, false)
      expect(steps.length).toBeGreaterThanOrEqual(3)
      for (const s of steps) {
        expect(s.title.length).toBeGreaterThan(3)
        expect(s.body.length).toBeGreaterThan(20)
        if (s.target.startsWith('nav-')) {
          const view = s.target.slice(4)
          expect(canOpenView(role, view), `${role} não pode abrir "${view}" mas o tour aponta para ele`).toBe(true)
        }
      }
      expect(steps[steps.length - 1].target).toBe('header-help') // sempre termina dizendo onde pedir ajuda
    })
  }

  test('cada papel recebe um roteiro DIFERENTE, dito no idioma dele', () => {
    const texts = ROLES.map((r) => welcomeStepsFor(r, false).map((s) => s.title + s.body).join('|'))
    expect(new Set(texts).size).toBe(ROLES.length)
    const admin = welcomeStepsFor('admin', false).map((s) => s.title + ' ' + s.body).join(' ')
    expect(admin).toMatch(/WhatsApp/)
    expect(admin).toMatch(/equipe/i)
    const atendente = welcomeStepsFor('atendente', false).map((s) => s.title + ' ' + s.body).join(' ')
    expect(atendente).toMatch(/só o que é seu|apenas o que é seu|seus/i)
    const viewer = welcomeStepsFor('viewer', false).map((s) => s.title + ' ' + s.body).join(' ')
    expect(viewer).toMatch(/leitura/i)
  })

  test('operador da plataforma ganha os passos do painel Admin (além dos do papel dele)', () => {
    const steps = welcomeStepsFor('gestor', true)
    expect(steps.some((s) => s.target === 'nav-admin')).toBe(true)
    expect(welcomeStepsFor('gestor', false).some((s) => s.target === 'nav-admin')).toBe(false)
  })

  test('papel desconhecido cai num roteiro genérico seguro', () => {
    expect(welcomeStepsFor('inventado', false).length).toBeGreaterThanOrEqual(3)
  })

  test('os tours por tela continuam existindo', () => {
    expect(Object.keys(TOURS)).toContain('dashboard')
    expect(Object.keys(TOURS)).toContain('alerts')
  })
})
