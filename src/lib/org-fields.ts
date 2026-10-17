import { formatDocument, formatPhone, isValidDocument, onlyDigits } from './billing/format'

// Campos cadastrais da empresa (Configurações › Dados da Empresa): a tela aplica a máscara e o servidor confere de novo.
// Cada função devolve { value } já no formato guardado, ou { error } com a mensagem para a tela. Vazio é permitido.

type Clean = { value: string | null } | { error: string }

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** CNPJ (ou CPF, para quem atua como pessoa física): dígitos verificadores conferidos; guardado com a máscara. */
export function cleanDocument(v: unknown): Clean {
  const s = text(v)
  if (!s) return { value: null }
  if (!isValidDocument(s).ok) return { error: 'CNPJ inválido. Confira os 14 números.' }
  return { value: formatDocument(s) }
}

/** Telefone com DDD (fixo ou celular). Aceita o +55 na frente. Guardado como (11) 99999-9999. */
export function cleanPhone(v: unknown): Clean {
  const s = text(v)
  if (!s) return { value: null }
  let d = onlyDigits(s)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return { error: 'Telefone inválido. Informe o DDD e o número (10 ou 11 dígitos).' }
  return { value: formatPhone(d) }
}

/** Site: sem o https:// ele é acrescentado; precisa ser um endereço com domínio (ex.: empresa.com.br). */
export function cleanWebsite(v: unknown): Clean {
  const s = text(v)
  if (!s) return { value: null }
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    if (!/^https?:$/.test(u.protocol) || !/\.[a-z]{2,}$/i.test(u.hostname)) throw new Error('host')
    return { value: u.toString().replace(/\/$/, '') }
  } catch {
    return { error: 'Site inválido. Exemplo: https://www.suaempresa.com.br' }
  }
}

export function cleanEmail(v: unknown): Clean {
  const s = text(v).toLowerCase()
  if (!s) return { value: null }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 254) return { error: 'E-mail do administrador inválido.' }
  return { value: s }
}
