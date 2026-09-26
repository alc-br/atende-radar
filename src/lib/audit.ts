import { db } from './db'
import type { AuthContext } from './api-auth'

// Registro de auditoria (B4/B9 · LGPD): quem fez o quê, em quê, quando. Só metadados: NUNCA texto de mensagem,
// telefone ou nome de cliente final. Falha ao registrar não derruba a ação principal (só vai para o log do servidor).

export type AuditAction =
  | 'member.invited' | 'member.role_changed' | 'member.status_changed' | 'member.team_changed' | 'member.removed'
  | 'settings.updated' | 'organization.updated'
  | 'alert_rule.created' | 'alert_rule.updated'
  | 'team.created' | 'team.updated' | 'team.removed'
  | 'connection.created' | 'connection.updated' | 'connection.removed'
  | 'conversation.viewed' | 'privacy.exclude' | 'privacy.erase'
  | 'subscription.changed' | 'report.generated' | 'report.exported'

export interface AuditEntryInput {
  action: AuditAction
  targetType?: string
  targetId?: string | null
  /** Rótulo curto e não sensível (nome de regra, nome de equipe, e-mail de membro). Nunca dado de cliente final. */
  targetLabel?: string | null
  details?: Record<string, unknown>
}

export async function audit(auth: Pick<AuthContext, 'orgId' | 'memberId' | 'email' | 'role'>, entry: AuditEntryInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        organizationId: auth.orgId,
        actorMemberId: auth.memberId,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ? String(entry.targetLabel).slice(0, 200) : null,
        details: entry.details ? JSON.stringify(entry.details).slice(0, 4000) : null,
      },
    })
  } catch (e) {
    console.error('[audit] falha ao registrar', entry.action, e instanceof Error ? e.message : e)
  }
}

/** Nomes legíveis para a tela. */
export const AUDIT_LABELS: Record<AuditAction, string> = {
  'member.invited': 'Convidou membro',
  'member.role_changed': 'Trocou o papel de um membro',
  'member.status_changed': 'Alterou o status de um membro',
  'member.team_changed': 'Alterou a equipe de um membro',
  'member.removed': 'Removeu membro',
  'settings.updated': 'Alterou configurações',
  'organization.updated': 'Alterou dados da empresa',
  'alert_rule.created': 'Criou regra de alerta',
  'alert_rule.updated': 'Alterou regra de alerta',
  'team.created': 'Criou equipe',
  'team.updated': 'Alterou equipe',
  'team.removed': 'Removeu equipe',
  'connection.created': 'Cadastrou conexão de WhatsApp',
  'connection.updated': 'Alterou conexão de WhatsApp',
  'connection.removed': 'Desconectou WhatsApp',
  'conversation.viewed': 'Abriu o conteúdo de uma conversa',
  'privacy.exclude': 'Parou de monitorar um cliente',
  'privacy.erase': 'Apagou os dados de um cliente',
  'subscription.changed': 'Alterou a assinatura',
  'report.generated': 'Gerou relatório',
  'report.exported': 'Exportou dados',
}
