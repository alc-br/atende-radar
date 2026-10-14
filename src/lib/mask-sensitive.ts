// LGPD (B9/T17): clientes colam CPF, número de cartão e até CVV no WhatsApp. Esses números nunca devem ser guardados
// nem exibidos em claro. Função pura, sem dependências: usada na entrada (ingest), no motor e nas saídas (telas/exportação).
//
// Só mascara o que passa nas verificações (dígitos do CPF, Luhn do cartão, CVV só com rótulo explícito), para não
// apagar telefone, CEP, valores, datas e números de pedido.

const allSame = (d: string) => /^(\d)\1*$/.test(d)

/** CPF válido pelos dígitos verificadores (sequências repetidas como 111.111.111-11 não valem). */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || allSame(digits)) return false
  const dv = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(digits[9]) && dv(10) === Number(digits[10])
}

/** CNPJ válido (dado da empresa, não é mascarado; serve para não confundir com cartão de 14 dígitos). */
export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || allSame(digits)) return false
  const dv = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * w[i]
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(digits[12]) && dv(13) === Number(digits[13])
}

export function luhnValid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

/** Parece cartão: 13–19 dígitos, começa como as bandeiras (2–6), 13 dígitos só Visa (4), Luhn ok. */
function looksLikeCard(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false
  if (!/^[2-6]/.test(digits) || (digits.length === 13 && digits[0] !== '4')) return false
  if (allSame(digits) || (digits.length === 14 && isValidCnpj(digits))) return false
  return luhnValid(digits)
}

// Não pode encostar em outro número (nem em "1.234" ou "12,50"): evita pegar pedaço de valor, data ou código maior.
const NB = String.raw`(?<![\d.,/])`
const NA = String.raw`(?!\d|[.,/]\d)`

// Cartão: 4-4-4-4 (espaço/traço iguais), 4-6-5 / 4-6-4 (Amex/Diners) ou 13–19 dígitos seguidos.
const CARD_RE = new RegExp(`${NB}(?:\\d{4}([ -]?)\\d{4}\\1\\d{4}\\1\\d{4}|\\d{4}([ -]?)\\d{6}\\2\\d{4,5}|\\d{13,19})${NA}`, 'g')
// CPF: 000.000.000-00, 00000000000, 000 000 000 00, 000000000-00.
const CPF_RE = new RegExp(`${NB}\\d{3}([. ]?)\\d{3}\\1\\d{3}[-. ]?\\d{2}${NA}`, 'g')
// CVV só com rótulo explícito antes: "cvv 123", "CVV: 1234", "código de segurança é 123", "cvv do cartão 123".
const CVV_RE = /\b(cvv2?|cvc2?|c[oó]d(?:igo|\.)?\s*(?:de\s+)?seguran[cç]a|c[oó]d\.?\s*seg\.?)((?:\s+do\s+cart[aã]o)?[\s:=-]*(?:(?:é|e|eh)\s+)?)(\d{3,4})(?!\d)/giu

export const MASKED_CPF = '•••.•••.•••-••'

/** Mascara CPF, cartão (fica "•••• 1234") e CVV rotulado. Texto vazio/nulo volta como veio. */
export function maskSensitive<T extends string | null | undefined>(text: T): T {
  if (!text || !/\d/.test(text)) return text
  const out = text
    .replace(CARD_RE, (m) => {
      const d = m.replace(/\D/g, '')
      return looksLikeCard(d) ? `•••• ${d.slice(-4)}` : m
    })
    .replace(CPF_RE, (m) => (isValidCpf(m.replace(/\D/g, '')) ? MASKED_CPF : m))
    .replace(CVV_RE, (_m, label: string, sep: string, code: string) => `${label}${sep}${'•'.repeat(code.length)}`)
  return out as T
}
