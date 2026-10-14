import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { applyReportPrefs, splitReportPrefs } from '@/lib/reports/settings-sync'
import { applyExcludedNumbers } from '@/lib/excluded-numbers'

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export async function GET() {
  try {
    const g = await guard('settings.manage')
    if (!g.ok) return g.res
    const org = await db.organization.findUniqueOrThrow({ where: { id: g.auth.orgId } })

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
      settings: safeJsonParse<Record<string, unknown>>(org.settingsJson, {}),
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
    const g = await guard('settings.manage')
    if (!g.ok) return g.res
    const org = await db.organization.findUniqueOrThrow({ where: { id: g.auth.orgId } })

    const j = await readJson(request)
    if (!j.ok) return j.res
    const body = j.body
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
      settings,
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
      settings?: Record<string, unknown>
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
    // relatório diário/semanal: vira o agendamento real (tela Relatórios), não fica solto no JSON
    const split = settings !== undefined && settings && typeof settings === 'object' ? splitReportPrefs(settings) : null
    if (split) {
      const current = safeJsonParse<Record<string, unknown>>(org.settingsJson, {})
      data.settingsJson = JSON.stringify({ ...current, ...split.rest })
    }

    const updated = await db.organization.update({
      where: { id: org.id },
      data,
    })
    const orgKeys = Object.keys(data).filter((k) => !['updatedAt', 'settingsJson'].includes(k))
    if (orgKeys.length) await audit(g.auth, { action: 'organization.updated', targetType: 'organization', targetId: org.id, details: { keys: orgKeys } })
    let reportsUpdated: string[] = []
    let excludedContacts = 0
    if (split) {
      await audit(g.auth, { action: 'settings.updated', targetType: 'organization', targetId: org.id, details: { keys: Object.keys(settings!).slice(0, 50) } })
      if (Object.keys(split.prefs).length) reportsUpdated = await applyReportPrefs(org.id, split.prefs)
      // "Números excluídos do monitoramento": quem já tinha conversa com esses números para de ser monitorado agora
      if (split.rest.privExcluded !== undefined) {
        excludedContacts = await applyExcludedNumbers(org.id, split.rest.privExcluded)
        if (excludedContacts > 0) await audit(g.auth, { action: 'privacy.exclude', targetType: 'organization', targetId: org.id, details: { source: 'settings', contacts: excludedContacts } })
      }
    }

    return NextResponse.json({
      success: true,
      organization: updated,
      settings: safeJsonParse<Record<string, unknown>>(updated.settingsJson, {}),
      reportsUpdated,
      excludedContacts,
    })
  } catch (error) {
    console.error('Settings PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
