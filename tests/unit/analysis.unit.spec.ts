import { test, expect } from '@playwright/test'
import { classifyMessages } from '../../src/lib/analysis/classify'
import { extractPromise } from '../../src/lib/analysis/promises'
import { attributeAgent, decideAgent, deviceFromMessageId, extractSignature, identityKeysOf, resolveAttribution, suggestAgent } from '../../src/lib/analysis/agents'
import { scoreConversation } from '../../src/lib/analysis/score'
import { estimateOpportunity, opportunityBreakdown, revenueSettings } from '../../src/lib/analysis/opportunity'
import { normChat } from '../../src/lib/analysis/text'

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
    ['Tem horário disponível hoje?', 'agendamento'], // pedir horário = querer marcar (alta intenção)
    ['Vocês tem vaga na quinta?', 'agendamento'],
    ['Ainda tem o tênis 42 disponível?', 'disponibilidade'],
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
    for (const t of ['já é a terceira vez que peço', 'faz 2 meses que espero', 'ninguém me atende', 'que demora!', 'estou esperando desde ontem e nada',
      'vcs n atendem o telefone?', 'já pedi isso 3 vezes', 'alguém pode me responder?', 'faz 3 dias que mandei mensagem e nada']) {
      expect(classifyMessages(inbound(t)).sentiment, t).toBe('frustrated')
    }
  })
  test('pergunta educada com pedaço de queixa não é cliente irritado', () => {
    for (const t of ['Quanto tempo que demora pra chegar?', 'Vocês podem me atender sábado?', 'Vocês não atendem aos sábados?',
      'Estou com dor de dente desde ontem', 'É a segunda vez que compro com vocês', 'Já pedi pelo site, como acompanho?', 'Comprei há 2 meses']) {
      expect(classifyMessages(inbound(t)).sentiment, t).not.toBe('frustrated')
    }
  })
  test('candidato a emprego não é agendamento; abreviações ambíguas não viram outra palavra', () => {
    expect(classifyMessages(inbound('Tem vaga para auxiliar administrativo?')).intent).not.toBe('agendamento')
    expect(classifyMessages(inbound('Tem vaga para amanhã às 10h?')).intent).toBe('agendamento')
    expect(classifyMessages(inbound('qto custa?')).intent).toBe('preco')
    expect(classifyMessages(inbound('o qto tem ar condicionado?')).intent).toBeNull()
    expect(normChat('num instante')).toBe('num instante')
    expect(normChat('num sei')).toBe('nao sei')
    expect(normChat('plano Pro')).toBe('plano pro')
    expect(normChat('vou pro centro')).toBe('vou para o centro')
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
    expect(extractPromise('Segue o endereço, te envio o mapa aqui embaixo', now)).toBeNull()
  })
  test('"segue" como verbo continuar não anula a promessa', () => {
    expect(extractPromise('Vou verificar se ainda segue em estoque e te aviso', now)).not.toBeNull()
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
  test('"Rótulo: valor" não é assinatura de gente', () => {
    expect(extractSignature('Pix: 123.456.789-00')).toBeNull()
    expect(extractSignature('Obs: chegar 10 min antes')).toBeNull()
    expect(extractSignature('Endereço - Rua das Flores, 100')).toBeNull()
    expect(extractSignature('*Carlos*: olá')).toBe('Carlos')
  })
})

test.describe('P5 · identidades do WhatsApp', () => {
  const agents = [
    { id: 'a1', name: 'Ana Silva' },
    { id: 'a2', name: 'Carlos Mendes' },
  ]
  const ctx = { connectionName: 'Recepção', agents }

  test('aparelho pelo formato do id da mensagem (regra do Baileys)', () => {
    expect(deviceFromMessageId('3A' + 'B'.repeat(18))).toBe('ios')
    expect(deviceFromMessageId('3E' + 'B'.repeat(20))).toBe('web')
    expect(deviceFromMessageId('A'.repeat(32))).toBe('android')
    expect(deviceFromMessageId('3F' + 'B'.repeat(20))).toBe('desktop')
    expect(deviceFromMessageId('wa-x')).toBeNull()
    expect(deviceFromMessageId(null)).toBeNull()
  })

  test('identidades de uma mensagem: só da empresa e só do WhatsApp (com id)', () => {
    const keys = identityKeysOf({ direction: 'outbound', text: '*Carlos*: oi', externalId: '3A' + 'B'.repeat(18) })
    expect(keys.map((k) => k.ref)).toEqual(['sig:carlos', 'dev:ios', 'num'])
    expect(identityKeysOf({ direction: 'inbound', text: '*Carlos*: oi', externalId: 'x' })).toEqual([])
    expect(identityKeysOf({ direction: 'outbound', text: 'oi', externalId: null })).toEqual([])
  })

  test('sugestão: nome completo > primeiro nome; poucas conversas baixam a confiança; ambíguo ou aparelho → sem sugestão', () => {
    expect(suggestAgent({ kind: 'signature', displayName: 'Carlos Mendes', conversationCount: 5 }, ctx)).toMatchObject({ agentId: 'a2', confidence: 0.9 })
    expect(suggestAgent({ kind: 'signature', displayName: 'Carlos', conversationCount: 5 }, ctx)).toMatchObject({ agentId: 'a2', confidence: 0.7 })
    expect(suggestAgent({ kind: 'signature', displayName: 'Carlos', conversationCount: 1 }, ctx)).toMatchObject({ agentId: 'a2', confidence: 0.6 })
    expect(suggestAgent({ kind: 'signature', displayName: 'Ana', conversationCount: 5 }, { ...ctx, agents: [...agents, { id: 'a3', name: 'Ana Costa' }] }).agentId).toBeNull()
    expect(suggestAgent({ kind: 'device', displayName: 'iPhone', conversationCount: 9 }, ctx).agentId).toBeNull()
    expect(suggestAgent({ kind: 'number', displayName: 'Número inteiro', conversationCount: 9 }, ctx).agentId).toBeNull()
    expect(suggestAgent({ kind: 'number', displayName: 'Número inteiro', conversationCount: 9 }, { ...ctx, connectionName: 'WhatsApp da Ana' })).toMatchObject({ agentId: 'a1', confidence: 0.5 })
    expect(suggestAgent({ kind: 'number', displayName: 'Número inteiro', conversationCount: 9 }, { ...ctx, connectionName: 'Carlos Mendes - celular' })).toMatchObject({ agentId: 'a2', confidence: 0.6 })
    expect(suggestAgent({ kind: 'device', displayName: 'iPhone', conversationCount: 9 }, { ...ctx, agents: [agents[0]] })).toMatchObject({ agentId: 'a1', confidence: 0.4 })
  })

  test('atribuição: confirmado vale mais que sugestão; assinatura > aparelho > número; ignorada não entra', () => {
    const t = (m: number) => new Date(2026, 8, 1, 10, m)
    const row = (kind: string, status: string, agentId: string | null, suggestedAgentId: string | null, m = 0) => ({ kind, associationStatus: status, agentId, suggestedAgentId, firstSeenAt: t(m) })
    expect(resolveAttribution([row('signature', 'unconfirmed', null, 'a2'), row('number', 'confirmed', 'a1', null)])).toMatchObject({ confirmed: 'a1', suggested: null })
    expect(resolveAttribution([row('number', 'confirmed', 'a1', null), row('signature', 'confirmed', 'a2', null)]).confirmed).toBe('a2')
    expect(resolveAttribution([row('number', 'unconfirmed', null, 'a1'), row('device', 'unconfirmed', null, 'a2')]).suggested).toBe('a2')
    expect(resolveAttribution([row('signature', 'ignored', null, 'a2')])).toMatchObject({ confirmed: null, suggested: null })
    expect(resolveAttribution([row('signature', 'confirmed', 'a2', null)], new Set(['a1'])).confirmed).toBeNull() // atendente inativo
  })

  test('decisão: manual nunca é desfeita; legado fora da assinatura vira manual; sem confirmado → só sugestão', () => {
    const attr = { confirmed: null, suggested: 'a2', signatureAgents: ['a2'] }
    expect(decideAgent({ agentId: 'a1', agentAttribution: 'manual' }, { ...attr, confirmed: 'a2' }, false)).toEqual({ agentId: 'a1', agentAttribution: 'manual', suggestedAgentId: null })
    expect(decideAgent({ agentId: 'a1', agentAttribution: null }, attr, false)).toEqual({ agentId: 'a1', agentAttribution: 'manual', suggestedAgentId: null })
    expect(decideAgent({ agentId: 'a2', agentAttribution: null }, attr, false)).toEqual({ agentId: null, agentAttribution: null, suggestedAgentId: 'a2' })
    expect(decideAgent({ agentId: null, agentAttribution: null }, { ...attr, confirmed: 'a2' }, false)).toEqual({ agentId: 'a2', agentAttribution: 'identity', suggestedAgentId: null })
    expect(decideAgent({ agentId: 'a2', agentAttribution: 'identity' }, attr, false)).toEqual({ agentId: null, agentAttribution: null, suggestedAgentId: 'a2' })
    expect(decideAgent({ agentId: 'a1', agentAttribution: null }, attr, true).agentAttribution).toBe('manual')
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
  test('o passo a passo ("Como calculamos") chega exatamente ao mesmo valor da estimativa', () => {
    for (const [intent, ticket, rate] of [['preco', 1500, 0.18], ['compra', 2000, 0.2], ['compra', 900, 0.5], ['consulta', 333, 0.07]] as const) {
      const b = opportunityBreakdown(intent, ticket, rate)!
      expect(b).toMatchObject({ ...estimateOpportunity(intent, ticket, rate)! })
      expect(b.expectedValue).toBe(Math.round(ticket * Math.min(0.95, b.rawProbability)))
      expect(b.rawProbability).toBeCloseTo(rate * b.intentFactor)
    }
    expect(opportunityBreakdown('compra', 900, 0.5)!.capped).toBe(true) // 0,5 × 3,3 passa de 95 %
  })
  test('Configurações: conversão aceita "20" (em %) ou 0.2; sem nada preenchido usa o padrão', () => {
    expect(revenueSettings({ avgTicket: '2000', convRate: '20' })).toEqual({ avgTicket: 2000, conversionRate: 0.2 })
    expect(revenueSettings({ convRate: 0.2 }).conversionRate).toBe(0.2)
    expect(revenueSettings({})).toEqual({ avgTicket: 1500, conversionRate: 0.18 })
  })
})
