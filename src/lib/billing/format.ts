// Validação e máscaras do checkout (rodam no navegador e no servidor; sem dependências).

export const onlyDigits = (v: string) => (v || '').replace(/\D/g, '')

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function isValidDocument(value: string): { ok: true; type: 'CPF' | 'CNPJ'; digits: string } | { ok: false } {
  const d = onlyDigits(value)
  if (d.length === 11 && isValidCpf(d)) return { ok: true, type: 'CPF', digits: d }
  if (d.length === 14 && isValidCnpj(d)) return { ok: true, type: 'CNPJ', digits: d }
  return { ok: false }
}

export function luhnValid(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

export function cardBrand(value: string): string | null {
  const d = onlyDigits(value)
  if (/^(4011(78|79)|431274|438935|451416|457393|4576(31|32)|504175|5067|509|627780|636297|636368|650|6516|6550)/.test(d)) return 'Elo'
  if (/^(606282|3841)/.test(d)) return 'Hipercard'
  if (/^3[47]/.test(d)) return 'American Express'
  if (/^4/.test(d)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard'
  if (/^3(0[0-5]|[68])/.test(d)) return 'Diners'
  return null
}

export function formatCardNumber(value: string): string {
  const d = onlyDigits(value).slice(0, 19)
  if (/^3[47]/.test(d)) return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ')
  return d.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function formatExpiry(value: string): string {
  const d = onlyDigits(value).slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

/** "MM/AA" → { month, year } se ainda não venceu; senão null. */
export function parseExpiry(value: string, now = new Date()): { month: number; year: number } | null {
  const d = onlyDigits(value)
  if (d.length !== 4 && d.length !== 6) return null
  const month = Number(d.slice(0, 2))
  const year = d.length === 4 ? 2000 + Number(d.slice(2)) : Number(d.slice(2))
  if (month < 1 || month > 12) return null
  const nowYear = now.getUTCFullYear()
  const nowMonth = now.getUTCMonth() + 1
  if (year < nowYear || (year === nowYear && month < nowMonth) || year > nowYear + 20) return null
  return { month, year }
}

export function formatDocument(value: string): string {
  const d = onlyDigits(value).slice(0, 14)
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
