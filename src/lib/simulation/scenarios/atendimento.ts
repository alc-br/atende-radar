import type { Scenario } from '../types'

// Cenários de atendimento: tempos de resposta, alertas, vendas e recuperação. Textos iguais aos que os testes de
// análise já usam (o classificador é por palavras: estes textos caem na intenção/sentimento esperados).

const R = {
  first: 'Cliente sem primeira resposta',
  followup: 'Cliente sem resposta após interação',
  quote: 'Pedido de preço sem retorno',
  highIntent: 'Intenção alta sem resposta',
  overdue: 'Promessa vencida',
  frustrated: 'Cliente irritado',
  connDown: 'Conexão desconectada',
}

export const ATENDIMENTO: Scenario[] = [
  {
    id: 'primeira-resposta-estourada',
    title: 'Primeira resposta estourada',
    description: 'Cliente manda "Bom dia" e ninguém responde. Aos 5 min ainda não há alerta; aos 30 min abre UM alerta crítico (e não duplica no tick seguinte).',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'ana', from: 'customer', text: 'Bom dia', name: 'Ana Simulada' },
      { kind: 'tick', at: 5, expect: [{ noAlert: R.first, chat: 'ana' }] },
      { kind: 'tick', at: 30, expect: [{ alert: R.first, chat: 'ana', status: 'new', count: 1, severity: 'critical' }] },
      { kind: 'tick', at: 31, expect: [{ alert: R.first, chat: 'ana', count: 1 }] },
    ],
    expect: [{ conversation: 'ana', status: 'waiting_company' }, { notification: 'Ana Simulada' }],
  },
  {
    id: 'resposta-resolve-alerta',
    title: 'Resposta resolve o alerta',
    description: 'Cliente espera 25 min (alerta aberto); a empresa responde e, no tick seguinte, o alerta fica resolvido.',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'bruno', from: 'customer', text: 'Oi, tem alguém?', name: 'Bruno Simulado' },
      { kind: 'tick', at: 25, expect: [{ alert: R.first, chat: 'bruno', status: 'new' }] },
      { kind: 'message', at: 26, chat: 'bruno', from: 'company', text: 'Olá! Desculpe a demora.' },
      { kind: 'tick', at: 27, expect: [{ alert: R.first, chat: 'bruno', status: 'resolved' }, { noAlert: R.first, chat: 'bruno' }] },
    ],
    expect: [{ conversation: 'bruno', status: 'waiting_customer' }, { openAlerts: 0 }],
  },
  {
    id: 'atendente-some',
    title: 'Atendente some no meio da conversa',
    description: 'O atendente (assinatura *Carlos*) responde, o cliente pergunta de novo e ninguém volta: alerta "sem resposta após interação" (não o de primeira resposta), com o atendente sugerido pela assinatura.',
    plan: 'gestao',
    agents: ['Carlos Mendes', 'Ana Souza'],
    steps: [
      { kind: 'message', at: 0, chat: 'carla', from: 'customer', text: 'Oi, tudo bem?', name: 'Carla Simulada' },
      { kind: 'message', at: 2, chat: 'carla', from: 'company', text: 'Olá! Como posso ajudar?', agent: 'Carlos' },
      { kind: 'message', at: 5, chat: 'carla', from: 'customer', text: 'Preciso trocar meu horário' },
      { kind: 'tick', at: 20, expect: [{ noAlert: R.followup, chat: 'carla' }] },
      { kind: 'tick', at: 40, expect: [{ alert: R.followup, chat: 'carla', status: 'new' }, { noAlert: R.first, chat: 'carla', anyStatus: true }] },
    ],
    expect: [{ conversation: 'carla', status: 'waiting_company', suggestedAgent: 'Carlos Mendes' }],
  },
  {
    id: 'objecao-preco',
    title: 'Pedido de preço sem retorno (objeção de preço)',
    description: 'Cliente pergunta o preço e fica sem resposta: alerta de preço, oportunidade com valor estimado (ticket R$ 2.000 × conversão 20% × fator 1,6 = R$ 640) e item na fila de recuperação.',
    plan: 'essencial',
    settings: { avgTicket: '2000', convRate: '20' },
    steps: [
      { kind: 'message', at: 0, chat: 'diego', from: 'customer', text: 'Oi, quanto custa o clareamento?', name: 'Diego Simulado' },
      { kind: 'tick', at: 10, expect: [{ noAlert: R.quote, chat: 'diego' }] },
      { kind: 'tick', at: 25, expect: [{ alert: R.quote, chat: 'diego', status: 'new' }] },
    ],
    expect: [{ conversation: 'diego', intent: 'preco', potentialValue: 640 }, { recovery: 'diego' }],
  },
  {
    id: 'venda-perdida-abandono',
    title: 'Venda perdida por abandono',
    description: 'A empresa responde o pedido de preço, mas o cliente some por mais que o "Tempo de abandono" (1 h neste cenário): conversa perdida com a etiqueta "abandono" e item de recuperação "Abandono do cliente".',
    plan: 'essencial',
    settings: { avgTicket: '2000', convRate: '20', abandonTime: '1' },
    steps: [
      { kind: 'message', at: 0, chat: 'elisa', from: 'customer', text: 'Oi, quanto custa o clareamento?', name: 'Elisa Simulada' },
      { kind: 'message', at: 3, chat: 'elisa', from: 'company', text: 'Os valores são R$ 400 no total.' },
      { kind: 'tick', at: 4, expect: [{ conversation: 'elisa', status: 'waiting_customer', closed: false }] },
      { kind: 'tick', at: 70 },
    ],
    expect: [{ conversation: 'elisa', status: 'lost', closed: true, tag: 'abandono' }, { recovery: 'elisa', reason: 'Abandono do cliente' }],
  },
  {
    id: 'intencao-alta',
    title: 'Intenção alta sem resposta',
    description: 'Cliente quer agendar e ninguém responde em 5 min: alerta crítico de intenção alta.',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'fabio', from: 'customer', text: 'Quero agendar uma consulta amanhã', name: 'Fabio Simulado' },
      { kind: 'tick', at: 3, expect: [{ noAlert: R.highIntent, chat: 'fabio' }] },
      { kind: 'tick', at: 12, expect: [{ alert: R.highIntent, chat: 'fabio', status: 'new', severity: 'critical' }] },
    ],
  },
  {
    id: 'cliente-frustrado',
    title: 'Cliente irritado',
    description: 'Cliente reclama ("Absurdo!!! Ninguém me responde…") e espera: sentimento "frustrado" e alerta de cliente irritado.',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'gabi', from: 'customer', text: 'Absurdo!!! Ninguém me responde faz dois dias', name: 'Gabi Simulada' },
      { kind: 'tick', at: 9, expect: [{ alert: R.frustrated, chat: 'gabi', status: 'new' }] },
    ],
    expect: [{ conversation: 'gabi', sentiment: 'frustrated' }],
  },
  {
    id: 'promessa-vencida',
    title: 'Promessa vencida e cumprida',
    description: 'A empresa promete "te retorno em 1 hora" e não volta: alerta de promessa vencida. Quando manda os valores, a promessa fica cumprida e o alerta fecha.',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'hugo', from: 'customer', text: 'Vocês fazem clareamento?', name: 'Hugo Simulado' },
      { kind: 'message', at: 40, chat: 'hugo', from: 'company', text: 'Fazemos sim! Já te retorno em 1 hora com os valores.' },
      { kind: 'tick', at: 80, expect: [{ promise: 'hugo', status: 'open' }, { noAlert: R.overdue, chat: 'hugo' }] },
      { kind: 'tick', at: 110, expect: [{ alert: R.overdue, chat: 'hugo', status: 'new' }] },
      { kind: 'message', at: 115, chat: 'hugo', from: 'company', text: 'Os valores são R$ 400 no total.' },
      { kind: 'tick', at: 116, expect: [{ promise: 'hugo', status: 'kept' }, { noAlert: R.overdue, chat: 'hugo' }] },
    ],
  },
  {
    id: 'conexao-cai',
    title: 'Conexão cai e volta',
    description: 'O número desconecta: alerta "Conexão desconectada" sem conversa. Quando volta a conectar, o alerta resolve.',
    plan: 'essencial',
    steps: [
      { kind: 'connection', at: 0, status: 'disconnected', reason: 'logged_out' },
      { kind: 'tick', at: 1, expect: [{ alert: R.connDown, status: 'new', count: 1 }] },
      { kind: 'connection', at: 5, status: 'connected' },
      { kind: 'tick', at: 6, expect: [{ alert: R.connDown, status: 'resolved', count: 1 }, { openAlerts: 0 }] },
    ],
  },
]
