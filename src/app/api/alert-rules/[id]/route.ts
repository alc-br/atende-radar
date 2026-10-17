import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { ruleUpdateData, type RuleInput } from '@/lib/alert-rules'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('alert_rules.manage')
    if (!g.ok) return g.res
    const { id } = await params
    const j = await readJson(request)
    if (!j.ok) return j.res
    const body = j.body
    const existing = await db.alertRule.findFirst({ where: { id, organizationId: g.auth.orgId } })
    if (!existing) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 })
    }
    const parsed = await ruleUpdateData(g.auth.orgId, existing, body as RuleInput)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: parsed.status })
    const data = parsed.data

    const updated = await db.alertRule.update({
      where: { id },
      data,
    })
    await audit(g.auth, { action: 'alert_rule.updated', targetType: 'alert_rule', targetId: id, targetLabel: updated.name, details: { keys: Object.keys(data) } })

    return NextResponse.json({ success: true, rule: updated })
  } catch (error) {
    console.error('Alert rule update error:', error)
    return NextResponse.json({ error: 'Failed to update alert rule' }, { status: 500 })
  }
}
