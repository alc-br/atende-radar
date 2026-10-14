import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { readJson } from '@/lib/json-body'
import { setAlertEmails, verifyUnsubscribeToken } from '@/lib/alert-email'

// "Parar de receber alertas por e-mail" sem login: o token assinado do link do e-mail identifica o membro.
// Aceita ?token= na URL (cabeçalho List-Unsubscribe, clique único do provedor de e-mail, corpo form) ou { token } em JSON
// (página /descadastrar). Só POST: um GET de antivírus/pré-visualização do link não desliga nada.
export async function POST(request: Request) {
  let token = new URL(request.url).searchParams.get('token')
  if (!token && (request.headers.get('content-type') || '').includes('application/json')) {
    const j = await readJson<{ token?: unknown }>(request, { optional: true })
    if (!j.ok) return j.res
    token = typeof j.body?.token === 'string' ? j.body.token : null
  }
  const memberId = verifyUnsubscribeToken(token)
  const member = memberId ? await db.organizationMember.findUnique({ where: { id: memberId } }) : null
  if (!member) return NextResponse.json({ error: 'Link inválido. Desligue os alertas por e-mail no seu perfil.' }, { status: 400 })

  if (member.alertEmails) {
    await setAlertEmails(member.id, false)
    await audit(
      { orgId: member.organizationId, memberId: member.id, email: member.email, role: member.role },
      { action: 'account.alert_emails_changed', targetType: 'member', targetId: member.id, targetLabel: member.email, details: { alertEmails: false, via: 'link do e-mail' } },
    )
  }
  return NextResponse.json({ ok: true })
}
