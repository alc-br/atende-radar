// Canais de uma regra de alerta. São os que o motor e o envio de e-mail entendem:
//   in_app: sino e tela Alertas (src/lib/analysis/engine.ts);
//   email:  e-mail aos membros que veem o alerta (src/lib/alert-email.ts).
// Webhook não é canal de regra: vale para todos os alertas da empresa (Configurações › Webhook, src/lib/webhooks.ts).
export const RULE_CHANNELS = ['in_app', 'email'] as const
export type RuleChannel = (typeof RULE_CHANNELS)[number]

export const RULE_CHANNEL_LABELS: Record<RuleChannel, string> = {
  in_app: 'No sistema',
  email: 'E-mail',
}

export const RULE_CHANNELS_ERROR = 'Escolha pelo menos um canal: no sistema (in_app) ou e-mail (email).'

/** Valida a lista vinda do cliente: só canais conhecidos, sem repetição, pelo menos um. null = inválida. */
export function parseRuleChannels(value: unknown): RuleChannel[] | null {
  if (!Array.isArray(value)) return null
  const out: RuleChannel[] = []
  for (const v of value) {
    if (typeof v !== 'string' || !(RULE_CHANNELS as readonly string[]).includes(v)) return null
    if (!out.includes(v as RuleChannel)) out.push(v as RuleChannel)
  }
  return out.length > 0 ? out : null
}
