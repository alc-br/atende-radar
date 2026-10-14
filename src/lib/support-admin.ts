import { NextResponse } from 'next/server'
import { guard, isPlatformOperator, type AuthContext } from './api-auth'
import { TICKET_LIST_SELECT } from './support'
import type { Prisma } from '@prisma/client'

/** Só o operador da plataforma (PLATFORM_ADMIN_EMAILS) vê os chamados; admin de cliente recebe 403. */
export async function operatorGuard(): Promise<{ ok: true; auth: AuthContext } | { ok: false; res: NextResponse }> {
  const g = await guard()
  if (!g.ok) return g
  if (!isPlatformOperator(g.auth.email)) return { ok: false, res: NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 }) }
  return g
}

type TicketRow = Prisma.SupportTicketGetPayload<{ select: typeof TICKET_LIST_SELECT }>

/** Chamado para a tela do operador (sem os bytes da imagem; ela sai por /api/admin/support/[id]/screenshot). */
export function adminTicket(t: TicketRow) {
  return {
    id: t.id,
    organization: { id: t.organization.id, name: t.organization.displayName || t.organization.name },
    authorName: t.authorName,
    authorEmail: t.authorEmail,
    subject: t.subject,
    message: t.message,
    appVersion: t.appVersion,
    screen: t.screen,
    userAgent: t.userAgent,
    hasScreenshot: !!t.screenshotType,
    screenshotSize: t.screenshotSize,
    status: t.status,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    resolvedBy: t.resolvedBy,
    createdAt: t.createdAt.toISOString(),
  }
}
