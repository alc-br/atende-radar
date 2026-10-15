import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readJson } from '@/lib/json-body'
import { sendMailRow } from '@/lib/mailer'
import { REPLY_MAX, REPLY_MIN, SUPPORT_REPLY_KIND, SUPPORT_TICKET_HEADER, supportReplyMail, TICKET_LIST_SELECT } from '@/lib/support'
import { adminTicket, operatorGuard, ticketReplies } from '@/lib/support-admin'

type Params = { params: Promise<{ id: string }> }

/**
 * O operador responde o chamado: { message, close? }. A resposta vai por e-mail ao autor (EmailOutbox, com novas
 * tentativas automáticas se o provedor falhar) e o chamado fica "respondido" (ou "fechado", com close: true).
 * emailStatus: sent | queued (sem provedor configurado) | failed (vai tentar de novo sozinho).
 */
export async function POST(request: Request, { params }: Params) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const j = await readJson<{ message?: unknown; close?: unknown }>(request)
  if (!j.ok) return j.res
  const message = typeof j.body.message === 'string' ? j.body.message.trim() : ''
  if (message.length < REPLY_MIN) return NextResponse.json({ error: 'Escreva a resposta antes de enviar.' }, { status: 400 })
  if (message.length > REPLY_MAX) return NextResponse.json({ error: `A resposta pode ter até ${REPLY_MAX} caracteres.` }, { status: 400 })
  const close = j.body.close === true

  const { id } = await params
  const current = await db.supportTicket.findUnique({ where: { id }, select: { id: true, organizationId: true, subject: true, message: true, authorName: true, authorEmail: true } })
  if (!current) return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 })

  const mail = supportReplyMail(current, message)
  const sent = await sendMailRow({
    to: current.authorEmail,
    subject: mail.subject,
    text: mail.text,
    headers: { [SUPPORT_TICKET_HEADER]: current.id },
    kind: SUPPORT_REPLY_KIND,
    organizationId: current.organizationId,
  })

  const ticket = await db.supportTicket.update({
    where: { id },
    data: close ? { status: 'resolved', resolvedAt: new Date(), resolvedBy: g.auth.email } : { status: 'answered', resolvedAt: null, resolvedBy: null },
    select: TICKET_LIST_SELECT,
  })
  return NextResponse.json({ ticket: adminTicket(ticket), replies: await ticketReplies(id), emailStatus: sent.status }, { status: 201 })
}
