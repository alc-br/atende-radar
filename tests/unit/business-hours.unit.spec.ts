import { test, expect } from '@playwright/test'
import { businessMinutesBetween, isOpenAt, parseHolidays, scheduleFrom, DEFAULT_BUSINESS_HOURS, type Schedule } from '../../src/lib/analysis/business-hours'

// P2 · Horário comercial: o tempo de espera só conta enquanto a empresa deveria estar atendendo.
// Datas em São Paulo (GMT-3, sem horário de verão). 01/09/2026 é terça-feira; 05/09 sábado; 07/09 segunda (Independência).
const SP = 'America/Sao_Paulo'
const at = (iso: string) => new Date(`${iso}-03:00`)

const weekdays: Schedule = scheduleFrom({ businessHours: DEFAULT_BUSINESS_HOURS, toleranceBefore: '0', toleranceAfter: '0' }, SP)!

test.describe('P2 · minutos em horário comercial', () => {
  test('sem configuração salva → usa o padrão da tela (seg–sex 08:00–18:00), nunca 24 h', () => {
    const s = scheduleFrom({}, SP)!
    expect(s.days['1']).toEqual({ open: '08:00', close: '18:00', enabled: true })
    expect(s.days['0'].enabled).toBe(false)
  })

  test('dentro do expediente conta tempo corrido', () => {
    expect(businessMinutesBetween(at('2026-09-01T10:00:00'), at('2026-09-01T10:45:00'), weekdays)).toBe(45)
  })

  test('mensagem à noite: só começa a contar às 08:00 do dia seguinte', () => {
    // 22:00 de terça → 08:30 de quarta = 30 min
    expect(businessMinutesBetween(at('2026-09-01T22:00:00'), at('2026-09-02T08:30:00'), weekdays)).toBe(30)
  })

  test('atravessa o fim do expediente: para às 18:00 e volta às 08:00', () => {
    // 17:30 terça → 08:15 quarta = 30 + 15
    expect(businessMinutesBetween(at('2026-09-01T17:30:00'), at('2026-09-02T08:15:00'), weekdays)).toBe(45)
  })

  test('fim de semana não conta nada', () => {
    expect(businessMinutesBetween(at('2026-09-05T09:00:00'), at('2026-09-06T20:00:00'), weekdays)).toBe(0)
    // sexta 17:00 → segunda 09:00 = 60 (sexta) + 60 (segunda)
    expect(businessMinutesBetween(at('2026-09-04T17:00:00'), at('2026-09-07T09:00:00'), weekdays)).toBe(120)
  })

  test('feriado cadastrado (DD/MM/AAAA - descrição) não conta', () => {
    const s: Schedule = { ...weekdays, holidays: parseHolidays('07/09/2026 - Independência\nlinha inválida\n12/10/2026') }
    expect(s.holidays.has('2026-09-07')).toBe(true)
    expect(s.holidays.has('2026-10-12')).toBe(true)
    // sexta 17:00 → terça 08:30 = 60 (sexta) + 0 (feriado segunda) + 30
    expect(businessMinutesBetween(at('2026-09-04T17:00:00'), at('2026-09-08T08:30:00'), s)).toBe(90)
  })

  test('tolerância antes/depois alarga a janela', () => {
    const s = scheduleFrom({ businessHours: DEFAULT_BUSINESS_HOURS, toleranceBefore: '10', toleranceAfter: '30' }, SP)!
    // janela efetiva 07:50–18:30: 07:40 → 08:00 = 10; 18:00 → 19:00 = 30
    expect(businessMinutesBetween(at('2026-09-01T07:40:00'), at('2026-09-01T08:00:00'), s)).toBe(10)
    expect(businessMinutesBetween(at('2026-09-01T18:00:00'), at('2026-09-01T19:00:00'), s)).toBe(30)
  })

  test('fuso horário da empresa é respeitado', () => {
    // 09:00 em Manaus (GMT-4) = 10:00 em São Paulo. Em Manaus, 07:30–08:30 local = 30 min úteis.
    const manaus = scheduleFrom({ businessHours: DEFAULT_BUSINESS_HOURS, toleranceBefore: '0', toleranceAfter: '0' }, 'America/Manaus')!
    expect(businessMinutesBetween(new Date('2026-09-01T07:30:00-04:00'), new Date('2026-09-01T08:30:00-04:00'), manaus)).toBe(30)
    expect(businessMinutesBetween(new Date('2026-09-01T07:30:00-04:00'), new Date('2026-09-01T08:30:00-04:00'), weekdays)).toBe(60)
  })

  test('isOpenAt', () => {
    expect(isOpenAt(at('2026-09-01T12:00:00'), weekdays)).toBe(true)
    expect(isOpenAt(at('2026-09-01T19:00:00'), weekdays)).toBe(false)
    expect(isOpenAt(at('2026-09-06T12:00:00'), weekdays)).toBe(false)
  })

  test('intervalo invertido ou igual → 0; nunca negativo', () => {
    expect(businessMinutesBetween(at('2026-09-01T12:00:00'), at('2026-09-01T11:00:00'), weekdays)).toBe(0)
    expect(businessMinutesBetween(at('2026-09-01T12:00:00'), at('2026-09-01T12:00:00'), weekdays)).toBe(0)
  })

  test('semana inteira 24 h (todos os dias 00:00–23:59) ≈ tempo corrido', () => {
    const all = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, { open: '00:00', close: '23:59', enabled: true }]))
    const s = scheduleFrom({ businessHours: all, toleranceBefore: '0', toleranceAfter: '1' }, SP)!
    expect(businessMinutesBetween(at('2026-09-01T12:00:00'), at('2026-09-03T12:00:00'), s)).toBe(2880)
  })
})
