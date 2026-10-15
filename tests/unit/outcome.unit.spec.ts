import { test, expect } from '@playwright/test'
import { detectOutcome, OUTCOME_REASON } from '../../src/lib/analysis/outcome'
import { alertGroupKey, groupHeadline } from '../../src/lib/analysis/alert-groups'

// B6 · Venda/perda pelas mensagens (precisão acima de cobertura) e agrupamento de alertas (funções puras).
type Msg = [dir: 'in' | 'out', text: string]
const conv = (...msgs: Msg[]) => msgs.map(([d, text], i) => ({ direction: d === 'in' ? ('inbound' as const) : ('outbound' as const), text, occurredAt: new Date(2026, 8, 1, 10, i) }))
const outcomeOf = (...msgs: Msg[]) => detectOutcome(conv(...msgs))?.outcome ?? null

test.describe('resultado automático: venda fechada', () => {
  const WON: Msg[][] = [
    [['in', 'Quanto fica o clareamento?'], ['out', 'Fica R$ 800'], ['in', 'Fechado, fiz o pix agora']],
    [['in', 'Quero o tênis 42'], ['out', 'Segue a chave pix'], ['in', 'Pronto, já paguei']],
    [['in', 'Segue o comprovante']],
    [['in', 'pix feito!']],
    [['in', 'Quero agendar'], ['out', 'Recebemos o pagamento, obrigado!']],
    [['in', 'Quero agendar'], ['out', 'Sua consulta está confirmada para quinta às 14h']],
    [['in', 'Quero marcar'], ['out', 'Posso agendar para amanhã às 10h?'], ['in', 'Pode confirmar']],
    [['in', 'Quero comprar'], ['out', 'Seu pedido foi confirmado e sai hoje']],
  ]
  for (const msgs of WON) {
    test(`venda: "${msgs[msgs.length - 1][1]}"`, () => expect(outcomeOf(...msgs)).toBe('won'))
  }

  test('o motivo diz quem confirmou', () => {
    expect(detectOutcome(conv(['in', 'paguei']))?.reason).toBe(OUTCOME_REASON.paid)
    expect(detectOutcome(conv(['in', 'oi'], ['out', 'Pagamento confirmado!']))?.reason).toBe(OUTCOME_REASON.companyConfirmed)
  })
})

test.describe('resultado automático: perda declarada', () => {
  const LOST: Msg[][] = [
    [['in', 'Quanto custa?'], ['out', 'R$ 500'], ['in', 'Obrigado, mas já comprei em outro lugar']],
    [['in', 'Já fechei com outra clínica, obrigado']],
    [['in', 'Desisti, obrigado pela atenção']],
    [['in', 'Perdi o interesse, pode cancelar']],
    [['in', 'Não vou mais precisar, obrigada']],
  ]
  for (const msgs of LOST) {
    test(`perda: "${msgs[msgs.length - 1][1]}"`, () => expect(outcomeOf(...msgs)).toBe('lost'))
  }
})

test.describe('resultado automático: na dúvida não decide', () => {
  const NONE: Msg[][] = [
    [['in', 'Quanto custa o clareamento?']],
    [['in', 'Posso pagar no pix?']], // pergunta
    [['in', 'Ainda não paguei, pode mandar a chave?']], // negação
    [['in', 'Se eu fizer o pix hoje sai amanhã?']], // condição + pergunta
    [['in', 'Vou fazer o pix amanhã']], // futuro
    [['in', 'Da última vez paguei 200, quanto está agora']], // compra antiga
    [['in', 'Se eu não gostar compro em outro lugar']], // condição
    [['in', 'Já fechei com outra, vocês fazem manutenção?']], // perda com pergunta: fica para o humano
    [['in', 'Desisti do horário de terça, tem quinta?']], // remarcar não é desistir
    [['in', 'Quase desisti, mas quero sim']],
    [['in', 'Desisti'], ['in', 'Na verdade mudei de ideia, quero fechar']], // voltou a querer
    [['in', 'Paguei'], ['in', 'Desisti, quero o dinheiro de volta']], // sinais opostos
    [['in', 'Quero agendar'], ['out', 'Posso agendar para amanhã?'], ['in', 'Ok, mas qual o endereço? Preciso ver se consigo chegar a tempo do trabalho']],
    [['in', 'Não quero mais esperar, cadê a resposta']], // irritação, não perda
  ]
  for (const msgs of NONE) {
    test(`sem decisão: "${msgs.map((m) => m[1]).join(' / ')}"`, () => expect(outcomeOf(...msgs)).toBeNull())
  }
})

test.describe('agrupamento de alertas', () => {
  const rule = (id: string, type: string, severity: string, channels: string[] = ['in_app'], name = type) => ({ id, name, type, severity, notificationChannels: JSON.stringify(channels) })

  test('regras da mesma causa caem no mesmo grupo; regra sem grupo agrupa só com ela mesma', () => {
    expect(alertGroupKey(rule('1', 'no_response', 'critical'), 'c1')).toBe(alertGroupKey(rule('2', 'pending_quote', 'high'), 'c1'))
    expect(alertGroupKey(rule('1', 'no_response', 'critical'), 'c1')).not.toBe(alertGroupKey(rule('1', 'no_response', 'critical'), 'c2'))
    expect(alertGroupKey(rule('3', 'promise_overdue', 'high'), 'c1')).toBe(alertGroupKey(rule('4', 'promise_approaching', 'medium'), 'c1'))
    expect(alertGroupKey(rule('5', 'customer_frustrated', 'high'), 'c1')).not.toBe(alertGroupKey(rule('1', 'no_response', 'critical'), 'c1'))
    expect(alertGroupKey(rule('6', 'custom', 'low'), 'c1')).not.toBe(alertGroupKey(rule('7', 'custom', 'low'), 'c1'))
  })

  test('título = regra mais específica; gravidade = a maior; canais = a união', () => {
    const top = groupHeadline([rule('1', 'no_response', 'critical', ['in_app']), rule('2', 'pending_quote', 'high', ['email'])])!
    expect(top.headline.type).toBe('pending_quote')
    expect(top.severity).toBe('critical')
    expect(top.channels.sort()).toEqual(['email', 'in_app'])
    expect(groupHeadline([rule('1', 'promise_approaching', 'medium'), rule('2', 'promise_overdue', 'high')])!.headline.type).toBe('promise_overdue')
    expect(groupHeadline([])).toBeNull()
  })
})
