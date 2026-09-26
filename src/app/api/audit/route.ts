import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { AUDIT_LABELS, type AuditAction } from '@/lib/audit'

// Registro de auditoria da organização (mais recente primeiro). Só quem configura a empresa (admin/gestor).
export async function GET(request: Request) {
  const g = await guard('audit.view')
  if (!g.ok) return g.res
  const url = new URL(request.url)
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))
  const action = url.searchParams.get('action') || undefined
  const before = url.searchParams.get('before')
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined

  const rows = await db.auditLog.findMany({
    where: { organizationId: g.auth.orgId, ...(action ? { action } : {}), ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      actionLabel: AUDIT_LABELS[r.action as AuditAction] ?? r.action,
      actorEmail: r.actorEmail,
      actorRole: r.actorRole,
      targetType: r.targetType,
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      details: (() => { try { return r.details ? (JSON.parse(r.details) as Record<string, unknown>) : null } catch { return null } })(),
      createdAt: r.createdAt.toISOString(),
    })),
    nextBefore: rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null,
  })
}
