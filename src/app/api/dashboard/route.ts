import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    summary: {
      conversationsStarted: 127,
      conversationsStartedChange: 12.5,
      customersWaiting: 8,
      customersWaitingChange: -15.0,
      medianFirstResponse: 5.2,
      medianFirstResponseChange: -8.3,
      opportunitiesDetected: 43,
      opportunitiesDetectedChange: 22.0,
      opportunitiesAtRisk: 12,
      opportunitiesAtRiskChange: 5.0,
      overduePromises: 3,
      overduePromisesChange: -25.0,
      potentialValueAtRisk: 8450.0,
      potentialValueAtRiskChange: 18.0,
      overallScore: 76,
      overallScoreChange: 3.0,
    },
    funnel: [
      { stage: 'Conversas', count: 127 },
      { stage: 'Oportunidades', count: 43 },
      { stage: 'Pedidos de preço', count: 28 },
      { stage: 'Propostas', count: 18 },
      { stage: 'Vendas confirmadas', count: 12 },
      { stage: 'Perdas confirmadas', count: 6 },
      { stage: 'Sem desfecho', count: 7 },
    ],
    failures: [
      { type: 'Sem resposta', count: 14, severity: 'high' },
      { type: 'Resposta lenta', count: 22, severity: 'medium' },
      { type: 'Pergunta ignorada', count: 8, severity: 'medium' },
      { type: 'Orçamento pendente', count: 6, severity: 'high' },
      { type: 'Promessa vencida', count: 3, severity: 'critical' },
      { type: 'Lead abandonado', count: 5, severity: 'high' },
      { type: 'Cliente frustrado', count: 2, severity: 'critical' },
    ],
    evolution: Array.from({ length: 14 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (13 - i))
      return {
        date: d.toISOString().split('T')[0],
        score: +(65 + Math.random() * 25).toFixed(1),
        responseTime: +(3 + Math.random() * 8).toFixed(1),
        abandonment: Math.floor(Math.random() * 8),
        valueAtRisk: Math.round(2000 + Math.random() * 10000),
      }
    }),
    priorities: Array.from({ length: 10 }, (_, i) => ({
      id: `conv_${i + 1}`,
      customerName: `Cliente ${i + 1}`,
      customerPhone: `*****${(1000 + i).toString().slice(-4)}`,
      agentName: ['Ana Silva', 'Carlos Mendes', 'Juliana Costa', 'Roberto Alves', 'Fernanda Lima'][i % 5],
      reason: ['Pedido de preço sem retorno', 'Cliente irritado', 'Promessa vencida', 'Lead abandonado', 'Resposta lenta'][i % 5],
      waitingMinutes: Math.floor(Math.random() * 120) + 5,
      potentialValue: Math.round(200 + Math.random() * 3500),
    })),
    teamPerformance: [
      { name: 'Juliana Costa', team: 'Recepção', score: 88, avgResponseTime: 3.1, opportunities: 35, criticalFailures: 0, promisesKept: 12, promisesTotal: 13, trend: 'up' },
      { name: 'Ana Silva', team: 'Recepção', score: 82, avgResponseTime: 4.2, opportunities: 28, criticalFailures: 1, promisesKept: 9, promisesTotal: 10, trend: 'up' },
      { name: 'Fernanda Lima', team: 'Recepção', score: 79, avgResponseTime: 5.0, opportunities: 26, criticalFailures: 2, promisesKept: 8, promisesTotal: 10, trend: 'up' },
      { name: 'Carlos Mendes', team: 'Recepção', score: 74, avgResponseTime: 6.8, opportunities: 22, criticalFailures: 3, promisesKept: 6, promisesTotal: 9, trend: 'down' },
      { name: 'Roberto Alves', team: 'Marketing', score: 65, avgResponseTime: 8.5, opportunities: 18, criticalFailures: 4, promisesKept: 4, promisesTotal: 7, trend: 'stable' },
    ],
  })
}
