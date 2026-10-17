import type { Scenario, Step } from '../types'

// Jornadas completas: um dia de atendimento com vários clientes chegando ao mesmo tempo, com venda fechada, venda
// perdida, cliente esperando, promessa, e a conferência dos 8 relatórios (os mesmos que o agendamento envia e a tela
// baixa). Mais: venda recuperada pela fila, perda declarada, contato excluído (LGPD) e carga de 200 conversas.

const R = {
  first: 'Cliente sem primeira resposta',
  quote: 'Pedido de preço sem retorno',
  overdue: 'Promessa vencida',
  frustrated: 'Cliente irritado',
}

/** Um dia na clínica: 6 clientes, cada um com um desfecho diferente. */
const diaClinica = (connection = 0, agent?: string): Step[] => [
  // venda fechada: agenda e confirma
  { kind: 'message', at: 0, chat: 'ana', from: 'customer', text: 'Bom dia', name: 'Ana Jornada', connection },
  { kind: 'message', at: 2, chat: 'ana', from: 'company', text: 'Olá! Como posso ajudar?', agent, connection },
  { kind: 'message', at: 4, chat: 'ana', from: 'customer', text: 'Quero agendar uma consulta amanhã', connection },
  { kind: 'message', at: 6, chat: 'ana', from: 'company', text: 'Posso agendar para amanhã às 10h? Me confirma, por favor.', agent, connection },
  { kind: 'message', at: 8, chat: 'ana', from: 'customer', text: 'Confirmado', connection },
  // pedido de preço sem retorno
  { kind: 'message', at: 1, chat: 'bia', from: 'customer', text: 'Oi, quanto custa o clareamento?', name: 'Bia Jornada', connection },
  // cliente irritado sem retorno
  { kind: 'message', at: 2, chat: 'caio', from: 'customer', text: 'Absurdo!!! Ninguém me responde faz dois dias', name: 'Caio Jornada', connection },
  // venda perdida declarada
  { kind: 'message', at: 3, chat: 'duda', from: 'customer', text: 'Oi, quanto custa o clareamento?', name: 'Duda Jornada', connection },
  { kind: 'message', at: 5, chat: 'duda', from: 'company', text: 'Os valores são R$ 400 no total.', agent, connection },
  { kind: 'message', at: 20, chat: 'duda', from: 'customer', text: 'Obrigada, mas já fechei com outra clínica.', connection },
  // só "bom dia" sem resposta
  { kind: 'message', at: 4, chat: 'eva', from: 'customer', text: 'Bom dia', name: 'Eva Jornada', connection },
  // promessa que vence
  { kind: 'message', at: 5, chat: 'fred', from: 'customer', text: 'Vocês fazem clareamento?', name: 'Fred Jornada', connection },
  { kind: 'message', at: 7, chat: 'fred', from: 'company', text: 'Fazemos sim! Já te retorno em 1 hora com os valores.', agent, connection },
]

const loadSteps = (n: number, numbers: number): Step[] => {
  const out: Step[] = []
  for (let i = 0; i < n; i++) {
    const chat = `carga-${i}`
    const connection = i % numbers
    const kind = i % 4
    if (kind === 0) {
      out.push({ kind: 'message', at: 0, chat, from: 'customer', text: 'Bom dia', name: `Carga ${i}`, connection })
      out.push({ kind: 'message', at: 2, chat, from: 'company', text: 'Olá! Em que posso ajudar?', connection })
    } else if (kind === 1) {
      out.push({ kind: 'message', at: 0, chat, from: 'customer', text: 'Bom dia', name: `Carga ${i}`, connection })
    } else if (kind === 2) {
      out.push({ kind: 'message', at: 0, chat, from: 'customer', text: 'Oi, quanto custa o clareamento?', name: `Carga ${i}`, connection })
    } else {
      out.push({ kind: 'message', at: 0, chat, from: 'customer', text: 'Oi, quanto custa o clareamento?', name: `Carga ${i}`, connection })
      out.push({ kind: 'message', at: 3, chat, from: 'company', text: 'Os valores são R$ 400 no total.', connection })
      out.push({ kind: 'message', at: 5, chat, from: 'customer', text: 'Paguei agora, segue o comprovante.', connection })
    }
  }
  return out
}

const fullDayChecks = [
  { conversation: 'ana', status: 'won', closed: true },
  { conversation: 'duda', status: 'lost', closed: true },
  { alert: R.quote, chat: 'bia', status: 'new' as const },
  { alert: R.frustrated, chat: 'caio', status: 'new' as const },
  { alert: R.first, chat: 'eva', status: 'new' as const },
  { alert: R.overdue, chat: 'fred', status: 'new' as const },
  { noAlert: R.first, chat: 'ana', anyStatus: true },
  { promise: 'fred', status: 'open' as const },
  { recovery: 'bia' },
]

export const JORNADA: Scenario[] = [
  {
    id: 'jornada-essencial-dia',
    title: 'Um dia inteiro no Essencial, com os 8 relatórios',
    description: 'Seis clientes chegam juntos: um agenda e confirma (venda), um pergunta o preço e fica sem retorno, um reclama, um diz que fechou com outra clínica (perda), um só manda "Bom dia" e um recebe a promessa "te retorno em 1 hora". Confere alertas, desfechos e os relatórios diário, semanal, por atendente, oportunidades, promessas, recuperação, qualidade dos dados e conexões.',
    plan: 'essencial',
    settings: { avgTicket: '2000', convRate: '20' },
    steps: [...diaClinica(), { kind: 'tick', at: 30 }, { kind: 'tick', at: 90, expect: fullDayChecks }],
    expect: [
      { report: 'daily', kpi: { 'Conversas iniciadas': 6, 'Mensagens recebidas': 9, 'Mensagens enviadas': 4 }, contains: ['Bia Jornada'] },
      { report: 'weekly', kpi: { 'Conversas iniciadas': 6 } },
      { report: 'agent', rows: { 'Desempenho por atendente': 0 } },
      { report: 'lost_opportunities', contains: ['Bia Jornada'] },
      { report: 'promises', rows: { 'Promessas da empresa aos clientes': 1 }, contains: ['Fred Jornada'] },
      { report: 'recovery', contains: ['Bia Jornada'] },
      { report: 'data_quality' },
      { report: 'connections', rows: { 'Conexões de WhatsApp': 1 } },
    ],
  },
  {
    id: 'jornada-growth-equipe',
    title: 'Growth com equipe e 2 números',
    description: 'O mesmo dia de clínica no 2º número de um Growth, com o atendente "Carlos" assinando as respostas, e um cliente atendido no 1º número. O relatório por atendente mostra o Carlos e o de conexões mostra os 2 números.',
    plan: 'gestao',
    connections: 2,
    agents: ['Carlos Mendes', 'Ana Souza'],
    settings: { avgTicket: '2000', convRate: '20' },
    steps: [
      ...diaClinica(1, 'Carlos'),
      { kind: 'message', at: 0, chat: 'gil', from: 'customer', text: 'Bom dia', name: 'Gil Jornada', connection: 0 },
      { kind: 'message', at: 1, chat: 'gil', from: 'company', text: 'Olá! Em que posso ajudar?', agent: 'Ana', connection: 0 },
      { kind: 'tick', at: 30 },
      { kind: 'tick', at: 90, expect: [...fullDayChecks, { conversation: 'ana', suggestedAgent: 'Carlos Mendes' }, { noAlert: R.first, chat: 'gil', anyStatus: true }] },
    ],
    expect: [
      { report: 'daily', kpi: { 'Conversas iniciadas': 7 } },
      { report: 'agent', contains: ['Carlos Mendes'] },
      { report: 'connections', rows: { 'Conexões de WhatsApp': 2 } },
    ],
  },
  {
    id: 'venda-recuperada',
    title: 'Venda recuperada pela fila de recuperação',
    description: 'O pedido de preço fica sem retorno (alerta e item na fila). A empresa responde depois, o cliente manda "Fiz o pix, segue o comprovante": venda fechada, item da fila marcado como recuperado e alerta fechado.',
    plan: 'essencial',
    settings: { avgTicket: '2000', convRate: '20' },
    steps: [
      { kind: 'message', at: 0, chat: 'hilda', from: 'customer', text: 'Oi, quanto custa o clareamento?', name: 'Hilda Simulada' },
      { kind: 'tick', at: 25, expect: [{ alert: R.quote, chat: 'hilda', status: 'new' }, { recovery: 'hilda' }] },
      { kind: 'message', at: 30, chat: 'hilda', from: 'company', text: 'Desculpe a demora! Os valores são R$ 400 no total.' },
      { kind: 'message', at: 35, chat: 'hilda', from: 'customer', text: 'Fiz o pix, segue o comprovante.' },
      { kind: 'tick', at: 36, expect: [{ conversation: 'hilda', status: 'won', closed: true }, { recoveryStatus: 'hilda', status: 'recovered' }, { noAlert: R.quote, chat: 'hilda' }, { lastTick: { outcomesDetected: 1 } }] },
    ],
    expect: [{ report: 'recovery', contains: ['Hilda Simulada'] }],
  },
  {
    id: 'perda-declarada',
    title: 'Cliente diz que comprou em outro lugar',
    description: 'Depois de receber o preço, o cliente responde "Já comprei em outro lugar": conversa perdida sem esperar o tempo de abandono e nenhum alerta aberto.',
    plan: 'essencial',
    settings: { avgTicket: '2000', convRate: '20' },
    steps: [
      { kind: 'message', at: 0, chat: 'ivan', from: 'customer', text: 'Oi, quanto custa o clareamento?', name: 'Ivan Simulado' },
      { kind: 'message', at: 2, chat: 'ivan', from: 'company', text: 'Os valores são R$ 400 no total.' },
      { kind: 'message', at: 10, chat: 'ivan', from: 'customer', text: 'Já comprei em outro lugar, obrigado.' },
      { kind: 'tick', at: 11, expect: [{ conversation: 'ivan', status: 'lost', closed: true }, { lastTick: { outcomesDetected: 1 } }, { openAlerts: 0 }] },
    ],
  },
  {
    id: 'desistiu-e-voltou',
    title: 'Desistiu e mudou de ideia (fica para o humano)',
    description: '"Desisti" seguido de "na verdade quero agendar": o sistema não decide sozinho; a conversa segue aberta esperando a empresa.',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'jade', from: 'customer', text: 'Oi, quanto custa o clareamento?', name: 'Jade Simulada' },
      { kind: 'message', at: 2, chat: 'jade', from: 'company', text: 'Os valores são R$ 400 no total.' },
      { kind: 'message', at: 5, chat: 'jade', from: 'customer', text: 'Desisti.' },
      { kind: 'message', at: 6, chat: 'jade', from: 'customer', text: 'Na verdade quero agendar sim, pode ser sexta?' },
      { kind: 'tick', at: 7, expect: [{ conversation: 'jade', closed: false, status: 'waiting_company' }, { lastTick: { outcomesDetected: 0 } }] },
    ],
  },
  {
    id: 'contato-excluido-lgpd',
    title: 'Parar de monitorar um contato (LGPD)',
    description: 'O cliente espera e o alerta abre; a empresa marca "parar de monitorar": o alerta é dispensado, as mensagens seguintes desse contato são ignoradas e nada novo abre.',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'kiko', from: 'customer', text: 'Bom dia', name: 'Kiko Simulado' },
      { kind: 'tick', at: 15, expect: [{ alert: R.first, chat: 'kiko', status: 'new' }] },
      { kind: 'exclude', at: 16, chat: 'kiko' },
      { kind: 'tick', at: 17, expect: [{ openAlerts: 0 }] },
      { kind: 'message', at: 18, chat: 'kiko', from: 'customer', text: 'Alguém aí?' },
      { kind: 'tick', at: 60, expect: [{ openAlerts: 0 }, { messages: 'kiko', count: 1 }] },
    ],
  },
  {
    id: 'carga-200-conversas',
    title: 'Carga: 200 clientes em 3 números (Growth)',
    description: '200 clientes chegam ao mesmo tempo em 3 números: 50 atendidos, 50 só com "Bom dia" sem resposta, 50 pedidos de preço sem retorno e 50 vendas pagas. Confere cada grupo e o relatório diário.',
    plan: 'gestao',
    connections: 3,
    settings: { avgTicket: '2000', convRate: '20' },
    steps: [
      ...loadSteps(200, 3),
      {
        kind: 'tick',
        at: 30,
        expect: [
          { noAlert: R.first, chat: 'carga-0', anyStatus: true },
          { alert: R.first, chat: 'carga-1', status: 'new' },
          { alert: R.quote, chat: 'carga-2', status: 'new' },
          { conversation: 'carga-3', status: 'won', closed: true },
          { alert: R.first, chat: 'carga-197', status: 'new' },
          { alert: R.quote, chat: 'carga-198', status: 'new' },
          { conversation: 'carga-199', status: 'won' },
          { openAlerts: 100 },
          { lastTick: { outcomesDetected: 50 } },
        ],
      },
    ],
    expect: [{ report: 'daily', kpi: { 'Conversas iniciadas': 200, 'Mensagens recebidas': 250, 'Mensagens enviadas': 100 } }, { report: 'connections', rows: { 'Conexões de WhatsApp': 3 } }],
  },
]
