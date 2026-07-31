import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get alert rules count
    const alertRulesCount = await db.alertRule.count({
      where: { organizationId: org.id },
    })

    // Get report definitions
    const reportDefinitions = await db.reportDefinition.findMany({
      where: { organizationId: org.id },
      select: { id: true, reportType: true, name: true, schedule: true, recipients: true },
    })

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        displayName: org.displayName,
        cnpj: org.cnpj,
        segment: org.segment,
        timezone: org.timezone,
        currency: org.currency,
        status: org.status,
        logoUrl: org.logoUrl,
        website: org.website,
        phone: org.phone,
        adminEmail: org.adminEmail,
      },
      alertRulesCount,
      reportDefinitions: reportDefinitions.map((r) => ({
        id: r.id,
        reportType: r.reportType,
        name: r.name,
        schedule: r.schedule,
        recipients: JSON.parse(r.recipients || '[]') as string[],
      })),
    })
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      displayName,
      cnpj,
      segment,
      timezone,
      currency,
      logoUrl,
      website,
      phone,
      adminEmail,
    } = body as {
      displayName?: string
      cnpj?: string
      segment?: string
      timezone?: string
      currency?: string
      logoUrl?: string
      website?: string
      phone?: string
      adminEmail?: string
    }

    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (displayName !== undefined) data.displayName = displayName
    if (cnpj !== undefined) data.cnpj = cnpj
    if (segment !== undefined) data.segment = segment
    if (timezone !== undefined) data.timezone = timezone
    if (currency !== undefined) data.currency = currency
    if (logoUrl !== undefined) data.logoUrl = logoUrl
    if (website !== undefined) data.website = website
    if (phone !== undefined) data.phone = phone
    if (adminEmail !== undefined) data.adminEmail = adminEmail

    const updated = await db.organization.update({
      where: { id: org.id },
      data,
    })

    return NextResponse.json({ success: true, organization: updated })
  } catch (error) {
    console.error('Settings PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
