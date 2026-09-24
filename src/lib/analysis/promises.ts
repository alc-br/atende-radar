import { norm } from './text'

export interface ExtractedPromise {
  action: string
  dueAt: Date
}

// Marcadores de promessa da empresa ("já te retorno", "vou verificar", "te envio"...).
const PROMISE = [
  /\bja te (retorno|aviso|mando|envio|ligo|falo|passo)\b/,
  /\bte (retorno|aviso|mando|envio|ligo|falo|passo)\b/,
  /\bvou (verificar|confirmar|ver|checar|consultar|falar com|perguntar|te)\b/,
  /\bretorno (em|ate|hoje|amanha)\b/,
]

const endOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(23, 59, 0, 0)
  return x
}

/** Extrai uma promessa de retorno da mensagem da empresa, com o prazo dito (ou 24 h se não houver). */
export function extractPromise(text: string | null | undefined, now: Date): ExtractedPromise | null {
  if (!text) return null
  const t = norm(text)
  if (!PROMISE.some((r) => r.test(t))) return null

  let dueAt = new Date(now.getTime() + 24 * 3600000)
  const rel = t.match(/\bem (\d+) ?(min|minutos|minuto|hora|horas|h)\b/)
  const until = t.match(/\bate (?:as )?(\d{1,2}) ?h\b/)
  if (rel) {
    const n = Number(rel[1])
    dueAt = new Date(now.getTime() + n * (rel[2].startsWith('m') ? 60000 : 3600000))
  } else if (until) {
    dueAt = new Date(now)
    dueAt.setHours(Number(until[1]), 0, 0, 0)
    if (dueAt <= now) dueAt.setDate(dueAt.getDate() + 1)
  } else if (/\bamanha\b/.test(t)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    dueAt = endOfDay(d)
  } else if (/\bhoje\b/.test(t)) {
    dueAt = endOfDay(now)
  }

  const sentence = text.split(/(?<=[.!?\n])\s+/).find((s) => PROMISE.some((r) => r.test(norm(s)))) ?? text
  return { action: sentence.trim().slice(0, 160), dueAt }
}
