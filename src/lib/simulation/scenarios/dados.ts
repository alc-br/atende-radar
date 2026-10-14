import type { Scenario } from '../types'

// Cenários de dados: idempotência da ingestão e LGPD (máscara na entrada).

export const DADOS: Scenario[] = [
  {
    id: 'mensagem-duplicada',
    title: 'Mensagem duplicada não entra duas vezes',
    description: 'O gateway reenvia o mesmo evento (reconexão) e depois a mesma mensagem com outro id de evento: a conversa continua com UMA mensagem e um único alerta.',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'karen', from: 'customer', text: 'Alguém aí?', name: 'Karen Simulada', ref: 'm1' },
      { kind: 'message', at: 0, chat: 'karen', from: 'customer', text: 'Alguém aí?', name: 'Karen Simulada', repeatOf: 'm1' },
      { kind: 'message', at: 1, chat: 'karen', from: 'customer', text: 'Alguém aí?', name: 'Karen Simulada', repeatOf: 'm1', newEvent: true },
      { kind: 'tick', at: 30, expect: [{ messages: 'karen', count: 1 }, { alert: 'Cliente sem primeira resposta', chat: 'karen', count: 1 }] },
    ],
  },
  {
    id: 'cpf-mascarado',
    title: 'CPF mascarado na entrada',
    description: 'Cliente manda o CPF no WhatsApp: o número nunca é gravado (a mensagem guardada fica com •••.•••.•••-••) e o alerta abre normalmente.',
    plan: 'essencial',
    steps: [
      { kind: 'message', at: 0, chat: 'leo', from: 'customer', text: 'Meu CPF é 529.982.247-25, pode verificar meu cadastro?', name: 'Leo Simulado' },
      { kind: 'tick', at: 30, expect: [{ alert: 'Cliente sem primeira resposta', chat: 'leo', status: 'new' }] },
    ],
    expect: [{ storedText: 'leo', contains: '•••.•••.•••-••', notContains: '529.982.247-25' }],
  },
]
