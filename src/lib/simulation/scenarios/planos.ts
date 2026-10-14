import type { Scenario } from '../types'

// Cenários de plano: cotas (402), teste grátis vencido e operação em vários números.

export const PLANOS: Scenario[] = [
  {
    id: 'teste-gratis-vencido',
    title: 'Teste grátis vencido pausa a análise',
    description: 'O teste grátis terminou: a mensagem do cliente é recebida e guardada, mas o motor não analisa nem abre alerta (análise pausada, aviso no sino).',
    plan: 'essencial',
    subscription: 'trial_expired',
    steps: [
      { kind: 'message', at: 0, chat: 'ivo', from: 'customer', text: 'Bom dia', name: 'Ivo Simulado' },
      { kind: 'tick', at: 30, expect: [{ gate: 'trial_expired' }, { noAlert: 'Cliente sem primeira resposta', chat: 'ivo', anyStatus: true }] },
    ],
    expect: [{ messages: 'ivo', count: 1 }, { openAlerts: 0 }],
  },
  {
    id: 'limite-conexoes-plano',
    title: 'Limite de conexões do plano (402)',
    description: 'Plano Essencial (1 número): cadastrar o 2º número é recusado com 402; o 1º continua funcionando.',
    plan: 'essencial',
    connections: 1,
    steps: [
      { kind: 'addConnection', at: 0, expectStatus: 402 },
      { kind: 'message', at: 1, chat: 'joana', from: 'customer', text: 'Bom dia', name: 'Joana Simulada' },
      { kind: 'tick', at: 2, expect: [{ gate: null }, { conversation: 'joana', status: 'waiting_company' }] },
    ],
  },
  {
    id: 'limite-atendentes-plano',
    title: 'Limite de atendentes do plano (402)',
    description: 'Plano Essencial (3 atendentes): com 3 cadastrados, o 4º é recusado com 402.',
    plan: 'essencial',
    agents: ['Atendente Um', 'Atendente Dois', 'Atendente Três'],
    steps: [{ kind: 'addAgent', at: 0, expectStatus: 402 }],
  },
  {
    id: 'plano-growth-3-numeros',
    title: 'Plano Growth com 3 números',
    description: 'Três números no plano Growth (o máximo): cada número recebe o seu cliente e gera o seu alerta; o 4º número é recusado com 402.',
    plan: 'gestao',
    connections: 3,
    agents: ['Atendente Um', 'Atendente Dois'],
    steps: [
      { kind: 'message', at: 0, chat: 'cliente-n1', from: 'customer', text: 'Bom dia', name: 'Cliente Número Um', connection: 0 },
      { kind: 'message', at: 0, chat: 'cliente-n2', from: 'customer', text: 'Bom dia', name: 'Cliente Número Dois', connection: 1 },
      { kind: 'message', at: 0, chat: 'cliente-n3', from: 'customer', text: 'Bom dia', name: 'Cliente Número Três', connection: 2 },
      { kind: 'message', at: 2, chat: 'cliente-n3', from: 'company', text: 'Olá! Em que posso ajudar?', connection: 2 },
      { kind: 'addConnection', at: 3, expectStatus: 402 },
      {
        kind: 'tick',
        at: 30,
        expect: [
          { alert: 'Cliente sem primeira resposta', chat: 'cliente-n1', status: 'new' },
          { alert: 'Cliente sem primeira resposta', chat: 'cliente-n2', status: 'new' },
          { noAlert: 'Cliente sem primeira resposta', chat: 'cliente-n3', anyStatus: true },
        ],
      },
    ],
  },
  {
    id: 'plano-performance-carga',
    title: 'Plano Performance: 10 números e 50 atendentes',
    description: 'Carga do maior plano: 10 números e 50 atendentes cadastrados (o máximo); 11º número e 51º atendente recusados com 402; 20 clientes espalhados pelos números, metade atendida.',
    plan: 'performance',
    connections: 10,
    agents: Array.from({ length: 50 }, (_, i) => `Atendente ${i + 1}`),
    steps: [
      { kind: 'addConnection', at: 0, expectStatus: 402 },
      { kind: 'addAgent', at: 0, expectStatus: 402 },
      ...Array.from({ length: 20 }, (_, i) => ({ kind: 'message' as const, at: 1, chat: `carga-${i}`, from: 'customer' as const, text: 'Bom dia', name: `Cliente Carga ${i}`, connection: i % 10 })),
      ...Array.from({ length: 10 }, (_, i) => ({ kind: 'message' as const, at: 3, chat: `carga-${i * 2}`, from: 'company' as const, text: 'Olá! Em que posso ajudar?', connection: (i * 2) % 10 })),
      { kind: 'tick', at: 40, expect: [{ openAlerts: 10 }, { alert: 'Cliente sem primeira resposta', chat: 'carga-1', status: 'new' }, { noAlert: 'Cliente sem primeira resposta', chat: 'carga-0', anyStatus: true }] },
    ],
  },
]
