import { db } from './db'
import type { AuthContext } from './api-auth'

// Registro de auditoria (B4/B9 · LGPD): quem fez o quê, em quê, quando. Só metadados: NUNCA texto de mensagem,
// telefone ou nome de cliente final. Falha ao registrar não derruba a ação principal (só vai para o log do servidor).

export type AuditAction =
  | 'member.invited' | 'member.role_changed' | 'member.status_changed' | 'member.team_changed' | 'member.removed'
  | 'member.invite_resent' | 'member.invite_canceled'
  | 'account.profile_updated' | 'account.password_changed' | 'account.sessions_revoked' | 'account.alert_emails_changed'
  | 'account.email_change_requested' | 'account.email_change_canceled' | 'account.email_changed'
  | 'account.avatar_changed' | 'account.avatar_removed' | 'organization.logo_changed' | 'organization.logo_removed'
  | 'contact.phone_viewed'
  | 'settings.updated' | 'organization.updated' | 'organization.deletion_requested' | 'organization.deletion_canceled' | 'organization.exported'
  | 'alert_rule.created' | 'alert_rule.updated'
  | 'team.created' | 'team.updated' | 'team.removed'
  | 'connection.created' | 'connection.updated' | 'connection.removed' | 'connection.auto_disconnected'
  | 'conversation.viewed' | 'privacy.exclude' | 'privacy.erase' | 'privacy.export'
  | 'subscription.changed' | 'subscription.canceled' | 'subscription.reactivated' | 'subscription.withdrawn' | 'subscription.withdrawal_failed' | 'plan.updated' | 'billing.card_updated' | 'report.generated' | 'report.exported'
  | 'report.sent' | 'report.retried' | 'report.unsubscribed'
  | 'webhook.created' | 'webhook.updated' | 'webhook.secret_rotated' | 'webhook.removed'
  | 'agent_identity.confirmed' | 'agent_identity.changed' | 'agent_identity.ignored' | 'agent_identity.undone'
  | 'simulation.run' | 'simulation.inject' | 'simulation.tick' | 'simulation.clean' | 'simulation.viewed'
  | 'nfse.run' | 'nfse.retry' | 'nfse.cancel_requested'
  | 'novelty.decided'
  | 'marketing.internal_updated' | 'marketing.gads_names_updated'
  // CRM: o alvo é o id; rótulo só para funil (nome escolhido pela empresa) e empresa cliente da plataforma. Pessoa,
  // empresa do CRM e negócio vão sem rótulo, e os detalhes levam nomes de campo, nunca o valor.
  | 'crm.enabled_changed' | 'crm.settings_updated' | 'crm.dlq_retried' | 'crm.imported' | 'crm.exported'
  | 'crm.person_created' | 'crm.person_updated' | 'crm.person_archived' | 'crm.people_merged'
  | 'crm.company_created' | 'crm.company_updated' | 'crm.company_archived'
  | 'crm.pipeline_created' | 'crm.pipeline_updated' | 'crm.stages_updated'
  | 'crm.deal_created' | 'crm.deal_updated' | 'crm.deal_moved' | 'crm.deal_closed' | 'crm.deal_reopened' | 'crm.deal_archived'
  | 'crm.activity_created' | 'crm.activity_updated' | 'crm.suggestion_accepted' | 'crm.suggestion_dismissed'

export interface AuditEntryInput {
  action: AuditAction
  targetType?: string
  targetId?: string | null
  /** Rótulo curto e não sensível (nome de regra, nome de equipe, e-mail de membro). Nunca dado de cliente final. */
  targetLabel?: string | null
  details?: Record<string, unknown>
}

/** memberId null: quem agiu não é membro (ex.: destinatário de relatório que saiu pelo link do e-mail). */
export async function audit(auth: Pick<AuthContext, 'orgId' | 'email' | 'role'> & { memberId: string | null }, entry: AuditEntryInput): Promise<void> {
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
  'member.invite_resent': 'Reenviou convite',
  'member.invite_canceled': 'Cancelou convite',
  'account.profile_updated': 'Alterou o próprio perfil',
  'account.password_changed': 'Trocou a própria senha',
  'account.sessions_revoked': 'Saiu de todos os aparelhos',
  'account.alert_emails_changed': 'Ligou ou desligou os alertas por e-mail',
  'account.email_change_requested': 'Pediu a troca do próprio e-mail de acesso',
  'account.email_change_canceled': 'Cancelou a troca do próprio e-mail',
  'account.email_changed': 'Confirmou o novo e-mail de acesso',
  'account.avatar_changed': 'Trocou a própria foto',
  'account.avatar_removed': 'Tirou a própria foto',
  'organization.logo_changed': 'Trocou o logotipo da empresa',
  'organization.logo_removed': 'Tirou o logotipo da empresa',
  'contact.phone_viewed': 'Viu o telefone completo de um cliente',
  'settings.updated': 'Alterou configurações',
  'organization.updated': 'Alterou dados da empresa',
  'organization.deletion_requested': 'Pediu o encerramento da conta e a exclusão da empresa',
  'organization.deletion_canceled': 'Desistiu da exclusão da empresa',
  'organization.exported': 'Exportou todos os dados da empresa (JSON)',
  'connection.auto_disconnected': 'Números de WhatsApp desconectados automaticamente (painel bloqueado há 2 dias)',
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
  'privacy.export': 'Exportou os dados de um cliente (portabilidade)',
  'subscription.changed': 'Alterou a assinatura',
  'subscription.canceled': 'Cancelou a renovação da assinatura',
  'subscription.withdrawn': 'Desistiu da contratação (arrependimento) e pediu o estorno',
  'subscription.withdrawal_failed': 'Pediu o arrependimento, mas o estorno foi recusado pela operadora',
  'subscription.reactivated': 'Reativou a renovação da assinatura',
  'plan.updated': 'Editou um plano do catálogo (operador da plataforma)',
  'nfse.run': 'Processou a fila de notas fiscais (operador da plataforma)',
  'nfse.retry': 'Tentou de novo uma nota fiscal com falha (operador da plataforma)',
  'novelty.decided': 'Decidiu sobre uma situação nova (operador da plataforma)',
  'marketing.internal_updated': 'Alterou a lista de quem é interno na medição (operador da plataforma)',
  'marketing.gads_names_updated': 'Alterou os nomes das conversões do Google Ads (operador da plataforma)',
  'nfse.cancel_requested': 'Pediu o cancelamento de uma nota fiscal (operador da plataforma)',
  'billing.card_updated': 'Trocou o cartão da assinatura',
  'report.generated': 'Gerou relatório',
  'report.exported': 'Exportou dados',
  'report.sent': 'Reenviou relatório por e-mail',
  'report.retried': 'Tentou de novo um relatório que falhou',
  'report.unsubscribed': 'Saiu dos relatórios por e-mail (link do e-mail)',
  'webhook.created': 'Configurou o webhook',
  'webhook.updated': 'Alterou o webhook',
  'webhook.secret_rotated': 'Gerou novo segredo do webhook',
  'webhook.removed': 'Removeu o webhook',
  'agent_identity.confirmed': 'Confirmou o atendente de uma identidade do WhatsApp',
  'agent_identity.changed': 'Trocou o atendente de uma identidade do WhatsApp',
  'agent_identity.ignored': 'Marcou identidade do WhatsApp como "não é atendente"',
  'agent_identity.undone': 'Desfez o vínculo de uma identidade do WhatsApp',
  'simulation.run': 'Rodou cenário(s) do ambiente de simulação',
  'simulation.inject': 'Injetou mensagem numa empresa simulada',
  'simulation.tick': 'Rodou o motor numa empresa simulada',
  'simulation.clean': 'Apagou as empresas simuladas',
  'simulation.viewed': 'Abriu uma empresa simulada',
  'crm.enabled_changed': 'Ligou ou desligou o CRM da empresa (operador da plataforma)',
  'crm.settings_updated': 'Alterou as configurações do CRM',
  'crm.dlq_retried': 'Reprocessou um evento parado da sincronização do CRM',
  'crm.imported': 'Importou pessoas para o CRM',
  'crm.exported': 'Exportou dados do CRM (CSV)',
  'crm.person_created': 'Cadastrou pessoa no CRM',
  'crm.person_updated': 'Alterou pessoa no CRM',
  'crm.person_archived': 'Arquivou pessoa no CRM',
  'crm.people_merged': 'Juntou duas pessoas duplicadas no CRM',
  'crm.company_created': 'Cadastrou empresa no CRM',
  'crm.company_updated': 'Alterou empresa no CRM',
  'crm.company_archived': 'Arquivou empresa no CRM',
  'crm.pipeline_created': 'Criou funil de vendas',
  'crm.pipeline_updated': 'Alterou funil de vendas',
  'crm.stages_updated': 'Alterou as etapas de um funil',
  'crm.deal_created': 'Criou negócio',
  'crm.deal_updated': 'Alterou negócio',
  'crm.deal_moved': 'Mudou negócio de etapa',
  'crm.deal_closed': 'Fechou negócio (ganho ou perdido)',
  'crm.deal_reopened': 'Reabriu negócio',
  'crm.deal_archived': 'Arquivou negócio',
  'crm.activity_created': 'Criou tarefa ou registro no CRM',
  'crm.activity_updated': 'Alterou tarefa ou registro no CRM',
  'crm.suggestion_accepted': 'Aceitou uma sugestão do CRM',
  'crm.suggestion_dismissed': 'Dispensou uma sugestão do CRM',
}
