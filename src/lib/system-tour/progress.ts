// Progresso do "Tour pelo sistema", guardado por membro (OrganizationMember.systemTourJson).
// Funções puras: usadas pela rota /api/tours/system e pela tela (e testadas em tests/unit).

export interface ChapterProgress {
  /** Índice do passo em que a pessoa parou (0 = início). */
  step: number
  /** Capítulo concluído (chegou ao fim pelo menos uma vez). */
  done: boolean
}

export interface SystemTourProgress {
  chapters: Record<string, ChapterProgress>
  /** Último capítulo aberto: "Continuar de onde parei". */
  last: string | null
}

export const EMPTY_PROGRESS: SystemTourProgress = { chapters: {}, last: null }

const CHAPTER_ID = /^[a-z0-9-]{1,40}$/
export const MAX_STEP = 200
const MAX_CHAPTERS = 60

export const isChapterId = (v: unknown): v is string => typeof v === 'string' && CHAPTER_ID.test(v)

/** Lê o JSON do banco sem confiar nele: qualquer coisa estranha vira progresso vazio ou é descartada. */
export function parseProgress(raw: string | null | undefined): SystemTourProgress {
  if (!raw) return { chapters: {}, last: null }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { chapters: {}, last: null }
  }
  if (!data || typeof data !== 'object') return { chapters: {}, last: null }
  const src = (data as { chapters?: unknown }).chapters
  const chapters: Record<string, ChapterProgress> = {}
  if (src && typeof src === 'object') {
    for (const [id, v] of Object.entries(src as Record<string, unknown>).slice(0, MAX_CHAPTERS)) {
      if (!isChapterId(id) || !v || typeof v !== 'object') continue
      const step = Number((v as { step?: unknown }).step)
      chapters[id] = {
        step: Number.isInteger(step) && step >= 0 && step <= MAX_STEP ? step : 0,
        done: (v as { done?: unknown }).done === true,
      }
    }
  }
  const last = (data as { last?: unknown }).last
  return { chapters, last: isChapterId(last) ? last : null }
}

export interface ProgressUpdate {
  chapterId: string
  step?: number
  done?: boolean
  /** Recomeçar o capítulo: volta ao passo 0 (o "concluído" anterior continua valendo). */
  reset?: boolean
}

/** Valida o corpo do PATCH. Devolve a atualização ou uma mensagem de erro. */
export function parseUpdate(body: unknown): ProgressUpdate | string {
  if (!body || typeof body !== 'object') return 'Corpo inválido'
  const b = body as Record<string, unknown>
  if (!isChapterId(b.chapterId)) return 'chapterId inválido'
  const out: ProgressUpdate = { chapterId: b.chapterId }
  if (b.step !== undefined) {
    if (typeof b.step !== 'number' || !Number.isInteger(b.step) || b.step < 0 || b.step > MAX_STEP) return 'step inválido'
    out.step = b.step
  }
  if (b.done !== undefined) {
    if (typeof b.done !== 'boolean') return 'done inválido'
    out.done = b.done
  }
  if (b.reset !== undefined) {
    if (typeof b.reset !== 'boolean') return 'reset inválido'
    out.reset = b.reset
  }
  return out
}

/** Aplica a atualização. "Concluído" nunca volta a falso por um PATCH comum (só o passo muda). */
export function applyUpdate(progress: SystemTourProgress, u: ProgressUpdate): SystemTourProgress {
  const prev = progress.chapters[u.chapterId] ?? { step: 0, done: false }
  const next: ChapterProgress = {
    step: u.reset ? 0 : u.step ?? prev.step,
    done: prev.done || u.done === true,
  }
  const chapters = { ...progress.chapters, [u.chapterId]: next }
  // Não deixa o JSON crescer sem limite com ids inventados
  const ids = Object.keys(chapters)
  if (ids.length > MAX_CHAPTERS) delete chapters[ids[0] === u.chapterId ? ids[1] : ids[0]]
  return { chapters, last: u.chapterId }
}
