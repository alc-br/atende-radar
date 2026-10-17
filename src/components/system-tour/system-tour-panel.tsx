'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  ClipboardCheck,
  Loader2,
  MousePointerClick,
  Pause,
  Play,
  SkipForward,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { actionCue, allDone, chaptersFor, spotlightFocus, stepArea, stepSpokenText } from '@/lib/system-tour/engine'
import { onTourSignal } from '@/lib/system-tour/signals'
import type { SpotlightFocus, SystemTourChapter } from '@/lib/system-tour/types'
import { useSystemTourProgress } from './progress-store'
import { RATE_OPTIONS, type SpeakHandlers, useSpeech } from './use-speech'
import { StepBody } from './rich-text'
import { AUTO_DEMO_MESSAGE, AUTO_TASK_MESSAGE, GhostCursor, isAborted, runAutoAction } from './auto-actions'

// Painel do passo do "Tour pelo sistema": destaca o item da tela (sem bloquear cliques), explica, detecta o clique ou
// o cadastro pedido e navega entre as telas. Não é modal: a pessoa usa o sistema normalmente com ele aberto.
// Fica abaixo dos diálogos do sistema (z-50), então o formulário de um cadastro cobre o painel enquanto é preenchido.

/** Sem o item na tela depois deste tempo, o passo vira explicação sem destaque (nunca trava). */
const MISSING_AFTER_MS = 2500
const POLL_MS = 400
const DRAWER_QUERY = '(max-width: 1023.98px)' // abaixo disto o menu lateral é gaveta (painel.css)
const SHEET_QUERY = '(max-width: 639.98px)' // abaixo disto o painel vira folha no rodapé
/** Leitura automática: pausa entre o fim da fala de um passo e o próximo passo. */
const AUTO_ADVANCE_MS = 600
/** Leitura automática: espera da voz começar antes de mostrar a tela do passo (áudio lento ou travado não prende o tour). */
const VOICE_WAIT_MS = 4000
const rateLabel = (r: number) => `${r.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`

type Rect = { top: number; left: number; width: number; height: number }
type Placement = 'baixo-dir' | 'baixo-esq' | 'topo-dir' | 'topo-esq' | 'baixo' | 'topo'

const matches = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
const reducedMotion = () => matches('(prefers-reduced-motion: reduce)')
const isSidebarTarget = (t?: string) => !!t && (t.startsWith('nav-') || t.startsWith('sidebar-'))

/** Primeiro elemento visível com o data-tour pedido. */
function findTarget(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)
  for (const el of all) {
    if (el.closest('[data-system-tour-panel]')) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** Escolhe um canto para o painel que não cubra o item destacado. */
function choosePlacement(rect: Rect | null, panel: { w: number; h: number }, sheet: boolean): Placement {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (sheet) {
    if (!rect) return 'baixo'
    return rect.top + rect.height > vh - panel.h - 12 && rect.top > panel.h + 12 ? 'topo' : rect.top + rect.height > vh - panel.h - 12 ? 'topo' : 'baixo'
  }
  if (!rect) return 'baixo-dir'
  const m = 20
  const boxes: Record<Exclude<Placement, 'baixo' | 'topo'>, { l: number; t: number }> = {
    'baixo-dir': { l: vw - panel.w - m, t: vh - panel.h - m },
    'baixo-esq': { l: m, t: vh - panel.h - m },
    'topo-dir': { l: vw - panel.w - m, t: 72 },
    'topo-esq': { l: m, t: 72 },
  }
  const pad = 10
  for (const [name, b] of Object.entries(boxes) as Array<[Placement, { l: number; t: number }]>) {
    const overlap =
      b.l < rect.left + rect.width + pad && b.l + panel.w > rect.left - pad && b.t < rect.top + rect.height + pad && b.t + panel.h > rect.top - pad
    if (!overlap) return name
  }
  return 'baixo-dir'
}

/** Retângulo do SVG com cantos arredondados. */
const Box = ({ r, radius, fill }: { r: Rect; radius: number; fill: string }) => (
  <rect x={r.left} y={r.top} width={Math.max(0, r.width)} height={Math.max(0, r.height)} rx={radius} fill={fill} />
)

/**
 * Destaque em 3 níveis: o item (aceso, com o anel), a região de que o passo fala (meia-luz) e o resto da tela (mais
 * escuro, sem esconder). Com foco na região, ela fica acesa e contornada e o anel some. Sem região: item aceso, resto
 * escuro. Não recebe cliques: a pessoa usa a tela normalmente.
 */
function Spotlight({ target, area, focus }: { target: Rect; area: Rect | null; focus: SpotlightFocus }) {
  const id = `tour-veu-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const areaFocus = !!area && focus === 'area'
  return (
    <>
      <svg className="tour-sistema__veu" aria-hidden="true" data-focus={areaFocus ? 'area' : 'target'}>
        <defs>
          {/* véu escuro: a tela toda, menos a região e o item */}
          <mask id={`${id}-escuro`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {area && <Box r={area} radius={8} fill="black" />}
            <Box r={target} radius={10} fill="black" />
          </mask>
          {/* meia-luz: só a região, menos o item */}
          {area && (
            <mask id={`${id}-medio`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <Box r={area} radius={8} fill="white" />
              <Box r={target} radius={10} fill="black" />
            </mask>
          )}
        </defs>
        <rect className="tour-sistema__veu-escuro" x="0" y="0" width="100%" height="100%" mask={`url(#${id}-escuro)`} />
        {area && <rect className="tour-sistema__veu-medio" x="0" y="0" width="100%" height="100%" mask={`url(#${id}-medio)`} />}
      </svg>
      {area && (
        <div
          className="tour-sistema__area"
          aria-hidden="true"
          style={{ top: area.top, left: area.left, width: area.width, height: area.height }}
        />
      )}
      <div
        className="tour-sistema__destaque"
        aria-hidden="true"
        style={{ top: target.top, left: target.left, width: target.width, height: target.height }}
      />
    </>
  )
}

export function SystemTourPanel() {
  const systemTour = useAppStore((s) => s.systemTour)
  const me = useAppStore((s) => s.me)
  const chapters = useMemo(() => (me ? chaptersFor({ role: me.role, isPlatformOperator: me.isPlatformOperator }) : []), [me])
  const chapter = systemTour ? chapters.find((c) => c.id === systemTour.chapterId) : undefined
  if (!systemTour || !chapter) return null
  return <Panel key={chapter.id} chapter={chapter} chapters={chapters} stepIndex={systemTour.step} />
}

function Panel({ chapter, chapters, stepIndex }: { chapter: SystemTourChapter; chapters: SystemTourChapter[]; stepIndex: number }) {
  const setView = useAppStore((s) => s.setView)
  const currentView = useAppStore((s) => s.currentView)
  const setSystemTourStep = useAppStore((s) => s.setSystemTourStep)
  const closeSystemTour = useAppStore((s) => s.closeSystemTour)
  const openSystemTour = useAppStore((s) => s.openSystemTour)
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen)
  const markTourSeen = useAppStore((s) => s.markTourSeen)
  const save = useSystemTourProgress((s) => s.save)
  const serverAudio = useSystemTourProgress((s) => s.serverAudio)
  const speech = useSpeech({ serverAudio })

  const total = chapter.steps.length
  const idx = Math.min(Math.max(stepIndex, 0), total - 1)
  const step = chapter.steps[idx]
  const isLast = idx === total - 1

  const [rect, setRect] = useState<Rect | null>(null)
  /** Região em meia-luz ao redor do item (menu lateral, topo), quando o passo tem uma. */
  const [areaRect, setAreaRect] = useState<Rect | null>(null)
  const [missing, setMissing] = useState(false)
  const [panelSize, setPanelSize] = useState({ w: 380, h: 320 })
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const openedDrawer = useRef(false)
  const returnFocus = useRef<Element | null>(null)

  // ── navegação entre passos ──
  const goTo = useCallback(
    (next: number) => {
      setSystemTourStep(next)
      void save({ chapterId: chapter.id, step: next })
    },
    [chapter.id, save, setSystemTourStep],
  )

  const close = useCallback(() => {
    speech.stop()
    if (openedDrawer.current) setMobileNavOpen(false)
    closeSystemTour()
    const back = returnFocus.current
    if (back instanceof HTMLElement && back.isConnected) back.focus()
  }, [closeSystemTour, setMobileNavOpen, speech])

  /** Passos de cadastro que a leitura automática só demonstrou (a pessoa não fez): o capítulo não vira "concluído". */
  const demoed = useRef(new Set<number>())

  const finish = useCallback(() => {
    speech.stop()
    if (openedDrawer.current) setMobileNavOpen(false)
    if (demoed.current.size > 0) {
      // só "demonstrado": guarda o passo, mas o capítulo não conta como concluído
      void save({ chapterId: chapter.id, step: idx })
      toast.info(`Aula "${chapter.title}" vista. Os cadastros foram só demonstrados: faça-os quando quiser para concluir a aula.`)
    } else {
      void save({ chapterId: chapter.id, step: idx, done: true })
      const progress = useSystemTourProgress.getState().progress
      const everything = allDone(chapters, progress)
      toast.success(everything ? 'Parabéns! Você concluiu todas as aulas do treinamento.' : `Aula "${chapter.title}" concluída.`)
    }
    openSystemTour() // volta para a lista de capítulos
  }, [chapter.id, chapter.title, chapters, idx, openSystemTour, save, setMobileNavOpen, speech])

  const next = useCallback(() => (isLast ? finish() : goTo(idx + 1)), [finish, goTo, idx, isLast])
  const prev = useCallback(() => {
    if (idx > 0) goTo(idx - 1)
  }, [goTo, idx])

  // ── leitura automática (só nesta visita ao capítulo; não fica salva) ──
  // Lê o passo; ao terminar a fala, espera um pouco e vai para o próximo passo, até o fim do capítulo. Passo de clique:
  // quando a voz pede o clique, um cursor simulado aponta o item e o tour ESPERA a pessoa clicar (nunca clica sozinho).
  // Passo de cadastro: o cursor só demonstra (nunca executa) e o tour segue. Voltar, Próximo, Pausar e fechar desligam.
  // começa ligada: abrir um capítulo já lê o 1º passo (o clique que abriu o capítulo libera o som no navegador)
  const [autoRead, setAutoRead] = useState(speech.supported)
  const autoRef = useRef(speech.supported)
  /** Passo cuja fala terminou com a leitura automática ligada (null = ainda falando ou não lido). */
  const [narrated, setNarrated] = useState<number | null>(null)
  const narratedRef = useRef<number | null>(null)
  useEffect(() => {
    narratedRef.current = narrated
  }, [narrated])
  const stopAuto = useCallback(() => {
    autoRef.current = false
    setAutoRead(false)
    setNarrated(null)
  }, [])
  const autoHandlers = useCallback(
    (i: number): SpeakHandlers => ({
      onEnd: () => {
        if (autoRef.current) setNarrated(i)
      },
      // servidor e voz do navegador falharam: desliga, sem ficar tentando em loop
      onFail: stopAuto,
    }),
    [stopAuto],
  )

  // Onde estava o foco ao abrir: volta para lá ao fechar.
  useEffect(() => {
    returnFocus.current = document.activeElement
  }, [])

  // ── tela junto com a voz ──
  // Na leitura automática, a tela do passo (troca de tela, gaveta, destaque) só aparece quando a voz começa de fato a
  // falar: o áudio pode demorar a chegar e a tela não pode correr na frente da fala. Sem voz (desligada, falhou ou
  // demorou mais que VOICE_WAIT_MS), a tela aparece na hora.
  const [screenStep, setScreenStep] = useState<number | null>(null)
  const voiceStarted = speech.state === 'speaking'
  // voz já falando (ou leitura automática desligada): a tela aparece no mesmo render
  if (screenStep !== idx && (!autoRead || voiceStarted)) setScreenStep(idx)
  useEffect(() => {
    if (screenStep === idx || !autoRead || voiceStarted) return
    const t = window.setTimeout(() => setScreenStep(idx), VOICE_WAIT_MS)
    return () => window.clearTimeout(t)
  }, [idx, autoRead, voiceStarted, screenStep])
  const screenReady = screenStep === idx

  // ── ao mudar de passo: foco no título ──
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [chapter.id, idx]) // só ao trocar de passo

  // ── tela do passo pronta: tela certa e gaveta do celular ──
  useEffect(() => {
    if (!screenReady) return
    if (step.view && useAppStore.getState().currentView !== step.view) setView(step.view)
    if (step.view) markTourSeen(step.view) // o guia rápido da tela não abre por cima do manual
    const drawer = matches(DRAWER_QUERY)
    if (drawer && isSidebarTarget(step.target)) {
      setMobileNavOpen(true)
      openedDrawer.current = true
    } else if (openedDrawer.current) {
      setMobileNavOpen(false)
      openedDrawer.current = false
    }
  }, [chapter.id, idx, screenReady]) // só ao trocar de passo (quando a tela dele fica pronta)

  // Passo que aponta para o menu, no celular: tocar fora fecha a gaveta e o item some da tela. Reabre,
  // para a pessoa não ficar presa num passo cujo item não dá para ver (sair do tour continua no "Fechar").
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen)
  useEffect(() => {
    if (mobileNavOpen || !openedDrawer.current || !isSidebarTarget(step.target) || !matches(DRAWER_QUERY)) return
    const id = window.setTimeout(() => setMobileNavOpen(true), 250)
    return () => window.clearTimeout(id)
  }, [mobileNavOpen, step.target, setMobileNavOpen])

  // A voz explica o passo (narração); o áudio vem do servidor (gravado uma vez) ou, sem ele, da voz do navegador.
  const speechItem = useMemo(
    () => ({ text: stepSpokenText(step), audioUrl: `/api/tours/system/audio?chapter=${encodeURIComponent(chapter.id)}&step=${idx}` }),
    [chapter.id, idx, step],
  )
  useEffect(() => {
    speech.stop()
    if (speech.supported && autoRef.current) speech.speak(speechItem, autoHandlers(idx))
  }, [chapter.id, idx]) // lê de novo só quando o passo muda

  const toggleAuto = () => {
    if (autoRef.current) {
      // pausa a fala e cancela o avanço pendente (o efeito abaixo limpa o timer)
      stopAuto()
      if (speech.state === 'speaking' || speech.state === 'loading') speech.pause()
      return
    }
    autoRef.current = true
    setAutoRead(true)
    setNarrated(null)
    speech.speak(speechItem, autoHandlers(idx))
  }

  // ── acompanha o item destacado (aparece depois de carregar, muda com rolagem, some ao trocar de tela) ──
  const areaName = stepArea(step)
  useEffect(() => {
    if (!step.target || !screenReady) return
    const target = step.target
    const measureArea = () => {
      const el = areaName ? findTarget(areaName) : null
      const r = el?.getBoundingClientRect()
      // fora da tela (gaveta do celular fechada): sem meia-luz
      const visible = !!r && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
      setAreaRect((old) =>
        !visible || !r
          ? null
          : old && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height
            ? old
            : { top: r.top, left: r.left, width: r.width, height: r.height },
      )
    }
    let scrolled = false
    let timer: number | undefined
    const started = Date.now()
    const measure = () => {
      const el = findTarget(target)
      if (!el) {
        setRect(null)
        if (Date.now() - started >= MISSING_AFTER_MS) setMissing(true)
        return
      }
      measureArea()
      if (!scrolled) {
        scrolled = true
        const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth'
        if (matches(SHEET_QUERY) && !el.closest('.lateral')) {
          // Celular: leva o item para o alto da tela (abaixo do topo fixo), longe da folha do painel no rodapé
          const top = el.getBoundingClientRect().top
          window.scrollBy({ top: top - 88, behavior })
        } else {
          el.scrollIntoView({ block: matches(SHEET_QUERY) ? 'nearest' : 'center', inline: 'nearest', behavior })
        }
      }
      const r = el.getBoundingClientRect()
      setMissing(false)
      setRect((old) =>
        old && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height
          ? old
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      )
    }
    const first = window.requestAnimationFrame(measure)
    timer = window.setInterval(measure, POLL_MS)
    const onMove = () => measure()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.cancelAnimationFrame(first)
      if (timer) window.clearInterval(timer)
      timer = undefined
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      // o próximo passo (ou a próxima tela) começa sem destaque até achar o item
      setRect(null)
      setAreaRect(null)
      setMissing(false)
    }
  }, [step.target, areaName, chapter.id, idx, currentView, screenReady])
  const focus = spotlightFocus(step, speech.state === 'idle' ? null : speech.progress)

  // Tamanho do painel (muda com o texto e com a largura da tela) para escolher o canto que não cobre o item.
  useEffect(() => {
    const p = panelRef.current
    if (!p || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setPanelSize((old) => (old.w === p.offsetWidth && old.h === p.offsetHeight ? old : { w: p.offsetWidth, h: p.offsetHeight }))
    })
    ro.observe(p)
    return () => ro.disconnect()
  }, [])
  const placement = choosePlacement(rect, panelSize, matches(SHEET_QUERY))

  // ── passo "clique": avança quando a pessoa clica no item destacado ──
  const waitsClick = step.kind === 'click' && !!step.target && !missing
  useEffect(() => {
    if (!waitsClick || !step.target) return
    const sel = `[data-tour="${CSS.escape(step.target)}"]`
    const onClick = (e: MouseEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest(sel) && !t.closest('[data-system-tour-panel]')) next()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [waitsClick, step.target, next])

  // ── passo "tarefa": avança quando a tela avisa que o cadastro deu certo ──
  useEffect(() => {
    if (step.kind !== 'task' || !step.signal) return
    const wanted = step.signal
    return onTourSignal((name) => {
      if (name !== wanted) return
      demoed.current.delete(idx) // a pessoa fez de verdade
      next()
    })
  }, [step.kind, step.signal, next, idx])

  // ── teclado: Esc fecha (progresso salvo), ← volta, → avança só em passo de explicação ──
  const advancesByArrow = step.kind === 'info' || (step.kind === 'click' && missing)

  // Fala do passo terminou (leitura automática): passo de explicação avança sozinho; no último passo para e mostra o
  // "Concluir capítulo" (não pula para outro capítulo); clique/cadastro são simulados pelo efeito abaixo.
  useEffect(() => {
    if (!autoRead || narrated !== idx || !advancesByArrow) return
    const t = window.setTimeout(
      () => {
        if (!autoRef.current) return
        if (isLast) {
          stopAuto()
        } else {
          setNarrated(null)
          goTo(idx + 1)
        }
      },
      isLast ? 0 : AUTO_ADVANCE_MS,
    )
    return () => window.clearTimeout(t)
  }, [autoRead, narrated, idx, advancesByArrow, isLast, goTo, stopAuto])

  // Leitura automática: passo de clique, o cursor aponta o item quando a voz chega no "Clique…" (ou ao fim da fala);
  // passo de cadastro, a demonstração começa quando a fala termina.
  const ghost = useRef<GhostCursor | null>(null)
  const [demoNote, setDemoNote] = useState<number | null>(null)
  /** Passo em que a voz já pediu o clique (fica marcado até trocar de passo, mesmo se a fala pausar). */
  const [pointing, setPointing] = useState<number | null>(null)
  const cue = useMemo(() => (step.kind === 'click' ? actionCue(step) : 1), [step])
  const reachedCue = step.kind === 'click' && speech.state === 'speaking' && (speech.progress ?? 0) >= cue
  if (autoRead && reachedCue && pointing !== idx) setPointing(idx)
  const simulates = autoRead && screenReady && !advancesByArrow && (narrated === idx || pointing === idx)

  // Enquanto fala um passo, já baixa o áudio do próximo: a voz seguinte começa sem atraso, junto com a tela.
  useEffect(() => {
    if (!autoRead || !voiceStarted || isLast) return
    speech.prefetch(`/api/tours/system/audio?chapter=${encodeURIComponent(chapter.id)}&step=${idx + 1}`)
  }, [autoRead, voiceStarted, isLast, chapter.id, idx, speech.prefetch])

  useEffect(() => {
    if (!simulates) return
    const ctrl = new AbortController()
    if (!ghost.current) ghost.current = new GhostCursor()
    let fallback: number | undefined
    runAutoAction(step, {
      ghost: ghost.current,
      signal: ctrl.signal,
      reduced: reducedMotion(),
      onDemo: () => setDemoNote(idx),
    }).then(
      (result) => {
        if (ctrl.signal.aborted || !autoRef.current) return
        // clique: o cursor aponta e o tour espera a pessoa clicar; cadastro: mostrou como e espera a pessoa salvar (o
        // aviso da tela avança e tira o passo de "só demonstrado"; pular com Próximo deixa o capítulo por concluir)
        if (result === 'waiting') {
          if (step.kind === 'task') demoed.current.add(idx)
          return
        }
        // item que não apareceu enquanto a voz ainda fala: o passo vira "explicação" (missing) e segue ao fim da fala
        if (result === 'missing' && narratedRef.current !== idx) return
        if (result === 'demo') demoed.current.add(idx)
        // demonstrado (ou item que não apareceu): segue. Último passo: para e mostra o "Concluir capítulo".
        fallback = window.setTimeout(() => {
          if (!autoRef.current) return
          setNarrated(null)
          if (isLast) stopAuto()
          else next()
        }, AUTO_ADVANCE_MS)
      },
      (e: unknown) => {
        if (!isAborted(e)) console.error(e)
      },
    )
    return () => {
      ctrl.abort()
      if (fallback) window.clearTimeout(fallback)
      ghost.current?.idle()
    }
  }, [simulates, idx, chapter.id]) // só ao começar a simular (step, next e isLast mudam junto com idx)

  // Pausou ou saiu do capítulo: o cursor some.
  useEffect(() => {
    if (autoRead) return
    ghost.current?.destroy()
    ghost.current = null
  }, [autoRead])
  useEffect(
    () => () => {
      ghost.current?.destroy()
      ghost.current = null
    },
    [],
  )

  // Botões e setas: a pessoa assumiu a navegação, a leitura automática desliga.
  const manualNext = useCallback(() => {
    stopAuto()
    next()
  }, [next, stopAuto])
  const manualPrev = useCallback(() => {
    stopAuto()
    prev()
  }, [prev, stopAuto])
  const stopSpeech = () => {
    stopAuto()
    speech.stop()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      // Com um formulário/menu do sistema aberto, as teclas são dele (Esc fecha o formulário, não o manual).
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')) return
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (!typing && e.key === 'ArrowRight' && advancesByArrow) {
        e.preventDefault()
        manualNext()
      } else if (!typing && e.key === 'ArrowLeft') {
        e.preventDefault()
        manualPrev()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [advancesByArrow, close, manualNext, manualPrev])

  const pad = 6
  const titleId = `tour-sistema-titulo-${chapter.id}`
  const textId = `tour-sistema-texto-${chapter.id}`
  const percent = Math.round(((idx + 1) / total) * 100)

  return (
    <>
      {rect && <Spotlight target={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} area={areaRect} focus={focus} />}
      <div
        ref={panelRef}
        className={`tour-sistema tour-sistema--${placement}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={textId}
        data-system-tour-panel=""
        data-testid="system-tour-panel"
      >
        <header className="tour-sistema__cab">
          <div className="min-w-0">
            <p className="tour-sistema__capitulo">{chapter.title}</p>
            <p className="tour-sistema__passo" data-testid="system-tour-step">
              Passo {idx + 1} de {total}
            </p>
          </div>
          <button type="button" className="tour-sistema__fechar" onClick={close} aria-label="Fechar o tour (o progresso fica salvo)">
            <X className="ic" aria-hidden="true" />
          </button>
        </header>
        <div
          className="tour-sistema__barra"
          role="progressbar"
          aria-label="Progresso da aula"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>

        {/* rola no celular: focável para quem usa só o teclado (axe: scrollable-region-focusable) */}
        <div className="tour-sistema__corpo" tabIndex={0} role="region" aria-labelledby={titleId}>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="tour-sistema__titulo">
            {step.title}
          </h2>
          <div id={textId} className="tour-sistema__texto" aria-live="polite" aria-atomic="true">
            <StepBody blocks={step.body} />
          </div>
          {step.action && !(step.kind === 'click' && missing) && (
            <p className="tour-sistema__acao">
              {step.kind === 'task' ? <ClipboardCheck className="ic" aria-hidden="true" /> : <MousePointerClick className="ic" aria-hidden="true" />}
              {step.action}
            </p>
          )}
          {autoRead && demoNote === idx && (
            <p className="tour-sistema__aviso" role="status" data-testid="system-tour-demo-note">
              {step.kind === 'task' ? AUTO_TASK_MESSAGE : AUTO_DEMO_MESSAGE}
            </p>
          )}
          {step.target && missing && (
            <p className="tour-sistema__aviso" role="note">
              Este item não está visível na tela agora (depende do seu papel, dos dados ou do tamanho da tela). Leia a explicação e siga em frente.
            </p>
          )}
        </div>

        {speech.supported ? (
          <div className="tour-sistema__voz" role="group" aria-label="Leitura em voz alta" data-voice-source={speech.source ?? undefined}>
            {speech.state === 'speaking' || speech.state === 'loading' ? (
              <button type="button" className="btn btn--sm" onClick={speech.pause}>
                <Pause className="ic" aria-hidden="true" />Pausar
              </button>
            ) : speech.state === 'paused' ? (
              <button type="button" className="btn btn--sm" onClick={speech.resume}>
                <Play className="ic" aria-hidden="true" />Continuar
              </button>
            ) : (
              <button type="button" className="btn btn--sm" onClick={() => speech.speak(speechItem, autoRef.current ? autoHandlers(idx) : undefined)}>
                <Volume2 className="ic" aria-hidden="true" />Ouvir
              </button>
            )}
            <button type="button" className="btn btn--sm" onClick={stopSpeech} disabled={speech.state === 'idle' && !autoRead}>
              <Square className="ic" aria-hidden="true" />Parar
            </button>
            {speech.state === 'loading' && (
              <span className="tour-sistema__opcao" role="status">
                <Loader2 className="ic animate-spin" aria-hidden="true" />Carregando o áudio...
              </span>
            )}
            <label className="tour-sistema__opcao">
              Velocidade
              <select
                value={String(speech.prefs.rate)}
                onChange={(e) => speech.changeRate(Number(e.target.value), speechItem, autoRef.current ? autoHandlers(idx) : undefined)}
              >
                {/* velocidade salva por uma versão antiga (ex.: 1,1×) continua aparecendo */}
                {(RATE_OPTIONS.includes(speech.prefs.rate) ? RATE_OPTIONS : [...RATE_OPTIONS, speech.prefs.rate].sort((a, b) => a - b)).map((r) => (
                  <option key={r} value={String(r)}>
                    {rateLabel(r)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className="tour-sistema__nota" data-testid="system-tour-no-speech">
            Leitura em voz alta indisponível neste navegador.
          </p>
        )}

        <footer className="tour-sistema__rodape">
          <button type="button" className="btn btn--sm" onClick={manualPrev} disabled={idx === 0}>
            <ChevronLeft className="ic" aria-hidden="true" />Voltar
          </button>
          {speech.supported ? (
            <button
              type="button"
              className={`btn btn--sm tour-sistema__auto${step.kind === 'task' || waitsClick || isLast ? ' tour-sistema__auto--icone' : ''}`}
              aria-pressed={autoRead}
              aria-label={autoRead ? 'Pausar leitura' : 'Ler automaticamente'}
              title={autoRead ? 'Pausar leitura' : 'Ler automaticamente: lê cada passo e avança sozinho'}
              onClick={toggleAuto}
              data-testid="system-tour-auto"
            >
              {autoRead ? <CirclePause className="ic" aria-hidden="true" /> : <AudioLines className="ic" aria-hidden="true" />}
              <span className="tour-sistema__auto-rotulo">{autoRead ? 'Pausar leitura' : 'Ler automaticamente'}</span>
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          {step.kind === 'task' ? (
            <button type="button" className="btn btn--sm btn--primario" onClick={manualNext}>
              <SkipForward className="ic" aria-hidden="true" />Já fiz / pular este passo
            </button>
          ) : waitsClick ? (
            <button type="button" className="btn btn--sm btn--link" onClick={manualNext}>
              Pular este passo
            </button>
          ) : (
            <button type="button" className="btn btn--sm btn--primario" onClick={manualNext}>
              {isLast ? (
                <>
                  <Check className="ic" aria-hidden="true" />Concluir aula
                </>
              ) : (
                <>
                  Próximo<ChevronRight className="ic" aria-hidden="true" />
                </>
              )}
            </button>
          )}
        </footer>
      </div>
    </>
  )
}
