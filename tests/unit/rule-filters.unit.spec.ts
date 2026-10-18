import { test, expect } from '@playwright/test'
import { conversationTeamIds, exemptByTags, groupAutoClose, inRuleWindow, inTeamScope, parseRuleWindow, ruleWindowError } from '../../src/lib/analysis/rule-filters'

// Filtros por regra de alerta (funções puras). Horários em São Paulo (−03:00, sem horário de verão).
const SP = 'America/Sao_Paulo'
const at = (iso: string) => new Date(`${iso}-03:00`)
// 2026-10-12 é segunda-feira

test.describe('dias e horários da regra', () => {
  test('validação', () => {
    expect(ruleWindowError(undefined)).toBeNull()
    expect(ruleWindowError({})).toBeNull()
    expect(ruleWindowError({ days: [1, 2], start: '08:00', end: '18:00' })).toBeNull()
    expect(ruleWindowError({ days: [0], start: '22:00', end: '06:00' })).toBeNull()
    expect(ruleWindowError([])).toBe('Dias e horários inválidos.')
    expect(ruleWindowError('seg')).toBe('Dias e horários inválidos.')
    expect(ruleWindowError({ days: [], start: '08:00', end: '18:00' })).toBe('Escolha pelo menos um dia da semana.')
    expect(ruleWindowError({ days: [7], start: '08:00', end: '18:00' })).toBe('Escolha pelo menos um dia da semana.')
    expect(ruleWindowError({ days: [1, 1], start: '08:00', end: '18:00' })).toBe('Escolha pelo menos um dia da semana.')
    expect(ruleWindowError({ days: [1.5], start: '08:00', end: '18:00' })).toBe('Escolha pelo menos um dia da semana.')
    expect(ruleWindowError({ days: [1], start: '8:00', end: '18:00' })).toMatch(/HH:MM/)
    expect(ruleWindowError({ days: [1], start: '08:00', end: '24:00' })).toMatch(/HH:MM/)
    expect(ruleWindowError({ days: [1], start: '08:60', end: '18:00' })).toMatch(/HH:MM/)
    expect(ruleWindowError({ days: [1], start: '08:00' })).toMatch(/HH:MM/)
    expect(ruleWindowError({ days: [1], start: '08:00', end: '08:00' })).toMatch(/não podem ser iguais/)
  })

  test('JSON gravado: vazio, quebrado ou inválido = vale sempre', () => {
    expect(parseRuleWindow('{}')).toBeNull()
    expect(parseRuleWindow('')).toBeNull()
    expect(parseRuleWindow(null)).toBeNull()
    expect(parseRuleWindow('{quebrado')).toBeNull()
    expect(parseRuleWindow('{"days":[9],"start":"08:00","end":"18:00"}')).toBeNull()
    expect(parseRuleWindow('{"days":[1],"start":"08:00","end":"18:00"}')).toEqual({ days: [1], start: '08:00', end: '18:00' })
    expect(inRuleWindow(null, at('2026-10-12T03:00:00'), SP)).toBe(true)
  })

  test('janela no mesmo dia: início conta, fim não', () => {
    const w = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
    expect(inRuleWindow(w, at('2026-10-12T08:59:00'), SP)).toBe(false)
    expect(inRuleWindow(w, at('2026-10-12T09:00:00'), SP)).toBe(true)
    expect(inRuleWindow(w, at('2026-10-12T17:59:00'), SP)).toBe(true)
    expect(inRuleWindow(w, at('2026-10-12T18:00:00'), SP)).toBe(false)
    expect(inRuleWindow(w, at('2026-10-17T10:00:00'), SP)).toBe(false) // sábado
    expect(inRuleWindow(w, at('2026-10-18T10:00:00'), SP)).toBe(false) // domingo
    expect(inRuleWindow(w, at('2026-10-16T10:00:00'), SP)).toBe(true) // sexta
  })

  test('janela que passa da meia-noite pertence ao dia em que começa', () => {
    const sexta = { days: [5], start: '22:00', end: '06:00' }
    expect(inRuleWindow(sexta, at('2026-10-16T21:59:00'), SP)).toBe(false)
    expect(inRuleWindow(sexta, at('2026-10-16T22:00:00'), SP)).toBe(true)
    expect(inRuleWindow(sexta, at('2026-10-17T03:00:00'), SP)).toBe(true) // sábado de madrugada
    expect(inRuleWindow(sexta, at('2026-10-17T06:00:00'), SP)).toBe(false)
    expect(inRuleWindow(sexta, at('2026-10-17T22:30:00'), SP)).toBe(false) // sábado à noite não
    expect(inRuleWindow(sexta, at('2026-10-16T03:00:00'), SP)).toBe(false) // sexta de madrugada é a janela de quinta
    const domingo = { days: [0], start: '22:00', end: '06:00' }
    expect(inRuleWindow(domingo, at('2026-10-19T05:59:00'), SP)).toBe(true) // segunda de madrugada
  })

  test('fuso da empresa', () => {
    const w = { days: [1], start: '09:00', end: '10:00' }
    // 09:30 em São Paulo = 12:30 UTC = 13:30 em Lisboa (horário de verão até 25/10)
    expect(inRuleWindow(w, at('2026-10-12T09:30:00'), SP)).toBe(true)
    expect(inRuleWindow(w, at('2026-10-12T09:30:00'), 'Europe/Lisbon')).toBe(false)
  })
})

test.describe('exceções por etiqueta', () => {
  test('sem diferença de maiúsculas, acentos e espaços', () => {
    expect(exemptByTags(['cliente vip'], ['Cliente VIP'])).toBe(true)
    expect(exemptByTags(['Cliente VÍP '], ['cliente vip'])).toBe(true)
    expect(exemptByTags(['Atacado'], ['Cliente VIP', 'atacado'])).toBe(true)
    expect(exemptByTags(['vip-2'], ['vip'])).toBe(false) // etiqueta inteira, não pedaço
    expect(exemptByTags([], ['vip'])).toBe(false)
    expect(exemptByTags(['vip'], [])).toBe(false)
  })
})

test.describe('equipe da conversa', () => {
  const teams = [
    { id: 't-vendas', name: 'Vendas', connectionIds: ['c1'] },
    { id: 't-suporte', name: 'Suporte', connectionIds: ['c2'] },
    { id: 't-plantao', name: 'Plantão', connectionIds: ['c2'] },
  ]
  test('atendente com equipe manda; sem atendente vale o número', () => {
    expect(conversationTeamIds('Suporte', 'c1', teams)).toEqual(['t-suporte'])
    expect(conversationTeamIds(' suporte ', 'c1', teams)).toEqual(['t-suporte'])
    expect(conversationTeamIds(null, 'c1', teams)).toEqual(['t-vendas'])
    expect(conversationTeamIds('', 'c2', teams)).toEqual(['t-suporte', 't-plantao'])
    // equipe do atendente que não existe mais em Equipes: cai para o número
    expect(conversationTeamIds('Equipe antiga', 'c1', teams)).toEqual(['t-vendas'])
    expect(conversationTeamIds(null, null, teams)).toEqual([])
    expect(conversationTeamIds(null, 'c9', teams)).toEqual([])
  })
  test('regra por equipe (id ou nome)', () => {
    expect(inTeamScope([], [], teams)).toBe(true)
    expect(inTeamScope(['t-vendas'], ['t-vendas'], teams)).toBe(true)
    expect(inTeamScope(['t-vendas'], ['t-suporte'], teams)).toBe(false)
    expect(inTeamScope(['t-vendas'], [], teams)).toBe(false)
    expect(inTeamScope(['plantao'], ['t-plantao'], teams)).toBe(true)
    expect(inTeamScope(['t-apagada'], ['t-vendas'], teams)).toBe(false)
  })
})

test.describe('encerrar sozinho no alerta agrupado', () => {
  test('só quando todas as regras pedem; vale o maior prazo', () => {
    expect(groupAutoClose([])).toBeNull()
    expect(groupAutoClose([{ autoCloseMinutes: 30 }])).toBe(30)
    expect(groupAutoClose([{ autoCloseMinutes: 30 }, { autoCloseMinutes: 90 }])).toBe(90)
    expect(groupAutoClose([{ autoCloseMinutes: 30 }, { autoCloseMinutes: null }])).toBeNull()
    expect(groupAutoClose([{ autoCloseMinutes: 0 }])).toBeNull()
  })
})
