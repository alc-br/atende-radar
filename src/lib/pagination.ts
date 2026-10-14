/** Teto de itens por página nas listas (as telas pedem no máximo 100). */
export const MAX_PAGE_SIZE = 100

/**
 * T15 · `page` e `limit` da URL com limites: sem teto, `?limit=100000` lia a empresa inteira numa requisição só.
 * Valor ausente ou inválido usa o padrão da rota; página mínima 1.
 */
export function pageParams(searchParams: URLSearchParams, defaultLimit: number) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('limit') || '') || defaultLimit))
  return { page, limit }
}
