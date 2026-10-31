import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard, isPlatformOperator, notFound } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { crmKilled } from '@/lib/crm/flags'
import { zodMessage } from '@/lib/crm/http'
import { adminCrmToggle } from '@/lib/crm/schemas'
import { setCrmEnabled } from '@/lib/crm/tenant'

// Operador da plataforma liga ou desliga o CRM de uma empresa (D1/D7: desligado por padrão, liberação por empresa).
// Ligar provisiona o funil padrão (idempotente); desligar só esconde: os dados ficam e voltam ao religar.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (!g.ok) return g.res
  if (!isPlatformOperator(g.auth)) {
    return NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 })
  }
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
    return NextResponse.json({ error: 'Envie os dados em JSON.' }, { status: 415 })
  }
  const j = await readJson(request)
  if (!j.ok) return j.res
  const parsed = adminCrmToggle.safeParse(j.body)
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 })
  const { id } = await params
  const org = await db.organization.findUnique({ where: { id }, select: { id: true, displayName: true } })
  if (!org) return notFound('Organization')

  await setCrmEnabled(id, parsed.data.enabled, g.auth.memberId)
  await audit({ ...g.auth, orgId: id }, { action: 'crm.enabled_changed', targetType: 'organization', targetId: id, targetLabel: org.displayName, details: { enabled: parsed.data.enabled, operator: true } })
  // CRM_DISABLED=1 no servidor desliga tudo, por cima da flag: avisa para a tela não mostrar "ligado" sem efeito
  return NextResponse.json({ success: true, enabled: parsed.data.enabled, killSwitch: crmKilled() })
}
