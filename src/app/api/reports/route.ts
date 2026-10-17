import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { DEFAULT_REPORT_DEFINITIONS } from '@/lib/org-defaults-data'

export async function GET() {
  try {
    const g = await guard('reports.view')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    // Report definitions
    const definitions = await db.reportDefinition.findMany({
      where: { organizationId: org.id },
      orderBy: { reportType: 'asc' },
    })

    const formattedDefinitions = definitions.map((d) => ({
      id: d.reportType,
      name: d.name,
      description: d.description,
      schedule: d.schedule,
      recipients: JSON.parse(d.recipients || '[]') as string[],
      lastRun: d.lastRunAt?.toISOString() || null,
    }))

    // Nome do relatório no histórico: o da definição da organização; senão o padrão; o slug só em último caso
    const names = new Map<string, string>(DEFAULT_REPORT_DEFINITIONS.map((d) => [d.reportType, d.name]))
    for (const d of definitions) names.set(d.reportType, d.name)

    // Report run history
    const runs = await db.reportRun.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const formattedRuns = runs.map((r) => {
      const periodStart = r.periodStart
      const periodEnd = r.periodEnd
      let period = ''
      if (periodStart && periodEnd) {
        const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        if (periodStart.toDateString() === periodEnd.toDateString()) {
          period = fmt(periodStart)
        } else {
          period = `${fmt(periodStart)}-${fmt(periodEnd)}`
        }
      }
      return {
        id: r.id,
        reportTypeId: r.reportType,
        type: names.get(r.reportType) ?? r.reportType,
        period,
        recipients: JSON.parse(r.recipientEmails || '[]') as string[],
        status: r.status,
        source: r.source,
        error: r.error,
        emailStatus: r.emailStatus,
        emailedAt: r.emailedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        filePath: r.filePath,
      }
    })

    const orgRow = await db.organization.findUnique({ where: { id: org.id }, select: { timezone: true } })
    return NextResponse.json({
      definitions: formattedDefinitions,
      history: formattedRuns,
      timezone: orgRow?.timezone || 'America/Sao_Paulo', // os horários agendados valem neste fuso
    })
  } catch (error) {
    console.error('Reports GET error:', error)
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
  }
}
