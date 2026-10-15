// Regras de alerta e relatórios que toda empresa recebe ao nascer (src/lib/org-defaults.ts).
// Também são a base da empresa de demonstração (prisma/seed-data.ts), que só acrescenta ids e destinatários.
// Mudar um item aqui muda o que as empresas NOVAS recebem; as que já existem não são tocadas.

export interface DefaultAlertRule {
  name: string
  type: string
  active: boolean
  severity: string
  scopeConnections: string
  scopeTeams: string
  daysAndHours: string
  limitMinutes: number
  notificationChannels: string
  cooldownMinutes: number
  autoCloseMinutes: number | null
  exceptions: string
  /** Confiança mínima "de catálogo". Ao criar a empresa, org-defaults limita a 0,5 (o motor de palavras chega a ~0,75). */
  minConfidence: number
}

export interface DefaultReportDefinition {
  reportType: string
  name: string
  description: string
  schedule: string
  timezone: string
  daysOfWeek: string
  channels: string
  sendEmpty: boolean
}

const rule = (r: Pick<DefaultAlertRule, 'name' | 'type' | 'severity' | 'limitMinutes' | 'cooldownMinutes' | 'autoCloseMinutes' | 'minConfidence'> & { channels: string[] }): DefaultAlertRule => ({
  name: r.name,
  type: r.type,
  active: true,
  severity: r.severity,
  scopeConnections: '[]',
  scopeTeams: '[]',
  daysAndHours: '{}',
  limitMinutes: r.limitMinutes,
  notificationChannels: JSON.stringify(r.channels),
  cooldownMinutes: r.cooldownMinutes,
  autoCloseMinutes: r.autoCloseMinutes,
  exceptions: '[]',
  minConfidence: r.minConfidence,
})

export const DEFAULT_ALERT_RULES: DefaultAlertRule[] = [
  rule({ name: 'Cliente sem primeira resposta', type: 'no_response', severity: 'critical', limitMinutes: 10, channels: ['in_app', 'email'], cooldownMinutes: 30, autoCloseMinutes: null, minConfidence: 0.5 }),
  rule({ name: 'Cliente sem resposta após interação', type: 'no_response_followup', severity: 'high', limitMinutes: 30, channels: ['in_app'], cooldownMinutes: 20, autoCloseMinutes: null, minConfidence: 0.6 }),
  rule({ name: 'Pedido de preço sem retorno', type: 'pending_quote', severity: 'high', limitMinutes: 15, channels: ['in_app', 'email'], cooldownMinutes: 15, autoCloseMinutes: 120, minConfidence: 0.5 }),
  rule({ name: 'Intenção alta sem resposta', type: 'high_intent_no_reply', severity: 'critical', limitMinutes: 5, channels: ['in_app', 'email'], cooldownMinutes: 10, autoCloseMinutes: null, minConfidence: 0.7 }),
  rule({ name: 'Promessa próxima do vencimento', type: 'promise_approaching', severity: 'medium', limitMinutes: 120, channels: ['in_app'], cooldownMinutes: 60, autoCloseMinutes: null, minConfidence: 0.5 }),
  rule({ name: 'Promessa vencida', type: 'promise_overdue', severity: 'critical', limitMinutes: 0, channels: ['in_app', 'email'], cooldownMinutes: 30, autoCloseMinutes: 1440, minConfidence: 0.5 }),
  rule({ name: 'Cliente irritado', type: 'customer_frustrated', severity: 'high', limitMinutes: 5, channels: ['in_app', 'email'], cooldownMinutes: 20, autoCloseMinutes: null, minConfidence: 0.6 }),
  rule({ name: 'Conexão desconectada', type: 'connection_down', severity: 'critical', limitMinutes: 0, channels: ['in_app', 'email'], cooldownMinutes: 5, autoCloseMinutes: 60, minConfidence: 0.9 }),
]

const report = (reportType: string, name: string, description: string, schedule: string, daysOfWeek: number[], channels: string[], sendEmpty = false): DefaultReportDefinition => ({
  reportType,
  name,
  description,
  schedule,
  timezone: 'America/Sao_Paulo',
  daysOfWeek: JSON.stringify(daysOfWeek),
  channels: JSON.stringify(channels),
  sendEmpty,
})

const UTEIS = [1, 2, 3, 4, 5]

export const DEFAULT_REPORT_DEFINITIONS: DefaultReportDefinition[] = [
  report('daily', 'Relatório Diário', 'Resumo executivo do dia com métricas e prioridades.', '18:00', UTEIS, ['email']),
  report('weekly', 'Relatório Semanal', 'Evolução versus semana anterior com recomendações.', '09:00', [1], ['email']),
  report('agent', 'Relatório por Equipe', 'Desempenho individual com pontos fortes e falhas.', '17:00', [5], ['email']),
  report('lost_opportunities', 'Oportunidades Perdidas', 'Leads perdidos com causa raiz e valor estimado.', '10:00', [1], ['email']),
  report('promises', 'Relatório de Promessas', 'Promessas feitas, cumpridas e vencidas por atendente.', '17:00', UTEIS, ['email', 'in_app']),
  report('recovery', 'Relatório de Recuperação', 'Itens criados, trabalhados e receita recuperada.', '09:00', [1], ['email']),
  report('data_quality', 'Qualidade dos Dados', 'Cobertura de campos, classificações e confiança da IA.', '08:00', [1], ['email'], true),
  report('connections', 'Relatório de Conexões', 'Status das conexões, uptime e volume de mensagens.', '06:00', UTEIS, ['email']),
]
