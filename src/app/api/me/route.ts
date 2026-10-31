import { NextResponse } from 'next/server'
import { guard, isPlatformOperator } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { deletionInfo } from '@/lib/org-deletion'
import { avatarUrl, logoUrl } from '@/lib/uploads'
import { orgLock } from '@/lib/billing/lock'
import { isInternalOrg } from '@/lib/internal'
import { activationEventId } from '@/lib/conversions'
import { safeTimezone } from '@/lib/crm/agenda'
import { crmMe } from '@/lib/crm/flags'

// Quem sou eu: papel atual (vem do banco, não do cookie) e se sou operador da plataforma. A interface usa isto para montar o menu.
export async function GET() {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const { memberId, orgId, role, email, name, emailVerified, team } = g.auth
  // Nome da empresa para o seletor da barra superior
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, displayName: true, timezone: true, logoType: true, logoUpdatedAt: true, deletionRequestedAt: true, deletionScheduledFor: true } })
  const media = await db.organizationMember.findUnique({ where: { id: memberId }, select: { id: true, avatarType: true, avatarUpdatedAt: true } })
  // medição: empresa interna não manda conversão do navegador; a ativação (1ª conexão do WhatsApp) vai ao dataLayer
  // nas 48 h seguintes (a janela de deduplicação da Meta), uma vez por navegador
  const internal = await isInternalOrg(orgId).catch(() => false)
  const first = internal ? null : await db.productMilestone.findUnique({ where: { organizationId_name: { organizationId: orgId, name: 'first_connection' } }, select: { reachedAt: true } })
  const activation = first && Date.now() - first.reachedAt.getTime() < 48 * 3600_000 ? { eventId: activationEventId(orgId) } : null
  return NextResponse.json({
    member: { id: memberId, name, email, role, emailVerified, team, avatarUrl: media ? avatarUrl(media) : null },
    organizationId: orgId,
    organizationName: org?.displayName || org?.name || null,
    organizationLogoUrl: org ? logoUrl(org) : null,
    isPlatformOperator: isPlatformOperator(g.auth),
    internal,
    activation,
    // exclusão da empresa pedida pelo dono: a faixa de aviso aparece para todos os membros
    organizationDeletion: org ? deletionInfo(org) : null,
    // empresa sem plano (teste vencido ou assinatura encerrada): a interface mostra só Planos (o operador nunca é bloqueado)
    // CRM comercial ligado nesta empresa? (desligado por padrão; o menu "Comercial" só aparece ligado). Falha = desligado.
    // O fuso vai junto: os prazos das tarefas aparecem e são digitados no fuso da empresa (crm/agenda.ts)
    crm: {
      ...(await crmMe(orgId).catch(() => ({ enabled: false, flags: { autoCreateDeals: false, suggestStage: false, notifications: false, exports: false } }))),
      timezone: safeTimezone(org?.timezone),
    },
    subscriptionLock: isPlatformOperator(g.auth) ? null : await orgLock(orgId).then((l) => (l ? { reason: l.reason, since: l.since?.toISOString() ?? null } : null)),
  })
}
