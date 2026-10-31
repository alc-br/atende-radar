import type { ACTIVITY_STATUSES, ACTIVITY_TYPES, DEAL_SOURCES, LOST_REASONS, PRIORITIES } from './schemas'

// Nomes na tela para os códigos do CRM (glossário: src/content/ajuda.ts). Só tipos do schemas.ts: nada de zod no navegador.

export const LOST_REASON_LABEL: Record<(typeof LOST_REASONS)[number], string> = {
  price: 'Preço',
  no_response: 'Cliente não respondeu',
  competitor: 'Fechou com outro',
  no_stock: 'Sem estoque ou agenda',
  timing: 'Não é o momento',
  not_qualified: 'Fora do perfil',
  other: 'Outro motivo',
}

export const ACTIVITY_TYPE_LABEL: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  follow_up: 'Retorno',
  call: 'Ligação',
  whatsapp_external: 'WhatsApp (fora do AtendeRadar)',
  email: 'E-mail',
  meeting: 'Reunião',
  internal: 'Nota interna',
}

export const ACTIVITY_STATUS_LABEL: Record<(typeof ACTIVITY_STATUSES)[number], string> = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  done: 'Concluída',
  cancelled: 'Cancelada',
}

export const PRIORITY_LABEL: Record<(typeof PRIORITIES)[number], string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
}

export const DEAL_SOURCE_LABEL: Record<(typeof DEAL_SOURCES)[number], string> = {
  manual: 'Criado à mão',
  opportunity: 'Oportunidade da conversa',
  alert: 'Alerta',
  recovery: 'Recuperação',
  import: 'Importação',
  suggestion: 'Sugestão aceita',
}

export const DEAL_STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  won: 'Ganho',
  lost: 'Perdido',
  archived: 'Arquivado',
}

/** Classe .tag--{cor} do painel para a situação do negócio (a cor nunca é a única pista: o texto vai junto). */
export const DEAL_STATUS_TAG: Record<string, string> = {
  open: 'tag--azul',
  won: 'tag--verde',
  lost: 'tag--vermelho',
  archived: 'tag--cinza',
}

export const AMOUNT_SOURCE_LABEL: Record<string, string> = {
  manual: 'Informado por você',
  conversation: 'Dito na conversa',
  imported: 'Importado',
  unknown: 'Não informado',
}

/** Motivo da reabertura do negócio (CRM-03): os mesmos limites e mensagens no schema, no domínio (deals.ts) e na tela. */
export const REOPEN_REASON = {
  min: 3,
  max: 500,
  required: 'Informe o motivo da reabertura.',
  tooLong: 'Motivo com mais de 500 caracteres.',
  badChars: 'O motivo tem caracteres que não podem ser gravados.',
} as const

// Invisíveis (formato, como o espaço de largura zero, e preenchimentos) não contam para o mínimo, mas o ZWJ dos emojis
// continua aceito. Recusados: controle (fora \n, \r e \t) e surrogate solto, cujo escape estouraria o teto do JSON do
// evento, e os controles bidi, que reordenam na tela o resto da linha do histórico.
const REOPEN_INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}⠀]/gu
const REOPEN_BLOCKED = /\p{Cs}|(?![\n\r\t])\p{Cc}|[‪-‮⁦-⁩]/u

/** Erro do motivo da reabertura (já sem os espaços das pontas), ou null se ele pode ser gravado. */
export function reopenReasonError(reason: string): string | null {
  if (reason.replace(REOPEN_INVISIBLE, '').trim().length < REOPEN_REASON.min) return REOPEN_REASON.required
  if (reason.length > REOPEN_REASON.max) return REOPEN_REASON.tooLong
  if (REOPEN_BLOCKED.test(reason)) return REOPEN_REASON.badChars
  return null
}
