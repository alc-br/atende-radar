// Eventos para o Google Tag Manager, com os nomes do e-commerce do GA4 (docs/operacao/medicao.md). Vão para
// window.dataLayer com ou sem o GTM carregado: a escolha no aviso de cookies (Consent Mode) decide quais tags podem lê-los.
// Nunca dado pessoal aqui (nome, e-mail, telefone, documento).
export interface DlItem {
  item_id: string
  item_name: string
  item_variant?: string
  price?: number
  quantity?: number
}

type DataLayerWindow = { dataLayer?: unknown[] }

export function dl(event: string, params: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  const w = window as unknown as DataLayerWindow
  w.dataLayer = w.dataLayer ?? []
  // o GA4 guarda o último objeto ecommerce: limpa antes de cada evento de e-commerce para um não levar os itens do outro
  if ('ecommerce' in params) w.dataLayer.push({ ecommerce: null })
  w.dataLayer.push({ event, ...params })
}

/** Um id por evento, o mesmo no navegador (pixel) e no servidor (API de Conversões), para a Meta contar uma vez. */
export const eventId = (name: string, key: string) => `${name}.${key}`

export function ecommerce(event: string, id: string, items: DlItem[], value: number, extra: Record<string, unknown> = {}) {
  dl(event, { event_id: id, ecommerce: { currency: 'BRL', value, items, ...extra } })
}

/** Uma vez por chave neste navegador (ex.: o purchase de uma assinatura, mesmo recarregando a tela). */
export function once(key: string, fn: () => void) {
  try {
    const k = `ar_dl:${key}`
    if (localStorage.getItem(k)) return
    localStorage.setItem(k, '1')
  } catch {
    // sem localStorage (janela privada bloqueada): manda assim mesmo; o event_id deduplica na Meta e o transaction_id no GA4
  }
  fn()
}
