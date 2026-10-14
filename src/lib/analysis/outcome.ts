import { normChat } from './text'
import type { AnalysisMessage } from './classify'

/*
 * B6 · Resultado automático da conversa (além do abandono): venda fechada ou perda declarada.
 *
 * Precisão acima de cobertura: só frases inequívocas, no passado ("paguei", "comprei em outro lugar"), nunca pergunta,
 * condição ou negação. Na dúvida (sinal de venda E de perda na mesma conversa, ou o cliente voltou a querer comprar
 * depois de desistir) não decide nada: fica para o humano.
 * O motor só usa isto em conversa aberta, com oportunidade de venda e sem resultado dado por uma pessoa.
 */

export type OutcomeKind = 'won' | 'lost'
export interface DetectedOutcome {
  outcome: OutcomeKind
  /** Por que decidiu (vai para o motivo na Recuperação e para os testes). */
  reason: string
  /** Índice da mensagem que decidiu. */
  messageIndex: number
}

export const OUTCOME_REASON = {
  paid: 'O cliente informou o pagamento',
  companyConfirmed: 'A empresa confirmou o pagamento, o pedido ou o horário',
  customerConfirmed: 'O cliente confirmou o horário ou o pedido',
  lost: 'O cliente disse que comprou com outro ou desistiu',
} as const

// --- venda: o cliente diz que pagou / mandou o comprovante ---
const PAID = [
  /\b(ja )?(paguei|efetuei o pagamento|realizei o pagamento|depositei)\b/,
  /\bfiz (o |a )?(pix|pagamento|deposito|transferencia)\b/,
  /\b(pix|pagamento|deposito|transferencia) (ja )?(feito|realizado|efetuado|enviado|pago)\b/,
  /\b(segue|enviei|mandei|envio|mando|aqui esta|esta ai|ai esta|anexo) (o |meu )?comprovante\b/,
]
// "da última vez paguei 200" é lembrança de compra antiga, não esta venda
const PAST_PURCHASE = /\b(ultima vez|outra vez|ano passado|mes passado|semana passada|na epoca|antigamente|da outra|anterior)\b/

// --- venda: a empresa confirma que recebeu / confirmou (mensagem da empresa, no passado) ---
const COMPANY_CONFIRMED = [
  /\b(recebemos|recebi|confirmamos|confirmei) (o |a |seu |sua |o seu |a sua )?(pagamento|pix|comprovante|deposito|transferencia)\b/,
  /\b(pagamento|pix|deposito|transferencia) (foi |esta |ja foi )?(recebid|confirmad|aprovad|compensad)[oa]\b/,
  /\b(pedido|compra|matricula) (foi |esta |ja foi |ficou )?(confirmad|aprovad|efetivad)[oa]\b/,
  /\b(agendamento|consulta|horario|reserva|visita|avaliacao|sessao) (foi |esta |ja foi |ficou )?(confirmad|agendad|marcad|reservad)[oa] (para|no dia|dia|amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|as \d)/,
]

// --- venda: o cliente confirma o horário/pedido que a empresa ofereceu ---
const OFFER_TO_CONFIRM = /\b(confirm|posso (agendar|marcar|reservar)|podemos (agendar|marcar|reservar)|fica (agendad|marcad|reservad)|ficou (agendad|marcad|reservad)|(agendad|marcad|reservad)[oa] para|deixo (agendad|marcad|reservad))/
const CUSTOMER_CONFIRMS = /^(sim[,.!]? *)?(ok[,.!]? *)?(pode )?(confirmad[oa]|confirmo|pode confirmar|esta confirmado|fechado|combinado)\b/

// --- perda: comprou com outro / desistiu ---
const LOST = [
  /\b(ja )?(comprei|fechei|contratei|fiz|agendei|marquei|encontrei|achei|resolvi) (com |em |n[ao] |numa |num |por )?(outr[ao]s? |a outra |o outro )(lugar|loja|empresa|clinica|oficina|fornecedor|lado|pessoa|profissional|site|consultorio|escola|academia|marca|vendedor|concorrente)/,
  /\b(ja )?(comprei|fechei|contratei) com (a |o )?concorr/,
  /\bdesisti(mos)?\b(?! d[aoe]s? (horario|dia|data|segunda|terca|quarta|quinta|sexta|sabado|domingo|manha|tarde|noite|esperar|aguardar|cor|tamanho|modelo))/,
  /\bperdi o interesse\b/, /\bnao (tenho|temos) mais interesse\b/,
  /\bnao (vou|vamos) mais (querer|precisar|fechar|comprar|fazer|contratar|agendar)\b/,
  /\bnao quero mais(?! (nada|nenhuma|nenhum|esperar|aguardar|ficar))\b/,
]
// Volta a querer depois de desistir ("desisti... na verdade quero sim"): não decide
const WANTS_AGAIN = [/\bna verdade\b/, /\bmudei de ideia\b/, /(quero|queria|gostaria de|vou) (comprar|fechar|contratar|agendar|marcar|levar)/, /\bainda (tem|da|consigo)\b/, /\bpode ser\b/, /\bremarc/]

// Negação/condição/futuro logo antes do sinal não conta ("ainda não paguei", "se eu fechar com outra", "quase desisti")
const NEGATED = /\b(nao|nunca|nem|se|caso|quando|assim que|antes de|depois que|sera|vai ser|vou|quase)\s+(\S+\s+){0,3}$/

/** Alguma frase afirmativa (sem "?" e sem negação antes) casa com os padrões? */
function affirmative(text: string, patterns: RegExp[], skip?: RegExp): boolean {
  for (const raw of text.split(/(?<=[.!?\n])\s*/)) {
    const s = raw.trim()
    if (!s || s.endsWith('?') || (skip && skip.test(s))) continue
    for (const p of patterns) {
      const m = p.exec(s)
      if (m && !NEGATED.test(s.slice(0, m.index))) return true
    }
  }
  return false
}

/** Resultado que as mensagens deixam claro, ou null (na dúvida, null). Olha a conversa inteira, em ordem. */
export function detectOutcome(messages: AnalysisMessage[]): DetectedOutcome | null {
  let won: DetectedOutcome | null = null
  let lost: DetectedOutcome | null = null
  let lastOffer = -1
  let wantsAgainAfterLost = false

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const t = normChat(m.text)
    if (!t) continue
    if (m.direction === 'outbound') {
      if (!won && affirmative(t, COMPANY_CONFIRMED)) won = { outcome: 'won', reason: OUTCOME_REASON.companyConfirmed, messageIndex: i }
      if (OFFER_TO_CONFIRM.test(t)) lastOffer = i
      continue
    }
    if (!won && affirmative(t, PAID, PAST_PURCHASE)) won = { outcome: 'won', reason: OUTCOME_REASON.paid, messageIndex: i }
    // confirmação curta do cliente logo depois de a empresa oferecer/pedir confirmação do horário ou pedido
    const answersOffer = lastOffer >= 0 && messages.slice(lastOffer + 1, i).every((x) => x.direction === 'inbound')
    if (!won && answersOffer && t.split(' ').length <= 8 && !t.includes('?') && CUSTOMER_CONFIRMS.test(t)) {
      won = { outcome: 'won', reason: OUTCOME_REASON.customerConfirmed, messageIndex: i }
    }
    // perda: a mensagem inteira sem pergunta ("já fechei com outra, vocês fazem manutenção?" fica para o humano)
    if (!t.includes('?') && affirmative(t, LOST)) {
      lost ??= { outcome: 'lost', reason: OUTCOME_REASON.lost, messageIndex: i }
      wantsAgainAfterLost = false
    } else if (lost && WANTS_AGAIN.some((r) => r.test(t))) wantsAgainAfterLost = true
  }

  if (won && lost) return null // sinais opostos: fica para o humano
  if (lost) return wantsAgainAfterLost ? null : lost
  return won
}
