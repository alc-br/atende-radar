import { NextResponse } from 'next/server'

const severities = ['critical', 'high', 'medium', 'low', 'info'] as const
const statuses = ['new', 'acknowledged', 'in_progress', 'resolved', 'dismissed', 'false_positive', 'expired', 'superseded'] as const
const types = ['no_response', 'slow_response', 'ignored_question', 'pending_quote', 'overdue_promise', 'abandoned_lead', 'customer_frustrated', 'quota_warning']
const titles: Record<string, string> = {
  no_response: 'Cliente sem resposta',
  slow_response: 'Resposta lenta',
  ignored_question: 'Pergunta ignorada',
  pending_quote: 'Orçamento pendente',
  overdue_promise: 'Promessa vencida',
  abandoned_lead: 'Lead abandonado',
  customer_frustrated: 'Cliente frustrado',
  quota_warning: 'Quota próxima do limite',
}
const customers = ['Maria Santos', 'João Oliveira', 'Pedro Souza', 'Camila Ferreira', 'Lucas Rodrigues']
const agentNames = ['Ana Silva', 'Carlos Mendes', 'Juliana Costa', 'Roberto Alves', 'Fernanda Lima']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'new'
  const severity = searchParams.get('severity')

  const alerts = Array.from({ length: 20 }, (_, i) => {
    const type = types[i % types.length]
    const sev = severities[i % severities.length]
    const st = statuses[i < 5 ? 0 : i < 10 ? 1 : i < 14 ? 2 : 3]
    return {
      id: `alert_${i + 1}`,
      conversationId: `conv_${i + 1}`,
      ruleName: type,
      severity: sev,
      title: titles[type],
      description: `Detectado em conversa com ${customers[i % 5]}. Agente: ${agentNames[i % 5]}.`,
      customerName: customers[i % 5],
      agentName: agentNames[i % 5],
      status: st === statuses.indexOf(status as typeof statuses[number]) ? status : statuses[i < 5 ? 0 : i < 10 ? 1 : i < 14 ? 2 : 3],
      potentialValue: i % 3 === 0 ? Math.round(500 + Math.random() * 3000) : undefined,
      confidence: +(0.6 + Math.random() * 0.35).toFixed(2),
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 48) * 3600000).toISOString(),
      evidence: 'Evidência detectada pela análise da conversa.',
    }
  })

  let filtered = alerts
  if (status && status !== 'all') filtered = filtered.filter(a => a.status === status)
  if (severity && severity !== 'all') filtered = filtered.filter(a => a.severity === severity)

  return NextResponse.json({ alerts: filtered, total: filtered.length, counts: { new: 5, acknowledged: 5, in_progress: 4, resolved: 4, dismissed: 2 } })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const { alertId, action, reason } = body
  return NextResponse.json({ success: true, alertId, action, reason, updatedAt: new Date().toISOString() })
}