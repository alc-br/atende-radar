// Papéis e permissões (spec §9). Fonte única usada pelas rotas de API e pela interface.
export const ROLES = ['admin', 'gestor', 'supervisor', 'analista', 'member', 'atendente', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

const ALL: Role[] = [...ROLES]
const OPERACAO: Role[] = ['admin', 'gestor', 'supervisor', 'atendente']
const GESTAO: Role[] = ['admin', 'gestor', 'supervisor']
const CONFIG: Role[] = ['admin', 'gestor']
const ADMIN: Role[] = ['admin']
const ANALISE: Role[] = ['admin', 'gestor', 'supervisor', 'analista']
const LEITURA_REL: Role[] = ['admin', 'gestor', 'supervisor', 'analista', 'viewer']

export const PERMISSIONS = {
  'dashboard.view': ALL,
  'notifications.view': ALL,
  'tours.use': ALL,
  'alerts.view': ALL,
  'alerts.manage': OPERACAO,
  'alert_rules.view': GESTAO,
  'alert_rules.manage': CONFIG,
  'conversations.view': OPERACAO,
  'conversations.manage': GESTAO,
  'recovery.manage': OPERACAO,
  'reports.view': LEITURA_REL,
  'reports.generate': ANALISE,
  'reports.configure': CONFIG,
  'agents.view': ANALISE,
  'agents.manage': CONFIG,
  'teams.view': GESTAO,
  'teams.manage': CONFIG,
  'members.view': GESTAO,
  'members.manage': ADMIN,
  'connections.view': GESTAO,
  'connections.manage': ADMIN,
  'settings.manage': CONFIG,
  'privacy.manage': CONFIG,
  'audit.view': CONFIG,
  'billing.manage': ADMIN,
  'organization.delete': ADMIN, // encerrar a conta: só o dono (o admin criado no cadastro e quem ele promover)
  'plans.view': ADMIN, // a tela usa a assinatura (billing), restrita ao admin
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

/** Nome da função para pessoas (telas e e-mails): nunca o código (viewer, member...). */
export const ROLE_NAMES: Record<Role, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  supervisor: 'Supervisor',
  analista: 'Analista',
  member: 'Membro',
  atendente: 'Atendente',
  viewer: 'Visualizador',
}
export const roleName = (role: string) => (isRole(role) ? ROLE_NAMES[role] : role)

/** O que cada função acessa, em palavras, para quem escolhe a função de um membro. Segue a tabela PERMISSIONS acima
 *  (tests/unit/role-descriptions.unit.spec.ts confere os pontos principais); mudou a tabela, revise o texto. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Acesso total: conexões do WhatsApp, membros, planos e pagamento, configurações, além de tudo que as outras funções fazem.',
  gestor: 'Configura regras de alerta, relatórios, equipes, agentes e privacidade, e vê a auditoria. Vê conversas, membros e conexões. Não gerencia membros, conexões nem pagamento.',
  supervisor: 'Acompanha a operação: conversas, alertas, recuperação de clientes, relatórios e desempenho dos atendentes. Vê equipes, membros e conexões. Não muda configurações.',
  analista: 'Foco em análise: vê e gera relatórios e acompanha o desempenho dos atendentes, além da Visão Geral e dos alertas. Não abre as conversas.',
  member: 'Acesso básico: Visão Geral, alertas e notificações, só para consulta.',
  atendente: 'Atende: vê as conversas, trata os alertas e faz a recuperação de clientes. Não vê relatórios nem configurações.',
  viewer: 'Só leitura: Visão Geral, alertas e relatórios, sem alterar nada.',
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  return isRole(role) && (PERMISSIONS[permission] as readonly Role[]).includes(role)
}

/** Permissão necessária para abrir cada tela do menu. `null` = qualquer usuário logado. */
export const VIEW_PERMISSION: Record<string, Permission | null> = {
  dashboard: 'dashboard.view',
  alerts: 'alerts.view',
  conversations: 'conversations.view',
  'conversation-detail': 'conversations.view',
  recovery: 'recovery.manage',
  team: 'agents.view',
  'agent-profile': 'agents.view',
  reports: 'reports.view',
  connections: 'connections.view',
  settings: 'settings.manage',
  onboarding: 'settings.manage',
  members: 'members.view',
  teams: 'teams.view',
  plans: 'plans.view',
  checkout: 'billing.manage',
  notifications: 'notifications.view',
  profile: null, // o próprio perfil: qualquer pessoa logada
  help: null, // central de ajuda e "Falar com o suporte": qualquer pessoa logada
  'system-tour': 'tours.use', // tour pelo sistema: os capítulos já vêm filtrados pelo papel
}

export function canOpenView(role: string | null | undefined, view: string): boolean {
  if (view === 'admin') return false // painel da plataforma: decidido no servidor (PLATFORM_ADMIN_EMAILS)
  if (!(view in VIEW_PERMISSION)) return true
  const perm = VIEW_PERMISSION[view]
  return perm === null || can(role, perm)
}
