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
  'plans.view': ADMIN, // a tela usa a assinatura (billing), restrita ao admin
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

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
  notifications: 'notifications.view',
}

export function canOpenView(role: string | null | undefined, view: string): boolean {
  if (view === 'admin') return false // painel da plataforma: decidido no servidor (PLATFORM_ADMIN_EMAILS)
  if (!(view in VIEW_PERMISSION)) return true
  const perm = VIEW_PERMISSION[view]
  return perm === null || can(role, perm)
}
