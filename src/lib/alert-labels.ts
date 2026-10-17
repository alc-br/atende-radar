// Nomes legíveis e explicações das regras de alerta, usados na tela Alertas (aba Regras e "Nova regra")
// e em Configurações › Regras de Alerta. Nunca mostrar o código (no_response, in_app...) para a pessoa.

export const ALERT_TYPE_LABELS: Record<string, string> = {
  no_response: 'Sem resposta',
  slow_response: 'Resposta lenta',
  ignored_question: 'Pergunta ignorada',
  pending_quote: 'Orçamento pendente',
  overdue_promise: 'Promessa vencida',
  abandoned_lead: 'Lead abandonado',
  customer_frustrated: 'Cliente frustrado',
  quota_warning: 'Conversas do mês perto do limite',
  no_response_followup: 'Sem resposta (follow-up)',
  high_intent_no_reply: 'Alta intenção sem resposta',
  promise_approaching: 'Promessa perto de vencer',
  promise_overdue: 'Promessa vencida',
  connection_down: 'Conexão desconectada',
}

/** Tipos oferecidos em "Nova regra" (overdue_promise é o nome antigo de promise_overdue: continua funcionando, mas não é oferecido). */
export const SELECTABLE_RULE_TYPES = Object.keys(ALERT_TYPE_LABELS).filter((t) => t !== 'overdue_promise')

/** O que o número da regra (limitMinutes) quer dizer em cada tipo: prazo em minutos, % do limite do plano ou nada. */
export type RuleLimitKind = 'minutes' | 'percent' | 'none'
export const RULE_LIMIT_KIND: Record<string, RuleLimitKind> = {
  no_response: 'minutes',
  slow_response: 'minutes',
  no_response_followup: 'minutes',
  ignored_question: 'minutes',
  pending_quote: 'minutes',
  high_intent_no_reply: 'minutes',
  customer_frustrated: 'minutes',
  promise_approaching: 'minutes',
  abandoned_lead: 'minutes',
  overdue_promise: 'none',
  promise_overdue: 'none',
  connection_down: 'none',
  quota_warning: 'percent',
}
export const ruleLimitKind = (type: string): RuleLimitKind => RULE_LIMIT_KIND[type] ?? 'minutes'

/** Valor sugerido ao escolher o tipo (o mesmo que o servidor usa quando a regra chega sem número). */
export const RULE_DEFAULT_LIMIT: Record<string, number> = {
  no_response: 10,
  slow_response: 30,
  no_response_followup: 30,
  ignored_question: 15,
  pending_quote: 15,
  high_intent_no_reply: 5,
  customer_frustrated: 5,
  promise_approaching: 120,
  abandoned_lead: 60,
  overdue_promise: 0,
  promise_overdue: 0,
  connection_down: 0,
  quota_warning: 80,
}
export const ruleDefaultLimit = (type: string) => RULE_DEFAULT_LIMIT[type] ?? 10

/** Rótulo do campo numérico da regra na tela, conforme o tipo. */
export const RULE_LIMIT_LABEL: Record<Exclude<RuleLimitKind, 'none'>, string> = {
  minutes: 'Disparar depois de (minutos)',
  percent: 'Avisar ao chegar em (% do limite de conversas do mês)',
}

export const ALERT_CHANNEL_LABELS: Record<string, string> = {
  in_app: 'No sistema',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  webhook: 'Webhook',
}

export const alertTypeLabel = (type: string) => ALERT_TYPE_LABELS[type] ?? type
export const alertChannelLabel = (ch: string) => ALERT_CHANNEL_LABELS[ch] ?? ch

/** Textos do (?) ao lado de Tipo, Severidade, Cooldown e Canais. */
export const ALERT_RULE_HELP = {
  tipo:
    'A situação que a regra vigia nas conversas. Exemplos: "Sem resposta" quando o cliente escreveu e ninguém respondeu dentro do prazo; "Cliente frustrado" quando a análise percebe irritação; "Promessa vencida" quando o atendente prometeu algo com prazo e o prazo passou.',
  severidade:
    'O peso do alerta. Crítico e Alto aparecem primeiro e em destaque, para a equipe tratar antes; Atenção pede um olhar; Informativo só registra o que aconteceu.',
  cooldown:
    'Tempo de espera, em minutos, depois que alguém ignora um alerta ou marca como falso positivo: nesse intervalo o mesmo alerta não volta a aparecer naquela conversa. Evita insistir no que a equipe já decidiu. Com 0, não há espera.',
  prazo:
    'Quanto tempo a situação precisa durar para o alerta abrir. Ex.: em "Sem resposta" com 10, o alerta abre quando o cliente espera 10 minutos sem resposta. Conta só o expediente se em Configurações › Horários a regra fora do expediente for "ignora".',
  canais:
    'Por onde o alerta avisa. "No sistema" é o sino e a tela Alertas. "E-mail" vai para os membros que veem o alerta e deixaram o aviso por e-mail ligado em Meu perfil.',
} as const
