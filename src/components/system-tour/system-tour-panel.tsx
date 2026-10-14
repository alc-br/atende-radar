'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { allDone, chaptersFor, stepSpokenText } from '@/lib/system-tour/engine'
import { onTourSignal } from '@/lib/system-tour/signals'
import type { SystemTourChapter } from '@/lib/system-tour/types'
import { useSystemTourProgress } from './progress-store'
import { RATE_OPTIONS, type SpeakHandlers, useSpeech } from './use-speech'
import { StepBody } from './rich-text'

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

  const finish = useCallback(() => {
    speech.stop()
    if (openedDrawer.current) setMobileNavOpen(false)
    void save({ chapterId: chapter.id, step: idx, done: true })
    const progress = useSystemTourProgress.getState().progress
    const everything = allDone(chapters, progress)
    toast.success(everything ? 'Parabéns! Você concluiu todos os capítulos do manual.' : `Capítulo "${chapter.title}" concluído.`)
    openSystemTour() // volta para a lista de capítulos
  }, [chapter.id, chapter.title, chapters, idx, openSystemTour, save, setMobileNavOpen, speech])

  const next = useCallback(() => (isLast ? finish() : goTo(idx + 1)), [finish, goTo, idx, isLast])
  const prev = useCallback(() => {
    if (idx > 0) goTo(idx - 1)
  }, [goTo, idx])

  // ── leitura automática (só nesta visita ao capítulo; não fica salva) ──
  // Lê o passo; ao terminar a fala, espera um pouco e vai para o próximo passo, até o fim do capítulo. Passo de clique ou
  // de cadastro: lê e espera a ação (quando ela avança o passo, continua lendo). Voltar, Próximo, Parar e fechar desligam.
  const [autoRead, setAutoRead] = useState(false)
  const autoRef = useRef(false)
  /** Passo cuja fala terminou com a leitura automática ligada (null = ainda falando ou não lido). */
  const [narrated, setNarrated] = useState<number | null>(null)
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

  // ── ao mudar de passo: tela certa, gaveta do celular, foco e voz ──
  useEffect(() => {
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
    titleRef.current?.focus({ preventScroll: true })
  }, [chapter.id, idx]) // só ao trocar de passo

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
  useEffect(() => {
    if (!step.target) return
    const target = step.target
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
      setMissing(false)
    }
  }, [step.target, chapter.id, idx, currentView])

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
      if (name === wanted) next()
    })
  }, [step.kind, step.signal, next])

  // ── teclado: Esc fecha (progresso salvo), ← volta, → avança só em passo de explicação ──
  const advancesByArrow = step.kind === 'info' || (step.kind === 'click' && missing)

  // Fala do passo terminou (leitura automática): passo de explicação avança sozinho; no último passo para e mostra o
  // "Concluir capítulo" (não pula para outro capítulo); clique/cadastro esperam a pessoa.
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
      {rect && (
        <div
          className="tour-sistema__destaque"
          aria-hidden="true"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
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
          aria-label="Progresso do capítulo"
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
                  <Check className="ic" aria-hidden="true" />Concluir capítulo
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
