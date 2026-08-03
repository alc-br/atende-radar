export interface TourStep {
  target: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export const TOURS: Record<string, TourStep[]> = {
  welcome: [
    {
      target: 'nav-dashboard',
      title: 'Bem-vindo ao AtendeRadar',
      body: 'Este é o menu principal. Cada item leva a uma tela do sistema — vamos destacar as mais importantes.',
      placement: 'right',
    },
    {
      target: 'nav-alerts',
      title: 'Alertas',
      body: 'Aqui aparecem os problemas detectados automaticamente: clientes sem resposta, promessas vencidas, oportunidades em risco.',
      placement: 'right',
    },
    {
      target: 'nav-connections',
      title: 'Conexões',
      body: 'Gerencie as conexões de WhatsApp da sua organização — pausar, reconectar, renomear ou remover.',
      placement: 'right',
    },
    {
      target: 'header-search',
      title: 'Busca rápida',
      body: 'Digite aqui e aperte Enter para buscar por cliente, telefone ou atendente direto na tela de Conversas.',
      placement: 'bottom',
    },
    {
      target: 'header-help',
      title: 'Precisa rever algo?',
      body: 'Clique aqui a qualquer momento para reabrir o tour da tela em que você está, ou este tour de boas-vindas de novo.',
      placement: 'bottom',
    },
  ],

  dashboard: [
    {
      target: 'dashboard-period',
      title: 'Escolha o período',
      body: 'Troque entre Hoje, Ontem, 7 ou 30 dias — todos os números da tela se recalculam pra esse período.',
      placement: 'bottom',
    },
    {
      target: 'dashboard-kpis',
      title: 'Indicadores principais',
      body: 'Cada cartão mostra um indicador de atendimento com a variação em relação ao período anterior. Passe o mouse pra ver a explicação de cada um.',
      placement: 'bottom',
    },
    {
      target: 'dashboard-priorities',
      title: 'Prioridades agora',
      body: 'As 10 conversas com maior risco de perda no momento, ordenadas pelo valor potencial em jogo. Clique em "Ver" pra abrir a conversa.',
      placement: 'top',
    },
    {
      target: 'dashboard-team-perf',
      title: 'Desempenho da equipe',
      body: 'Compare nota, tempo de resposta, oportunidades e promessas cumpridas entre os atendentes.',
      placement: 'top',
    },
  ],

  alerts: [
    {
      target: 'alerts-tabs',
      title: 'Organize por status',
      body: 'Ativos, Em acompanhamento, Resolvidos e Ignorados — cada aba filtra os alertas pelo estágio de tratamento. A aba "Regras" configura quando cada alerta é gerado.',
      placement: 'bottom',
    },
    {
      target: 'alerts-filterbar',
      title: 'Filtre o que importa',
      body: 'Busque por texto, filtre por criticidade, tipo, atendente, equipe ou confiança mínima da detecção automática.',
      placement: 'bottom',
    },
    {
      target: 'alerts-new-rule',
      title: 'Crie novas regras',
      body: 'Defina um novo gatilho de alerta escolhendo o tipo, a severidade e o tempo de espera (cooldown) entre disparos repetidos.',
      placement: 'left',
    },
  ],

  conversations: [
    {
      target: 'conversations-search',
      title: 'Busque uma conversa',
      body: 'Essa é a mesma busca do cabeçalho — filtra por nome do cliente, telefone ou atendente responsável.',
      placement: 'bottom',
    },
    {
      target: 'conversations-filters',
      title: 'Filtre por qualquer critério',
      body: 'Combine período, responsável, intenção, urgência, sentimento, etapa e mais pra chegar exatamente nas conversas que você precisa revisar.',
      placement: 'bottom',
    },
  ],

  recovery: [
    {
      target: 'recovery-metrics',
      title: 'Acompanhe a recuperação',
      body: 'Quantos itens foram criados, quantos já foram trabalhados, a taxa de contato e o valor total recuperado até agora.',
      placement: 'bottom',
    },
    {
      target: 'recovery-table',
      title: 'Trabalhe cada oportunidade',
      body: 'Passe o mouse sobre uma linha pra ver as ações: atribuir responsável, mudar o prazo, copiar o contexto, registrar tentativa ou resultado, e informar o valor recuperado.',
      placement: 'top',
    },
  ],

  team: [
    {
      target: 'team-summary',
      title: 'Visão geral da equipe',
      body: 'Total de agentes ativos, nota média composta e tempo médio de resposta da equipe inteira.',
      placement: 'bottom',
    },
    {
      target: 'team-table',
      title: 'Compare os atendentes',
      body: 'Clique em qualquer linha pra abrir o perfil detalhado daquele atendente. Clique nos cabeçalhos das colunas pra ordenar por nota, conversas, oportunidades e mais.',
      placement: 'top',
    },
  ],

  reports: [
    {
      target: 'reports-tabs',
      title: 'Tipos ou histórico',
      body: '"Tipos de Relatório" mostra os relatórios disponíveis pra gerar agora ou configurar o agendamento. "Histórico" mostra tudo que já foi gerado e o status de cada execução.',
      placement: 'bottom',
    },
    {
      target: 'reports-types',
      title: 'Gere ou agende relatórios',
      body: '"Gerar agora" cria uma execução imediata dos últimos 7 dias. "Configurar" ajusta o agendamento e os destinatários por e-mail de cada relatório.',
      placement: 'bottom',
    },
  ],

  connections: [
    {
      target: 'connections-new',
      title: 'Adicione uma conexão',
      body: 'Cadastre um novo número de WhatsApp com nome e telefone pra começar a monitorar as conversas dele.',
      placement: 'left',
    },
    {
      target: 'connections-list',
      title: 'Gerencie cada conexão',
      body: 'Reconectar, testar, renomear, desconectar ou excluir — as ações aparecem em cada cartão. Expanda "Diagnóstico" pra ver a saúde da conexão em detalhe.',
      placement: 'top',
    },
  ],

  settings: [
    {
      target: 'settings-tabs',
      title: 'Tudo configurável em um lugar',
      body: 'Dados da empresa, horário comercial, SLAs de atendimento, parâmetros financeiros, comportamento da IA, notificações, privacidade e regras de alerta — cada aba salva de forma independente com o botão Salvar no final dela.',
      placement: 'bottom',
    },
  ],

  members: [
    {
      target: 'members-add',
      title: 'Adicione um membro',
      body: 'Cadastre nome, e-mail, função e equipe de um novo colaborador da organização.',
      placement: 'left',
    },
    {
      target: 'members-table',
      title: 'Gerencie funções e acesso',
      body: 'Use o menu de ações de cada linha (ícone de três pontos) pra trocar a função do membro ou removê-lo da organização.',
      placement: 'top',
    },
  ],

  teams: [
    {
      target: 'teams-create',
      title: 'Crie uma nova equipe',
      body: 'Defina o nome da equipe e escolha um supervisor entre os agentes cadastrados.',
      placement: 'left',
    },
    {
      target: 'teams-list',
      title: 'Ative ou desative equipes',
      body: 'Cada cartão mostra o supervisor, o número de membros e permite ativar ou desativar a equipe.',
      placement: 'top',
    },
  ],

  plans: [
    {
      target: 'plans-usage',
      title: 'Acompanhe o uso do seu plano',
      body: 'Conversas, mensagens, agentes e conexões consumidos este mês em relação ao limite do seu plano atual.',
      placement: 'bottom',
    },
    {
      target: 'plans-compare',
      title: 'Compare os planos',
      body: 'Veja os limites e recursos de cada plano lado a lado, e a tabela completa de comparação logo abaixo.',
      placement: 'top',
    },
  ],

  admin: [
    {
      target: 'admin-tabs',
      title: 'Painel administrativo',
      body: 'Visão Geral resume os números da plataforma. Organizações e Usuários Globais listam e filtram os cadastros. Sistema mostra a saúde do banco, autenticação e armazenamento.',
      placement: 'bottom',
    },
    {
      target: 'admin-kpis',
      title: 'Indicadores da plataforma',
      body: 'Organizações ativas, conexões WhatsApp, usuários cadastrados, conversas de hoje, receita mensal e alertas ativos — clique em "Atualizar" no topo pra recarregar.',
      placement: 'bottom',
    },
  ],
}
