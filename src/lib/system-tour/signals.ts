// Pequeno barramento de eventos do "Tour pelo sistema": as telas avisam quando um cadastro deu certo
// (ex.: tourSignal('team.created') depois de criar a equipe) e o passo "faça o cadastro" avança sozinho.
// Só no navegador; fora do tour o aviso não faz nada.

export const TOUR_SIGNALS = [
  'team.created',
  'member.invited',
  'alert-rule.created',
  'connection.created',
  'report.generated',
  'report.configured',
  'settings.saved',
] as const

export type TourSignal = (typeof TOUR_SIGNALS)[number]

const EVENT = 'atenderadar:tour-signal'

export function tourSignal(name: TourSignal) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<TourSignal>(EVENT, { detail: name }))
}

/** Escuta os avisos; devolve a função que para de escutar. */
export function onTourSignal(cb: (name: TourSignal) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<TourSignal>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
