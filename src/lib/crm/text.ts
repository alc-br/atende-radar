import { phoneHash } from '@/lib/phone-hash'

// Normalização para busca e deduplicação do CRM (CRM-01). Nunca deduplica entre empresas: as chaves levam o
// organizationId. phoneLast4 nunca é chave de identidade.

/** minúsculas, sem acento e com espaços simples (busca por nome). */
export function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function normEmail(s: string | null | undefined): string | null {
  const v = (s || '').trim().toLowerCase()
  return v || null
}

/** Só dígitos; aceita +55, espaços, parênteses e traços. 10 a 15 dígitos, ou null. */
export function phoneDigits(s: string | null | undefined): string | null {
  const d = (s || '').replace(/\D/g, '')
  if (d.length < 10 || d.length > 15) return null
  // número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55, igual à ingestão do WhatsApp
  return d.length <= 11 ? `55${d}` : d
}

/** Chaves únicas de duplicidade de pessoa ativa (CrmPerson.phoneKey / emailKey). */
export const personPhoneKey = (orgId: string, digits: string) => `${orgId}:${phoneHash(orgId, digits)}`
export const personEmailKey = (orgId: string, emailNorm: string) => `${orgId}:${emailNorm}`

/** Texto livre curto: corta e tira caracteres de controle (o React já escapa HTML na tela). */
export function cleanText(s: string, max: number): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)
}
