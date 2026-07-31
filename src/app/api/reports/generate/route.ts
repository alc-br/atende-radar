import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface GenerateBody {
  reportTypeId: string
  periodStart: string
  periodEnd: string
}

export async function POST(request: Request) {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = (await request.json()) as GenerateBody
    const { reportTypeId, periodStart, periodEnd } = body

    if (!reportTypeId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'reportTypeId, periodStart, and periodEnd are required' },
        { status: 400 }
      )
    }

    // Get the report definition to find recipients
    const definition = await db.reportDefinition.findFirst({
      where: { organizationId: org.id, reportType: reportTypeId },
    })

    const recipients = definition
      ? definition.recipients
      : '[]'

    const reportRun = await db.reportRun.create({
      data: {
        organizationId: org.id,
        reportType: reportTypeId,
        status: 'pending',
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        recipientEmails: recipients,
      },
    })

    // Update lastRunAt on the definition
    if (definition) {
      await db.reportDefinition.update({
        where: { id: definition.id },
        data: { lastRunAt: new Date() },
      })
    }

    // Simulate processing (in production, this would be queued)
    setTimeout(async () => {
      await db.reportRun.update({
        where: { id: reportRun.id },
        data: { status: 'completed' },
      }).catch(() => {})
    }, 3000)

    return NextResponse.json(
      { success: true, reportRun },
      { status: 201 }
    )
  } catch (error) {
    console.error('Report generate error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
