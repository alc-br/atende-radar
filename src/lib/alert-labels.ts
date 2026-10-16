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
  quota_warning: 'Quota próxima do limite',
  no_response_followup: 'Sem resposta (follow-up)',
  high_intent_no_reply: 'Alta intenção sem resposta',
  promise_approaching: 'Promessa perto de vencer',
  promise_overdue: 'Promessa vencida',
  connection_down: 'Conexão desconectada',
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
  canais:
    'Por onde o alerta avisa. "No sistema" é o sino e a tela Alertas. "E-mail" vai para os membros que veem o alerta e deixaram o aviso por e-mail ligado em Meu perfil.',
} as const
