import { test, expect } from '@playwright/test'
import { classifyMessages } from '../../src/lib/analysis/classify'
import { extractPromise } from '../../src/lib/analysis/promises'
import { attributeAgent } from '../../src/lib/analysis/agents'
import { scoreConversation } from '../../src/lib/analysis/score'
import { estimateOpportunity } from '../../src/lib/analysis/opportunity'

// B6 · Regras de análise (funções puras). Português de atendimento real, com acentos, gírias e erros de digitação.
const inbound = (...texts: string[]) => texts.map((text, i) => ({ direction: 'inbound' as const, text, occurredAt: new Date(2026, 8, 1, 10, i) }))

test.describe('classificação de intenção', () => {
  const CASES: Array<[string, string]> = [
    ['Oi, quanto custa a limpeza?', 'preco'],
    ['qual o valor do clareamento', 'preco'],
    ['Pode me passar um orçamento?', 'preco'],
    ['Tem desconto pagando no pix?', 'preco'],
    ['Quero agendar uma consulta para amanhã', 'agendamento'],
    ['queria marcar um horário', 'agendamento'],
    ['Preciso remarcar minha consulta', 'agendamento'],
    ['Tem horário disponível hoje?', 'disponibilidade'],
    ['Vocês tem vaga na quinta?', 'disponibilidade'],
    ['Quero fechar o tratamento, como pago?', 'compra'],
    ['Pode mandar o link, vou levar', 'compra'],
    ['Quero cancelar meu plano', 'cancelamento'],
    ['vou desmarcar, não vou mais fazer', 'cancelamento'],
    ['Absurdo! Ninguém me responde faz dois dias', 'reclamacao'],
    ['Péssimo atendimento, não gostei', 'reclamacao'],
    ['Deu um problema no meu pedido, não funciona', 'suporte'],
    ['Tenho uma dúvida sobre o retorno', 'suporte'],
    ['Onde fica a clínica? Qual o endereço?', 'consulta'],
    ['Bom dia', ''],
  ]
  for (const [text, intent] of CASES) {
    test(`"${text}" → ${intent || 'sem intenção'}`, () => {
      const c = classifyMessages(inbound(text))
      expect(c.intent ?? '').toBe(intent)
    })
  }

  test('acentos e maiúsculas não atrapalham', () => {
    expect(classifyMessages(inbound('QUANTO CUSTA O CLAREAMENTO?')).intent).toBe('preco')
    expect(classifyMessages(inbound('orcamento por favor')).intent).toBe('preco')
  })

  test('mensagens da própria empresa não definem a intenção do cliente', () => {
    const c = classifyMessages([
      { direction: 'outbound', text: 'O valor é R$ 150, quer agendar?', occurredAt: new Date() },
      ...inbound('Ok, obrigado'),
    ])
    expect(c.intent).toBeNull()
  })

  test('a intenção mais forte vence (cancelar > preço)', () => {
    expect(classifyMessages(inbound('quanto custa? quero cancelar tudo')).intent).toBe('cancelamento')
  })
})

test.describe('sentimento e urgência', () => {
  test('cliente irritado', () => {
    expect(classifyMessages(inbound('Ninguém responde!!! Que absurdo')).sentiment).toBe('frustrated')
    expect(classifyMessages(inbound('ESTOU ESPERANDO HÁ HORAS')).sentiment).toBe('frustrated')
  })
  test('cliente satisfeito', () => {
    expect(classifyMessages(inbound('Perfeito, muito obrigada! Adorei')).sentiment).toBe('positive')
  })
  test('cliente confuso', () => {
    expect(classifyMessages(inbound('não entendi, como assim?')).sentiment).toBe('confused')
  })
  test('neutro por padrão', () => {
    expect(classifyMessages(inbound('bom dia, tudo bem?')).sentiment).toBe('neutral')
  })
  test('urgência', () => {
    expect(classifyMessages(inbound('É urgente, estou com dor forte')).urgency).toBe('critical')
    expect(classifyMessages(inbound('preciso para hoje')).urgency).toBe('high')
    expect(classifyMessages(inbound('sem pressa, semana que vem')).urgency).toBe('low')
    expect(classifyMessages(inbound('quanto custa?')).urgency).toBe('normal')
  })
  test('etapa do funil acompanha a intenção e a confiança é declarada como heurística', () => {
    const c = classifyMessages(inbound('quanto custa?'))
    expect(c.stage).toBe('price')
    expect(c.source).toBe('heuristic')
    expect(c.confidence).toBeGreaterThan(0)
    expect(c.confidence).toBeLessThanOrEqual(0.8)
    expect(classifyMessages(inbound('bom dia')).confidence).toBeLessThan(c.confidence)
  })
})

test.describe('promessas da empresa', () => {
  const now = new Date('2026-09-01T13:00:00-03:00')
  test('promessa com prazo em horas', () => {
    const p = extractPromise('Já te retorno em 2 horas com o valor', now)!
    expect(p.dueAt.getTime() - now.getTime()).toBe(2 * 3600000)
  })
  test('promessa "hoje" vence no fim do dia; "amanhã" no fim do dia seguinte', () => {
    const hoje = extractPromise('Vou verificar e te aviso hoje', now)!
    expect(hoje.dueAt.getDate()).toBe(now.getDate())
    const amanha = extractPromise('Amanhã te envio o orçamento', now)!
    expect(amanha.dueAt.getDate()).toBe(now.getDate() + 1)
  })
  test('promessa sem prazo assume 24 horas', () => {
    const p = extractPromise('Vou confirmar com a doutora e te retorno', now)!
    expect(p.dueAt.getTime() - now.getTime()).toBe(24 * 3600000)
    expect(p.action.length).toBeGreaterThan(3)
  })
  test('mensagem comum não é promessa', () => {
    expect(extractPromise('Bom dia! Como posso ajudar?', now)).toBeNull()
    expect(extractPromise('O valor é R$ 150', now)).toBeNull()
  })
})

test.describe('atribuição do atendente pela assinatura', () => {
  const agents = [
    { id: 'a1', name: 'Ana Silva' },
    { id: 'a2', name: 'Carlos Mendes' },
    { id: 'a3', name: 'Ana Costa' },
  ]
  test('"*Carlos*: texto" e "Carlos: texto" e assinatura no fim', () => {
    expect(attributeAgent('*Carlos*: olá, tudo bem?', agents)).toBe('a2')
    expect(attributeAgent('Carlos Mendes: posso ajudar', agents)).toBe('a2')
    expect(attributeAgent('Segue o orçamento.\n— Carlos', agents)).toBe('a2')
    expect(attributeAgent('Segue o orçamento.\nAtt, Ana Silva', agents)).toBe('a1')
  })
  test('primeiro nome ambíguo não atribui ninguém; nome completo resolve', () => {
    expect(attributeAgent('Ana: olá!', agents)).toBeNull()
    expect(attributeAgent('Ana Costa: olá!', agents)).toBe('a3')
  })
  test('sem assinatura → ninguém', () => {
    expect(attributeAgent('olá, tudo bem?', agents)).toBeNull()
  })
})

test.describe('nota da conversa (0–100, 5 dimensões)', () => {
  const base = { firstResponseMinutes: 3, waitingMinutes: 0, hasOpportunity: false, sentiment: 'neutral', messages: 6, unansweredPromises: 0, recovered: false }
  test('atendimento rápido e sem pendência → nota alta', () => {
    const s = scoreConversation(base)
    expect(s.total).toBeGreaterThanOrEqual(85)
    expect(Object.keys(s.components).sort()).toEqual(['oportunidades', 'pendencias', 'qualidade', 'recuperacao', 'velocidade'])
  })
  test('demora na primeira resposta derruba a velocidade', () => {
    expect(scoreConversation({ ...base, firstResponseMinutes: 200 }).components.velocidade).toBeLessThan(30)
  })
  test('cliente esperando há horas → nota baixa', () => {
    expect(scoreConversation({ ...base, firstResponseMinutes: null, waitingMinutes: 300 }).total).toBeLessThan(50)
  })
  test('cliente frustrado e promessa não cumprida pesam', () => {
    const ruim = scoreConversation({ ...base, sentiment: 'frustrated', unansweredPromises: 1 })
    expect(ruim.total).toBeLessThan(scoreConversation(base).total - 15)
  })
  test('poucas mensagens → não elegível para a média', () => {
    expect(scoreConversation({ ...base, messages: 1 }).eligible).toBe(false)
    expect(scoreConversation(base).eligible).toBe(true)
  })
  test('P2 · a faixa de nota é relativa ao SLA da empresa', () => {
    const demora25 = { ...base, firstResponseMinutes: 25 }
    expect(scoreConversation({ ...demora25, slaFirstMinutes: 60 }).components.velocidade).toBe(100) // dentro de metade do SLA
    expect(scoreConversation({ ...demora25, slaFirstMinutes: 10 }).components.velocidade).toBe(40) // 2,5× o SLA
    expect(scoreConversation(demora25).components.velocidade).toBe(scoreConversation({ ...demora25, slaFirstMinutes: 10 }).components.velocidade) // padrão = 10 min
    const espera45 = { ...base, hasOpportunity: true, waitingMinutes: 45 }
    expect(scoreConversation({ ...espera45, slaContinuityMinutes: 120 }).components.oportunidades).toBe(100)
    expect(scoreConversation({ ...espera45, slaContinuityMinutes: 15 }).components.oportunidades).toBe(20)
  })
  test('sempre entre 0 e 100', () => {
    const pior = scoreConversation({ firstResponseMinutes: null, waitingMinutes: 99999, hasOpportunity: true, sentiment: 'frustrated', messages: 9, unansweredPromises: 5, recovered: false })
    expect(pior.total).toBeGreaterThanOrEqual(0)
    expect(pior.total).toBeLessThanOrEqual(100)
  })
})

test.describe('valor da oportunidade', () => {
  test('usa o ticket médio da organização e é uma estimativa com faixa', () => {
    const o = estimateOpportunity('preco', 1000, 0.18)
    expect(o).not.toBeNull()
    expect(o!.expectedValue).toBeGreaterThan(0)
    expect(o!.rangeLow).toBeLessThan(o!.expectedValue)
    expect(o!.rangeHigh).toBeGreaterThan(o!.expectedValue)
    expect(o!.baseTicket).toBe(1000)
  })
  test('quem quer comprar vale mais que quem só perguntou o preço', () => {
    expect(estimateOpportunity('compra', 1000, 0.18)!.expectedValue).toBeGreaterThan(estimateOpportunity('preco', 1000, 0.18)!.expectedValue)
  })
  test('suporte/reclamação/cancelamento não são oportunidade de venda', () => {
    for (const i of ['suporte', 'reclamacao', 'cancelamento', 'pos_venda', null]) expect(estimateOpportunity(i, 1000, 0.18)).toBeNull()
  })
})
