import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isSupportStatus, TICKET_LIST_SELECT } from '@/lib/support'
import { adminTicket, operatorGuard } from '@/lib/support-admin'

/** Chamados de suporte de todas as empresas (operador da plataforma). ?status=open|answered|resolved filtra. */
export async function GET(request: Request) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const status = new URL(request.url).searchParams.get('status')
  const where = isSupportStatus(status) ? { status } : {}
  const [tickets, open] = await Promise.all([
    db.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, select: TICKET_LIST_SELECT }),
    db.supportTicket.count({ where: { status: 'open' } }),
  ])
  return NextResponse.json({ tickets: tickets.map(adminTicket), open })
}
