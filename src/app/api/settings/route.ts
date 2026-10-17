import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { cleanDocument, cleanEmail, cleanPhone, cleanWebsite } from '@/lib/org-fields'
import { applyReportPrefs, splitReportPrefs } from '@/lib/reports/settings-sync'
import { applyExcludedNumbers } from '@/lib/excluded-numbers'
import { logoUrl as uploadedLogoUrl } from '@/lib/uploads'

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
        // logotipo enviado em Configurações › Empresa (servido por /api/media/logo, só para a própria empresa)
        logoUrl: uploadedLogoUrl(org),
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
      name,
      displayName,
      cnpj,
      segment,
      timezone,
      currency,
      website,
      phone,
      adminEmail,
      settings,
    } = body as {
      name?: unknown
      displayName?: string
      cnpj?: string
      segment?: string
      timezone?: string
      currency?: string
      website?: string
      phone?: string
      adminEmail?: string
      settings?: Record<string, unknown>
    }

    const data: Record<string, unknown> = { updatedAt: new Date() }
    // "Nome empresarial" (Configurações › Empresa): obrigatório, não pode ficar vazio
    if (name !== undefined) {
      const n = typeof name === 'string' ? name.trim() : ''
      if (n.length < 2 || n.length > 120) {
        return NextResponse.json({ error: 'Informe o nome empresarial (2 a 120 caracteres).' }, { status: 400 })
      }
      data.name = n
    }
    if (displayName !== undefined) data.displayName = displayName
    if (segment !== undefined) data.segment = segment
    if (timezone !== undefined) data.timezone = timezone
    if (currency !== undefined) data.currency = currency
    // logoUrl não é mais aceito aqui (era um endereço livre que a tela mostraria): o logotipo vai por POST /api/organization/logo
    // CNPJ, site, telefone e e-mail: conferidos e guardados no formato da máscara (a tela aplica a mesma)
    for (const [key, raw, clean] of [
      ['cnpj', cnpj, cleanDocument],
      ['website', website, cleanWebsite],
      ['phone', phone, cleanPhone],
      ['adminEmail', adminEmail, cleanEmail],
    ] as const) {
      if (raw === undefined) continue
      const r = clean(raw)
      if ('error' in r) return NextResponse.json({ error: r.error, field: key }, { status: 400 })
      data[key] = r.value
    }
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
      organization: { ...updated, logoUrl: uploadedLogoUrl(updated) },
      settings: safeJsonParse<Record<string, unknown>>(updated.settingsJson, {}),
      reportsUpdated,
      excludedContacts,
    })
  } catch (error) {
    console.error('Settings PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
