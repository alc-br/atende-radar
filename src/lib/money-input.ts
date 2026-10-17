import type { ChangeEvent } from 'react'

// Máscara de valor em reais para campos de texto: a pessoa digita só números e o campo mostra 1.234,56 (centavos à
// direita, como em caixa eletrônico). O estado guarda o número "puro" em texto ("1234.56" ou "" vazio), que é o que as
// APIs e as configurações já entendem (Number/parseFloat).

const BRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1234.5" → "1.234,50"; vazio ou inválido → "". */
export function moneyDisplay(value: string | number | null | undefined): string {
  if (value === '' || value === null || value === undefined) return ''
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? BRL.format(n) : ''
}

/** Texto digitado (com ou sem máscara) → número puro em texto, com 2 casas implícitas. */
export function moneyFromTyped(typed: string): string {
  const digits = typed.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13)
  if (!digits) return ''
  return String(Number(digits) / 100)
}

/** Props de um <input> com a máscara de reais: {...moneyProps(valor, setValor)}. */
export function moneyProps(value: string, set: (v: string) => void) {
  return {
    type: 'text' as const,
    inputMode: 'numeric' as const,
    autoComplete: 'off',
    value: moneyDisplay(value),
    onChange: (e: ChangeEvent<HTMLInputElement>) => set(moneyFromTyped(e.target.value)),
  }
}
