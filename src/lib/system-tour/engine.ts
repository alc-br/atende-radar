// Regras do "Tour pelo sistema" (sem React): quais capítulos e passos cada pessoa vê e como contar o progresso.
// Imports relativos: os testes de unidade (Playwright) carregam este arquivo sem o alias "@/".
import { can, canOpenView } from '../permissions'
import { SYSTEM_TOUR_CHAPTERS } from './content'
import type { SystemTourBlock, SystemTourChapter, SystemTourStep } from './types'
import type { SystemTourProgress } from './progress'

export interface Viewer {
  role: string | null | undefined
  isPlatformOperator: boolean
}

const opensView = (who: Viewer, view: string) => (view === 'admin' ? who.isPlatformOperator : canOpenView(who.role, view))

/** Passos do capítulo que a pessoa pode fazer (sem os que pedem permissão ou tela que ela não tem). */
export function stepsFor(chapter: SystemTourChapter, who: Viewer): SystemTourStep[] {
  return chapter.steps.filter((s) => (!s.requires || can(who.role, s.requires)) && (!s.view || opensView(who, s.view)))
}

/** Capítulos do perfil, na ordem do manual. O operador da plataforma vê também o capítulo do Admin. */
export function chaptersFor(who: Viewer, all: SystemTourChapter[] = SYSTEM_TOUR_CHAPTERS): SystemTourChapter[] {
  return all
    .filter((c) => (c.platformOnly ? who.isPlatformOperator : true))
    .filter((c) => c.views.every((v) => opensView(who, v)))
    .filter((c) => !c.requires || can(who.role, c.requires))
    .map((c) => ({ ...c, steps: stepsFor(c, who) }))
    .filter((c) => c.steps.length > 0)
}

export interface ChapterStatus {
  step: number
  total: number
  done: boolean
  started: boolean
}

export function chapterStatus(chapter: SystemTourChapter, progress: SystemTourProgress): ChapterStatus {
  const p = progress.chapters[chapter.id]
  const total = chapter.steps.length
  const step = Math.min(Math.max(p?.step ?? 0, 0), Math.max(total - 1, 0))
  return { step, total, done: !!p?.done, started: !!p && (p.step > 0 || p.done) }
}

/** Capítulo para "Continuar de onde parei": o último aberto e não concluído; senão o primeiro não concluído. */
export function resumeChapter(chapters: SystemTourChapter[], progress: SystemTourProgress): SystemTourChapter | null {
  const last = chapters.find((c) => c.id === progress.last)
  if (last && !progress.chapters[last.id]?.done) return last
  return chapters.find((c) => !progress.chapters[c.id]?.done) ?? null
}

export const allDone = (chapters: SystemTourChapter[], progress: SystemTourProgress) =>
  chapters.length > 0 && chapters.every((c) => progress.chapters[c.id]?.done)

/** Texto corrido do passo (para leitura em voz alta), sem as marcas de negrito. */
export function stepSpeechText(step: SystemTourStep): string {
  const parts: string[] = [step.title]
  for (const b of step.body as SystemTourBlock[]) {
    if (typeof b === 'string') parts.push(b)
    else parts.push(...b.list)
  }
  if (step.action) parts.push(step.action)
  return parts
    .map((p) => p.replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .map((p) => (/[.!?:]$/.test(p) ? p : `${p}.`))
    .join(' ')
}

/** Tamanho máximo da narração de um passo (fala de ~30 a 40 segundos). */
export const NARRATION_MAX = 600

/** O que a voz fala no passo: a narração explicativa; sem ela, o texto da tela. */
export function stepSpokenText(step: SystemTourStep): string {
  const n = step.narration?.trim()
  return n ? n : stepSpeechText(step)
}
