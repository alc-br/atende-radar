// Dinheiro do CRM em centavos inteiros (CRM-03). As estimativas atuais (RevenueOpportunity.expectedValue, em reais e
// Float) entram só como estimatedAmountCents, arredondadas meio-para-cima, e nunca como valor declarado ou receita.

// R$ 20 milhões: acima disso é erro de digitação, e as colunas de centavos (Int do Prisma, 32 bits) não guardam mais
// que R$ 21.474.836,47 num valor só. Somas não têm esse limite.
export const MAX_AMOUNT_CENTS = 2_000_000_000

/** Reais (Float) → centavos. null/NaN/negativo → null. */
export function reaisToCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null
  // toFixed(2) evita 0.1 + 0.2 = 0.30000000000000004 virar 30 ou 31 centavos dependendo da conta
  return Math.min(MAX_AMOUNT_CENTS, Math.round(Number(value.toFixed(2)) * 100))
}

/** "1.234,56" | "1234.56" | "R$ 99" → centavos. Texto inválido → null. */
export function parseBrlToCents(text: string): number | null {
  const t = text.replace(/R\$|\s/g, '')
  if (!t) return null
  // formato brasileiro (vírgula decimal, ponto de milhar em grupos de 3) ou internacional (ponto decimal, vírgula de
  // milhar em grupos de 3). Fora disso é null: "1,2,3" ou "1.2.3,45" não viram um valor inventado.
  if (/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(t)) return reaisToCents(Number(t.replace(/\./g, '').replace(',', '.')))
  if (/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(t)) return reaisToCents(Number(t.replace(/,/g, '')))
  return null
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Para tela: null = "Valor não informado" (nunca R$ 0,00). */
export function formatCents(cents: number | null | undefined, empty = 'Valor não informado'): string {
  if (cents === null || cents === undefined) return empty
  return brl.format(cents / 100)
}
