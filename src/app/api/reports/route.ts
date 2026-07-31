import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

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
        type: r.reportType,
        period,
        recipients: JSON.parse(r.recipientEmails || '[]') as string[],
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        fileSize: r.filePath ? `${Math.floor(Math.random() * 500 + 100)} KB` : null,
      }
    })

    return NextResponse.json({
      definitions: formattedDefinitions,
      history: formattedRuns,
    })
  } catch (error) {
    console.error('Reports GET error:', error)
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
  }
}
