import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, badRequest } from '@/lib/api-auth'
import { enforceExportQuota } from '@/lib/quotas'
import { toXlsx } from '@/lib/reports/xlsx'
import type { ReportContent } from '@/lib/reports/types'

// Exporta os indicadores diários da empresa (últimos 90 dias) em CSV (Excel), XLSX ou JSON. Conta na cota de exportações do plano.
export async function GET(request: Request) {
  const g = await guard('reports.view')
  if (!g.ok) return g.res
  const format = new URL(request.url).searchParams.get('format') || 'csv'
  if (format !== 'csv' && format !== 'json' && format !== 'xlsx') return badRequest('format deve ser csv, xlsx ou json')
  const overQuota = await enforceExportQuota(g.auth.orgId)
  if (overQuota) return overQuota

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

  const head = ['Data', 'Conversas iniciadas', 'Clientes aguardando', '1ª resposta mediana (min)', 'Oportunidades', 'Oportunidades em risco', 'Promessas vencidas', 'Valor em risco (R$)', 'Nota geral', 'Mensagens recebidas', 'Mensagens enviadas']
  if (format === 'xlsx') {
    const org = await db.organization.findUnique({ where: { id: g.auth.orgId }, select: { displayName: true } })
    const content: ReportContent = {
      type: 'daily',
      title: 'Indicadores diários (últimos 90 dias)',
      orgName: org?.displayName ?? '',
      periodStart: new Date(`${since}T00:00:00Z`).toISOString(),
      periodEnd: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      summary: [],
      sections: [{
        heading: 'Indicadores diários',
        columns: head,
        formats: ['day', 'int', 'int', 'decimal', 'int', 'int', 'int', 'money', 'decimal', 'int', 'int'],
        rows: daily.map((d) => [d.date, d.conversationsStarted, d.customersWaiting, d.medianFirstResponseMinutes, d.opportunitiesDetected, d.opportunitiesAtRisk, d.overduePromises, d.potentialValueAtRisk, d.overallScore, d.messagesReceived, d.messagesSent]),
      }],
    }
    const file = new Uint8Array(await toXlsx(content))
    await audit(g.auth, { action: 'report.exported', targetType: 'metrics', details: { format } })
    return new NextResponse(file, {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="atenderadar-indicadores.xlsx"', 'X-Content-Type-Options': 'nosniff' },
    })
  }

  await audit(g.auth, { action: 'report.exported', targetType: 'metrics', details: { format } })
  if (format === 'json') return NextResponse.json({ daily })

  const lines = [head.join(';'), ...daily.map((d) => [d.date, d.conversationsStarted, d.customersWaiting, d.medianFirstResponseMinutes, d.opportunitiesDetected, d.opportunitiesAtRisk, d.overduePromises, d.potentialValueAtRisk, d.overallScore, d.messagesReceived, d.messagesSent].join(';'))]
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="atenderadar-indicadores.csv"' },
  })
}
