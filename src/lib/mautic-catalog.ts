// Como o AtendeRadar fica organizado no Mautic (criado por scripts/mautic-setup.ts; preenchido por src/lib/mautic.ts).
// Convenção da instância (D:\ALC\ferramentas\mautic): categoria do sistema, sistema_origem, tag e prefixo "[AtendeRadar]".

export const MAUTIC_CATEGORY = { title: 'AtendeRadar', color: '0E7C66', description: 'Ativos do AtendeRadar (segmentos, e-mails, campanhas, formulários).' }

/** Tags de ORIGEM do contato. Situação (papel, plano, assinatura) fica nos campos ar_*, que o sistema mantém atualizados. */
export const MAUTIC_TAGS = [
  { tag: 'atenderadar', description: 'Contato que veio do AtendeRadar (todos).' },
  { tag: 'atenderadar-membro', description: 'Usuário do AtendeRadar (membro de uma empresa cliente).' },
  { tag: 'atenderadar-destinatario', description: 'Só recebe e-mails do AtendeRadar (ex.: relatório para um endereço extra); não é usuário.' },
] as const

const list = (pairs: [string, string][]) => ({ list: pairs.map(([value, label]) => ({ label, value })) })

export const AR_ROLES: [string, string][] = [
  ['admin', 'Administrador (dono da conta)'], ['gestor', 'Gestor'], ['supervisor', 'Supervisor'], ['analista', 'Analista'],
  ['member', 'Membro'], ['atendente', 'Atendente'], ['viewer', 'Leitura'],
]
export const AR_MEMBER_STATUS: [string, string][] = [['ativo', 'Ativo'], ['convidado', 'Convite pendente'], ['suspenso', 'Suspenso']]
export const AR_PLANS: [string, string][] = [['essencial', 'Essencial'], ['gestao', 'Growth'], ['performance', 'Performance']]
export const AR_SUBSCRIPTION: [string, string][] = [
  ['teste', 'Teste grátis'], ['teste_vencido', 'Teste vencido (não assinou)'], ['ativa', 'Assinatura ativa'],
  ['cancelamento_agendado', 'Cancelamento agendado'], ['inadimplente', 'Pagamento pendente'], ['cancelada', 'Cancelada'],
  ['sem_assinatura', 'Sem assinatura'],
]

export const MAUTIC_FIELDS = [
  { alias: 'ar_papel', label: 'AtendeRadar · Papel', type: 'select', properties: list(AR_ROLES) },
  { alias: 'ar_membro', label: 'AtendeRadar · Situação do usuário', type: 'select', properties: list(AR_MEMBER_STATUS) },
  { alias: 'ar_plano', label: 'AtendeRadar · Plano', type: 'select', properties: list(AR_PLANS) },
  { alias: 'ar_assinatura', label: 'AtendeRadar · Assinatura', type: 'select', properties: list(AR_SUBSCRIPTION) },
  { alias: 'ar_teste_fim', label: 'AtendeRadar · Fim do teste grátis', type: 'date', properties: {} },
  { alias: 'ar_cadastro', label: 'AtendeRadar · Cadastro', type: 'datetime', properties: {} },
  { alias: 'ar_ultimo_acesso', label: 'AtendeRadar · Último acesso', type: 'datetime', properties: {} },
  { alias: 'ar_email_confirmado', label: 'AtendeRadar · E-mail confirmado', type: 'boolean', properties: { no: 'Não', yes: 'Sim' } },
  { alias: 'ar_empresa_id', label: 'AtendeRadar · Id da empresa', type: 'text', properties: {} },
] as const

type Filter = { glue: 'and' | 'or'; field: string; object: 'lead'; type: string; operator: string; properties: { filter: unknown } }
const f = (field: string, type: string, operator: string, filter: unknown): Filter => ({ glue: 'and', field, object: 'lead', type, operator, properties: { filter } })
const fromAR = f('sistema_origem', 'multiselect', 'in', ['atenderadar'])
const seg = (alias: string, name: string, description: string, ...more: Filter[]) => ({ alias: `atenderadar-${alias}`, name: `[AtendeRadar] ${name}`, description, filters: [fromAR, ...more] })

export const MAUTIC_SEGMENTS = [
  seg('todos', 'Todos', 'Todo contato que veio do AtendeRadar (usuários e destinatários).'),
  seg('usuarios', 'Usuários', 'Membros de empresas clientes (qualquer papel e situação).', f('tags', 'tags', 'in', ['atenderadar-membro'])),
  seg('admins', 'Donos da conta (administradores)', 'Quem decide a assinatura: público dos e-mails de teste, plano e cobrança.', f('ar_papel', 'select', '=', 'admin'), f('ar_membro', 'select', '=', 'ativo')),
  seg('gestores', 'Gestores e supervisores', 'Quem acompanha a operação no dia a dia.', f('ar_papel', 'select', 'in', ['gestor', 'supervisor']), f('ar_membro', 'select', '=', 'ativo')),
  seg('equipe', 'Equipe de atendimento', 'Atendentes, analistas, membros e leitura.', f('ar_papel', 'select', 'in', ['atendente', 'analista', 'member', 'viewer']), f('ar_membro', 'select', '=', 'ativo')),
  seg('teste', 'Em teste grátis', 'Empresas no período de teste.', f('ar_assinatura', 'select', '=', 'teste')),
  seg('teste-vencido', 'Teste vencido sem assinar', 'O teste acabou e a empresa não assinou (reconquista).', f('ar_assinatura', 'select', '=', 'teste_vencido')),
  seg('clientes', 'Clientes ativos', 'Assinatura paga em dia.', f('ar_assinatura', 'select', '=', 'ativa')),
  seg('cancelamento-agendado', 'Cancelamento agendado', 'Pediram para cancelar; a assinatura vale até o fim do período pago.', f('ar_assinatura', 'select', '=', 'cancelamento_agendado')),
  seg('inadimplentes', 'Pagamento pendente', 'Cobrança recusada ou atrasada.', f('ar_assinatura', 'select', '=', 'inadimplente')),
  seg('cancelados', 'Cancelados', 'Assinatura encerrada (reconquista).', f('ar_assinatura', 'select', '=', 'cancelada')),
  seg('plano-essencial', 'Plano Essencial', 'Empresas no plano Essencial (teste ou pago).', f('ar_plano', 'select', '=', 'essencial')),
  seg('plano-growth', 'Plano Growth', 'Empresas no plano Growth (teste ou pago).', f('ar_plano', 'select', '=', 'gestao')),
  seg('plano-performance', 'Plano Performance', 'Empresas no plano Performance (teste ou pago).', f('ar_plano', 'select', '=', 'performance')),
  seg('convite-pendente', 'Convite pendente', 'Foram convidados e ainda não criaram a senha.', f('ar_membro', 'select', '=', 'convidado')),
  seg('email-nao-confirmado', 'E-mail não confirmado', 'Usuários ativos que ainda não confirmaram o e-mail.', f('ar_membro', 'select', '=', 'ativo'), f('ar_email_confirmado', 'boolean', '=', '0')),
]
