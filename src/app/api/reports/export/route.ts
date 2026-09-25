import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest } from '@/lib/api-auth'

// Exporta os indicadores diários da empresa (últimos 90 dias) em CSV (Excel) ou JSON.
export async function GET(request: Request) {
  const g = await guard('reports.view')
  if (!g.ok) return g.res
  const format = new URL(request.url).searchParams.get('format') || 'csv'
  if (format !== 'csv' && format !== 'json') return badRequest('format deve ser csv ou json')

  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const rows = await db.dailyMetric.findMany({
    where: { organizationId: g.auth.orgId, connectionId: null, teamId: null, date: { gte: since } },
    orderBy: { date: 'asc' },
  })
  const daily = rows.map((r) => ({
    date: r.date,
    conversationsStarted: r.conversationsStarted,
    customersWaiting: r.customersWaiting,
    medianFirstResponseMinutes: r.medianFirstResponse,
    opportunitiesDetected: r.opportunitiesDetected,
    opportunitiesAtRisk: r.opportunitiesAtRisk,
    overduePromises: r.overduePromises,
    potentialValueAtRisk: r.potentialValueAtRisk,
    overallScore: r.overallScore,
    messagesReceived: r.messagesReceived,
    messagesSent: r.messagesSent,
  }))

  if (format === 'json') return NextResponse.json({ daily })

  const head = ['Data', 'Conversas iniciadas', 'Clientes aguardando', '1ª resposta mediana (min)', 'Oportunidades', 'Oportunidades em risco', 'Promessas vencidas', 'Valor em risco (R$)', 'Nota geral', 'Mensagens recebidas', 'Mensagens enviadas']
  const lines = [head.join(';'), ...daily.map((d) => [d.date, d.conversationsStarted, d.customersWaiting, d.medianFirstResponseMinutes, d.opportunitiesDetected, d.opportunitiesAtRisk, d.overduePromises, d.potentialValueAtRisk, d.overallScore, d.messagesReceived, d.messagesSent].join(';'))]
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="atenderadar-indicadores.csv"' },
  })
}
