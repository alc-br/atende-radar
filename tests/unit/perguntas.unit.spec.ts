import { test, expect } from '@playwright/test'
import { isQuestion, detectIgnoredQuestions, type QuestionMessage } from '../../src/lib/analysis/questions'
import { businessMinutesBetween, scheduleFrom } from '../../src/lib/analysis/business-hours'

// B6 · Perguntas ignoradas: o que é pergunta e quando ela estoura o SLA sem resposta.

test.describe('o que é pergunta', () => {
  const YES = [
    'Quanto custa a limpeza?',
    'vcs aceitam cartão?',
    'Qual o endereço',
    'Vocês atendem sábado',
    'Oi, tudo bem? Quanto custa o clareamento?',
    'tem como parcelar em 3x',
    'Dá pra ir amanhã às 10? 🙏',
    'Onde fica a clínica',
    'Como faço para pagar',
  ]
  const NO = [
    'Bom dia',
    'Oi, tudo bem?',
    'oi??',
    '?',
    'Alguém aí?',
    'Ok, obrigado!',
    'Queria agendar uma consulta',
    'Oi, tudo bem? Queria agendar',
    'Qualquer coisa te aviso',
    '',
  ]
  for (const t of YES) test(`"${t}" é pergunta`, () => expect(isQuestion(t)).toBe(true))
  for (const t of NO) test(`"${t}" não é pergunta`, () => expect(isQuestion(t)).toBe(false))
  test('mensagem sem texto (mídia, ou apagada pela retenção) não é pergunta', () => {
    expect(isQuestion(null)).toBe(false)
  })
})

test.describe('pergunta sem resposta além do SLA', () => {
  const t0 = new Date('2026-09-02T13:00:00Z') // quarta, 10:00 em São Paulo
  const at = (min: number) => new Date(t0.getTime() + min * 60000)
  const wall = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000)
  const opts = (nowMin: number, elapsed = wall) => ({ now: at(nowMin), slaFirstMinutes: 10, slaContinuityMinutes: 30, elapsed })
  const msg = (id: string, direction: 'inbound' | 'outbound', min: number, text: string): QuestionMessage => ({ id, direction, text, occurredAt: at(min) })

  test('sem resposta e dentro do SLA → nada ainda', () => {
    expect(detectIgnoredQuestions([msg('a', 'inbound', 0, 'Quanto custa?')], opts(5))).toEqual([])
  })

  test('sem resposta e além do SLA de primeira resposta → pergunta em aberto', () => {
    const r = detectIgnoredQuestions([msg('a', 'inbound', 0, 'Quanto custa?')], opts(15))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ messageId: 'a', text: 'Quanto custa?', answeredBy: null, waitedMinutes: 15 })
  })

  test('respondida dentro do SLA → não é pergunta ignorada', () => {
    const r = detectIgnoredQuestions([msg('a', 'inbound', 0, 'Quanto custa?'), msg('b', 'outbound', 5, 'R$ 200')], opts(60))
    expect(r).toEqual([])
  })

  test('respondida depois do SLA → registrada e já marcada com a resposta', () => {
    const r = detectIgnoredQuestions([msg('a', 'inbound', 0, 'Quanto custa?'), msg('b', 'outbound', 40, 'R$ 200')], opts(60))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ messageId: 'a', answeredBy: 'b', waitedMinutes: 40 })
  })

  test('no meio da conversa vale o SLA de continuidade', () => {
    const msgs = [msg('a', 'outbound', 0, 'Olá! Em que posso ajudar?'), msg('b', 'inbound', 1, 'Vocês aceitam pix?')]
    expect(detectIgnoredQuestions(msgs, opts(21))).toEqual([]) // 20 min < 30
    expect(detectIgnoredQuestions(msgs, opts(41)).map((q) => q.messageId)).toEqual(['b'])
  })

  test('mensagem que não é pergunta não entra, mesmo sem resposta', () => {
    expect(detectIgnoredQuestions([msg('a', 'inbound', 0, 'Queria agendar uma consulta')], opts(120))).toEqual([])
  })

  test('cada pergunta conta separado; a resposta da empresa vale para as anteriores a ela', () => {
    const msgs = [
      msg('a', 'inbound', 0, 'Quanto custa?'),
      msg('b', 'inbound', 2, 'Aceitam cartão?'),
      msg('c', 'outbound', 60, 'R$ 200, aceitamos sim'),
      msg('d', 'inbound', 61, 'Tem horário amanhã?'),
    ]
    const r = detectIgnoredQuestions(msgs, opts(200))
    expect(r.map((q) => [q.messageId, q.answeredBy])).toEqual([['a', 'c'], ['b', 'c'], ['d', null]])
  })

  test('horário comercial: a noite não conta como espera', () => {
    const schedule = scheduleFrom({}, 'America/Sao_Paulo') // seg–sex 08:00–18:00 (+ tolerâncias)
    const biz = (a: Date, b: Date) => businessMinutesBetween(a, b, schedule)
    // quarta 22:00 em São Paulo (01:00Z de quinta), consultado à 01:00 de quinta: zero minutos de expediente
    const night = new Date('2026-09-03T01:00:00Z')
    const msgs: QuestionMessage[] = [{ id: 'a', direction: 'inbound', text: 'Quanto custa?', occurredAt: night }]
    const now = new Date(night.getTime() + 3 * 3600000)
    expect(detectIgnoredQuestions(msgs, { now, slaFirstMinutes: 10, slaContinuityMinutes: 30, elapsed: biz })).toEqual([])
    // em tempo corrido, as mesmas 3 h estouram o SLA
    expect(detectIgnoredQuestions(msgs, { now, slaFirstMinutes: 10, slaContinuityMinutes: 30, elapsed: wall })).toHaveLength(1)
  })
})
