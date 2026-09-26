import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, badRequest } from '@/lib/api-auth'
import { buildReport, REPORT_TYPES, type ReportType } from '@/lib/reports/build'

interface GenerateBody {
  reportTypeId: string
  periodStart: string
  periodEnd: string
}

// Gera o relatório NA HORA a partir dos dados reais e guarda uma foto do resultado (para baixar depois).
export async function POST(request: Request) {
  try {
    const g = await guard('reports.generate')
    if (!g.ok) return g.res
    const orgId = g.auth.orgId

    const body = (await request.json().catch(() => null)) as GenerateBody | null
    if (!body?.reportTypeId || !body.periodStart || !body.periodEnd) {
      return badRequest('reportTypeId, periodStart e periodEnd são obrigatórios')
    }
    if (!(REPORT_TYPES as readonly string[]).includes(body.reportTypeId)) return badRequest('Tipo de relatório inválido')
    const start = new Date(body.periodStart)
    const end = new Date(body.periodEnd)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return badRequest('Período inválido')

    const content = await buildReport(orgId, body.reportTypeId as ReportType, start, end)

    const definition = await db.reportDefinition.findFirst({ where: { organizationId: orgId, reportType: body.reportTypeId } })
    const reportRun = await db.reportRun.create({
      data: {
        organizationId: orgId,
        reportType: body.reportTypeId,
        status: 'completed',
        periodStart: start,
        periodEnd: end,
        recipientEmails: definition?.recipients ?? '[]',
        contentJson: JSON.stringify(content),
      },
      select: { id: true, reportType: true, status: true, periodStart: true, periodEnd: true, createdAt: true },
    })
    if (definition) await db.reportDefinition.update({ where: { id: definition.id }, data: { lastRunAt: new Date() } })

    await audit(g.auth, { action: 'report.generated', targetType: 'report_run', targetId: reportRun.id })
    return NextResponse.json({ success: true, reportRun }, { status: 201 })
  } catch (error) {
    console.error('Report generate error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
