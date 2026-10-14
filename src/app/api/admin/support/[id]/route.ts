import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readJson } from '@/lib/json-body'
import { TICKET_LIST_SELECT } from '@/lib/support'
import { adminTicket, operatorGuard, ticketReplies } from '@/lib/support-admin'

type Params = { params: Promise<{ id: string }> }

const notFound = () => NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 })

export async function GET(_request: Request, { params }: Params) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const { id } = await params
  const ticket = await db.supportTicket.findUnique({ where: { id }, select: TICKET_LIST_SELECT })
  return ticket ? NextResponse.json({ ticket: adminTicket(ticket), replies: await ticketReplies(id) }) : notFound()
}

/** Fecha (resolved) ou reabre (open) o chamado. Respondido (answered) vem de POST .../reply. */
export async function PATCH(request: Request, { params }: Params) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const j = await readJson<{ status?: unknown }>(request)
  if (!j.ok) return j.res
  const status = j.body.status
  if (status !== 'resolved' && status !== 'open') return NextResponse.json({ error: "status deve ser 'resolved' ou 'open'" }, { status: 400 })
  const { id } = await params
  const exists = await db.supportTicket.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return notFound()
  const ticket = await db.supportTicket.update({
    where: { id },
    data: status === 'resolved' ? { status, resolvedAt: new Date(), resolvedBy: g.auth.email } : { status, resolvedAt: null, resolvedBy: null },
    select: TICKET_LIST_SELECT,
  })
  return NextResponse.json({ ticket: adminTicket(ticket) })
}
