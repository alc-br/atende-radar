import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { setAlertEmails } from '@/lib/alert-email'

// Preferência de notificação da PRÓPRIA pessoa logada: receber ou não alertas por e-mail.

export async function GET() {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const m = await db.organizationMember.findUnique({ where: { id: g.auth.memberId }, select: { alertEmails: true } })
  return NextResponse.json({ alertEmails: m?.alertEmails ?? true })
}

export async function PATCH(request: Request) {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const j = await readJson<{ alertEmails?: unknown }>(request)
  if (!j.ok) return j.res
  if (typeof j.body.alertEmails !== 'boolean') return NextResponse.json({ error: 'Informe alertEmails (true ou false).' }, { status: 400 })
  const alertEmails = j.body.alertEmails
  const current = await db.organizationMember.findUnique({ where: { id: g.auth.memberId }, select: { alertEmails: true } })
  if (current?.alertEmails !== alertEmails) {
    await setAlertEmails(g.auth.memberId, alertEmails)
    await audit(g.auth, { action: 'account.alert_emails_changed', targetType: 'member', targetId: g.auth.memberId, targetLabel: g.auth.email, details: { alertEmails } })
  }
  return NextResponse.json({ success: true, alertEmails })
}
