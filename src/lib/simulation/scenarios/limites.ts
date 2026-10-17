import type { Scenario } from '../types'

// Cenários de limite de conversas do mês (cota do plano) e de assinatura: aviso ao chegar perto, limite estourado
// (conversa recebida mas não analisada), troca para um plano maior (volta a analisar) e assinatura encerrada.

const FIRST = 'Cliente sem primeira resposta'
const QUOTA = 'Aviso de limite de conversas'

export const LIMITES: Scenario[] = [
  {
    id: 'cota-conversas-aviso',
    title: 'Aviso ao chegar em 80% das conversas do mês',
    description: 'Plano Essencial (300 conversas/mês) com 238 já usadas e a regra "Aviso de limite de conversas" (80%). Chegam 2 clientes (240 = 80%): abre UM alerta de cota; o 3º cliente só atualiza o mesmo alerta. Os clientes continuam sendo analisados.',
    plan: 'essencial',
    steps: [
      { kind: 'rule', at: 0, name: QUOTA, type: 'quota_warning', severity: 'high', limitMinutes: 80 },
      { kind: 'usage', at: 0, conversations: 238 },
      { kind: 'message', at: 1, chat: 'cota-a', from: 'customer', text: 'Bom dia', name: 'Cliente Cota A' },
      { kind: 'tick', at: 2, expect: [{ noAlert: QUOTA }] },
      { kind: 'message', at: 3, chat: 'cota-b', from: 'customer', text: 'Bom dia', name: 'Cliente Cota B' },
      { kind: 'tick', at: 4, expect: [{ alert: QUOTA, status: 'new', count: 1, severity: 'high' }, { gate: null }] },
      { kind: 'message', at: 5, chat: 'cota-c', from: 'customer', text: 'Bom dia', name: 'Cliente Cota C' },
      { kind: 'tick', at: 30, expect: [{ alert: QUOTA, status: 'new', count: 1 }, { alert: FIRST, chat: 'cota-a', status: 'new' }, { alert: FIRST, chat: 'cota-c', status: 'new' }] },
    ],
    expect: [{ notification: QUOTA }],
  },
  {
    id: 'cota-conversas-estourada',
    title: 'Limite de conversas do mês atingido e troca de plano',
    description: 'Plano Essencial com as 300 conversas do mês já usadas. O cliente novo é recebido e guardado, mas NÃO é analisado (sem alerta, aviso "Limite de conversas do plano atingido" no sino, alerta de cota aberto). A empresa contrata o Growth (1000): na rodada seguinte o cliente é analisado, o alerta de atraso abre e o de cota fecha sozinho (30%).',
    plan: 'essencial',
    steps: [
      { kind: 'rule', at: 0, name: QUOTA, type: 'quota_warning', severity: 'high', limitMinutes: 90 },
      { kind: 'usage', at: 0, conversations: 300 },
      { kind: 'message', at: 1, chat: 'limite', from: 'customer', text: 'Bom dia, preciso de ajuda', name: 'Cliente Acima do Limite' },
      { kind: 'tick', at: 30, expect: [{ lastTick: { overQuota: 1 } }, { noAlert: FIRST, chat: 'limite', anyStatus: true }, { alert: QUOTA, status: 'new' }, { messages: 'limite', count: 1 }] },
      { kind: 'tick', at: 31, expect: [{ lastTick: { overQuota: 1 } }, { noAlert: FIRST, chat: 'limite', anyStatus: true }] },
      { kind: 'plan', at: 32, plan: 'gestao' },
      { kind: 'tick', at: 33, expect: [{ alert: FIRST, chat: 'limite', status: 'new', count: 1 }, { alert: QUOTA, status: 'resolved' }, { noAlert: QUOTA }] },
    ],
    expect: [{ notification: 'Limite de conversas do plano atingido' }],
  },
  {
    id: 'cota-growth-no-limite',
    title: 'Growth no limite: as primeiras entram, as que passam não',
    description: 'Plano Growth (1000/mês) com 998 usadas. Chegam 4 clientes: os 2 primeiros (999 e 1000) são analisados e geram alerta; os 2 que passaram do limite ficam guardados sem análise.',
    plan: 'gestao',
    steps: [
      { kind: 'usage', at: 0, conversations: 998 },
      { kind: 'message', at: 1, chat: 'g1', from: 'customer', text: 'Bom dia', name: 'Growth Um' },
      { kind: 'message', at: 2, chat: 'g2', from: 'customer', text: 'Bom dia', name: 'Growth Dois' },
      { kind: 'message', at: 3, chat: 'g3', from: 'customer', text: 'Bom dia', name: 'Growth Três' },
      { kind: 'message', at: 4, chat: 'g4', from: 'customer', text: 'Bom dia', name: 'Growth Quatro' },
      {
        kind: 'tick',
        at: 40,
        expect: [
          { lastTick: { overQuota: 2 } },
          { alert: FIRST, chat: 'g1', status: 'new' },
          { alert: FIRST, chat: 'g2', status: 'new' },
          { noAlert: FIRST, chat: 'g3', anyStatus: true },
          { noAlert: FIRST, chat: 'g4', anyStatus: true },
          { messages: 'g4', count: 1 },
        ],
      },
    ],
    expect: [{ notification: 'Limite de conversas do plano atingido' }],
  },
  {
    id: 'cota-performance-no-limite',
    title: 'Performance no limite (5000 conversas)',
    description: 'Plano Performance com 4999 conversas usadas: o 1º cliente entra (5000) e é analisado; o 2º passa do limite e não é analisado.',
    plan: 'performance',
    steps: [
      { kind: 'usage', at: 0, conversations: 4999 },
      { kind: 'message', at: 1, chat: 'p1', from: 'customer', text: 'Bom dia', name: 'Performance Um' },
      { kind: 'message', at: 2, chat: 'p2', from: 'customer', text: 'Bom dia', name: 'Performance Dois' },
      { kind: 'tick', at: 40, expect: [{ lastTick: { overQuota: 1 } }, { alert: FIRST, chat: 'p1', status: 'new' }, { noAlert: FIRST, chat: 'p2', anyStatus: true }] },
    ],
  },
  {
    id: 'assinatura-cancelada',
    title: 'Assinatura encerrada pausa a análise',
    description: 'O período pago acabou (assinatura cancelada): a mensagem chega e é guardada, mas nada é analisado nem alertado; aviso "Assinatura encerrada" no sino.',
    plan: 'gestao',
    subscription: 'canceled',
    steps: [
      { kind: 'message', at: 0, chat: 'cancel', from: 'customer', text: 'Bom dia', name: 'Cliente Cancelado' },
      { kind: 'tick', at: 30, expect: [{ gate: 'canceled' }, { noAlert: FIRST, chat: 'cancel', anyStatus: true }] },
    ],
    expect: [{ messages: 'cancel', count: 1 }, { openAlerts: 0 }, { notification: 'Assinatura encerrada' }],
  },
  {
    id: 'assinatura-reativada',
    title: 'Assinatura cancelada e reativada',
    description: 'Com a assinatura encerrada o cliente espera sem alerta; a empresa contrata de novo e, na rodada seguinte, o alerta abre (a mensagem guardada é analisada).',
    plan: 'essencial',
    subscription: 'canceled',
    steps: [
      { kind: 'message', at: 0, chat: 'volta', from: 'customer', text: 'Bom dia', name: 'Cliente que Voltou' },
      { kind: 'tick', at: 20, expect: [{ gate: 'canceled' }, { noAlert: FIRST, chat: 'volta', anyStatus: true }] },
      { kind: 'plan', at: 21, status: 'active' },
      { kind: 'tick', at: 22, expect: [{ gate: null }, { alert: FIRST, chat: 'volta', status: 'new' }] },
    ],
  },
  {
    id: 'teste-gratis-contrata',
    title: 'Teste grátis vencido e contratação',
    description: 'Teste grátis terminou (análise pausada); a empresa contrata o Essencial e o cliente que estava esperando passa a gerar alerta.',
    plan: 'essencial',
    subscription: 'trial_expired',
    steps: [
      { kind: 'message', at: 0, chat: 'trial', from: 'customer', text: 'Bom dia', name: 'Cliente do Teste' },
      { kind: 'tick', at: 20, expect: [{ gate: 'trial_expired' }] },
      { kind: 'plan', at: 21, plan: 'essencial', status: 'active' },
      { kind: 'tick', at: 22, expect: [{ gate: null }, { alert: FIRST, chat: 'trial', status: 'new' }] },
    ],
    expect: [{ notification: 'Teste grátis encerrado' }],
  },
]
