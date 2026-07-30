import { NextResponse } from 'next/server'

const customers = ['Maria Santos', 'João Oliveira', 'Pedro Souza', 'Camila Ferreira', 'Lucas Rodrigues', 'Beatriz Lima', 'Gabriel Almeida', 'Isabela Martins', 'Rafael Costa', 'Larissa Pereira']
const agentNames = ['Ana Silva', 'Carlos Mendes', 'Juliana Costa', 'Roberto Alves', 'Fernanda Lima']
const stages = ['discovery', 'qualification', 'evaluation', 'price', 'proposal', 'negotiation', 'decision', 'won', 'lost', 'post_sale']
const intents = ['consulta', 'preco', 'disponibilidade', 'agendamento', 'compra', 'negociacao', 'suporte', 'pos_venda', 'reclamacao', 'cancelamento']
const urgencies = ['low', 'normal', 'normal', 'normal', 'high', 'critical']
const sentiments = ['positive', 'neutral', 'neutral', 'neutral', 'confused', 'anxious', 'frustrated']
const statuses = ['new', 'waiting_company', 'waiting_customer', 'in_progress', 'follow_up_due', 'won', 'lost', 'closed']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '15')

  const all = Array.from({ length: 50 }, (_, i) => ({
    id: `conv_${i + 1}`,
    customerName: customers[i % customers.length],
    customerPhone: `*****${(1000 + i).toString().slice(-4)}`,
    connectionName: i % 3 === 2 ? 'Unidade Centro' : 'Recepção Principal',
    agentId: `agent_${(i % 5) + 1}`,
    agentName: agentNames[i % 5],
    agentTeam: i % 5 === 3 ? 'Marketing' : 'Recepção',
    operationalStatus: statuses[i % statuses.length],
    inferredStage: stages[i % stages.length],
    primaryIntent: intents[i % intents.length],
    urgency: urgencies[i % urgencies.length],
    sentiment: sentiments[i % sentiments.length],
    score: Math.round(40 + Math.random() * 55),
    potentialValue: Math.random() > 0.3 ? Math.round(200 + Math.random() * 3500) : 0,
    confidence: +(0.5 + Math.random() * 0.45).toFixed(2),
    messagesCount: 3 + Math.floor(Math.random() * 25),
    lastActivity: new Date(Date.now() - Math.floor(Math.random() * 72) * 3600000).toISOString(),
    waitingMinutes: statuses[i % statuses.length] === 'waiting_company' ? Math.floor(Math.random() * 120) + 5 : 0,
    alertCount: Math.floor(Math.random() * 4),
    tags: i % 3 === 0 ? ['prioritario'] : [],
  }))

  const start = (page - 1) * limit
  const paged = all.slice(start, start + limit)

  return NextResponse.json({
    conversations: paged,
    pagination: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) },
  })
}
