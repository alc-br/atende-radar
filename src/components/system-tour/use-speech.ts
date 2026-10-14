'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Leitura em voz alta do "Tour pelo sistema".
// 1º o áudio gerado no servidor (Azure Speech, gravado uma vez e reaproveitado: GET /api/tours/system/audio), tocado num
//    elemento <audio> com a velocidade escolhida;
// 2º se o servidor não tiver o áudio (503/erro), a Web Speech API do próprio navegador lê o mesmo texto: voz pt-BR
//    quando houver; senão qualquer voz "pt"; senão a padrão do navegador (lang pt-BR).

export const SPEECH_PREFS_KEY = 'ar.systemTour.tts'
export const MIN_RATE = 0.8
export const MAX_RATE = 2
/** Opções do seletor de velocidade. */
export const RATE_OPTIONS = [0.8, 1, 1.25, 1.5, 1.75, 2]

/** Preferência guardada no navegador (só a velocidade: a leitura automática vale só enquanto o painel está aberto). */
export interface SpeechPrefs {
  /** Velocidade da fala (0,8× a 2×). */
  rate: number
}

const DEFAULT_PREFS: SpeechPrefs = { rate: 1 }

/** Velocidades salvas antes (0,9×, 1,1× ...) continuam valendo: só limita ao intervalo e a 2 casas. */
export const clampRate = (r: number) => (Number.isFinite(r) ? Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(r * 100) / 100)) : 1)

function readPrefs(): SpeechPrefs {
  try {
    const raw = window.localStorage.getItem(SPEECH_PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    // versões antigas guardavam também { auto }: é ignorado
    const p = JSON.parse(raw) as Partial<SpeechPrefs>
    return { rate: clampRate(Number(p.rate ?? 1)) }
  } catch {
    return DEFAULT_PREFS
  }
}

function writePrefs(p: SpeechPrefs) {
  try {
    window.localStorage.setItem(SPEECH_PREFS_KEY, JSON.stringify(p))
  } catch {
    // navegação privada / armazenamento bloqueado: a preferência vale só nesta visita
  }
}

export const speechSupported = () =>
  typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function'

const audioSupported = () => typeof window !== 'undefined' && typeof window.Audio === 'function'

function pickVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices() || []
    const norm = (l: string) => l.toLowerCase().replace('_', '-')
    return voices.find((v) => norm(v.lang) === 'pt-br') ?? voices.find((v) => norm(v.lang).startsWith('pt')) ?? null
  } catch {
    return null
  }
}

function cancelSynth() {
  if (!speechSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // ignora: alguns navegadores lançam erro se não há nada na fila
  }
}

/** Para e solta o <audio> da fala atual (o download em andamento também). */
function releaseAudio(ref: { current: HTMLAudioElement | null }) {
  const a = ref.current
  ref.current = null
  if (!a) return
  a.onplaying = a.onended = a.onerror = a.onloadedmetadata = null
  try {
    a.pause()
    a.removeAttribute('src')
    a.load()
  } catch {
    // elemento já descartado
  }
}

/** loading = esperando o áudio do servidor (na 1ª vez ele é gerado, leva alguns segundos). */
export type SpeechState = 'idle' | 'loading' | 'speaking' | 'paused'
export type SpeechSource = 'server' | 'browser'

/** O que falar: o texto (sempre) e, se houver, o endereço do áudio já gravado no servidor. */
export interface SpeechItem {
  text: string
  audioUrl?: string
}

/** Avisos de uma fala: terminou de verdade (não foi parada) ou não deu para falar (servidor e navegador falharam). */
export interface SpeakHandlers {
  onEnd?: () => void
  onFail?: () => void
}

export function useSpeech({ serverAudio = false }: { serverAudio?: boolean } = {}) {
  // O painel do tour só monta depois de um clique (nunca no HTML do servidor), então dá para ler o navegador já aqui.
  const [browserVoice] = useState(speechSupported)
  const useServer = serverAudio && audioSupported()
  const supported = browserVoice || useServer
  const [prefs, setPrefsState] = useState<SpeechPrefs>(() => (typeof window === 'undefined' ? DEFAULT_PREFS : readPrefs()))
  const [state, setState] = useState<SpeechState>('idle')
  const [source, setSource] = useState<SpeechSource | null>(null)
  const current = useRef<SpeechSynthesisUtterance | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  /** Cada fala tem um número: eventos de uma fala antiga (já parada) são ignorados. */
  const turn = useRef(0)
  /** O servidor falhou nesta visita: as próximas falas vão direto para a voz do navegador. */
  const serverFailed = useRef(false)
  /** Velocidade atual: lida na hora por cada fala e pelos eventos do <audio> (nunca um valor velho de closure). */
  const rateRef = useRef(prefs.rate)

  const stop = useCallback(() => {
    turn.current++
    current.current = null
    releaseAudio(audio)
    cancelSynth()
    setState('idle')
  }, [])

  const speakBrowser = useCallback((text: string, my: number, handlers?: SpeakHandlers) => {
    if (!speechSupported() || !text.trim()) {
      setState('idle')
      handlers?.onFail?.()
      return
    }
    try {
      cancelSynth()
      const u = new window.SpeechSynthesisUtterance(text)
      const voice = pickVoice()
      if (voice) u.voice = voice
      u.lang = voice?.lang || 'pt-BR'
      u.rate = rateRef.current
      // cancel() também dispara onend/onerror da fala cancelada: só conta a fala atual
      const isCurrent = () => current.current === u && turn.current === my
      u.onend = () => {
        if (!isCurrent()) return
        current.current = null
        setState('idle')
        handlers?.onEnd?.()
      }
      u.onerror = () => {
        if (!isCurrent()) return
        current.current = null
        setState('idle')
        handlers?.onFail?.()
      }
      current.current = u
      window.speechSynthesis.speak(u)
      setSource('browser')
      setState('speaking')
    } catch {
      setState('idle')
      handlers?.onFail?.()
    }
  }, [])

  const speak = useCallback(
    (item: SpeechItem, handlers?: SpeakHandlers) => {
      if (!item.text.trim()) return
      turn.current++
      const my = turn.current
      current.current = null
      releaseAudio(audio)
      cancelSynth()

      if (!item.audioUrl || !useServer || serverFailed.current) {
        speakBrowser(item.text, my, handlers)
        return
      }
      const a = new window.Audio()
      audio.current = a
      // O erro chega duas vezes (evento "error" e play() rejeitado): só o primeiro troca para a voz do navegador.
      const fallback = () => {
        if (turn.current !== my || audio.current !== a) return
        serverFailed.current = true
        releaseAudio(audio)
        speakBrowser(item.text, my, handlers)
      }
      // Velocidade em todo <audio> novo: antes do play() e de novo quando os metadados chegam (alguns navegadores
      // voltam para 1,0 ao trocar o src). A voz não engrossa nem afina.
      const applyRate = () => {
        a.defaultPlaybackRate = rateRef.current
        a.playbackRate = rateRef.current
      }
      a.preload = 'auto'
      a.preservesPitch = true
      applyRate()
      a.onloadedmetadata = applyRate
      a.onplaying = () => {
        if (turn.current !== my) return
        if (a.playbackRate !== rateRef.current) applyRate()
        setState('speaking')
      }
      a.onended = () => {
        if (turn.current !== my) return
        audio.current = null
        setState('idle')
        handlers?.onEnd?.()
      }
      a.onerror = fallback // 503 (sem TTS), erro de rede ou formato que o navegador não toca
      a.src = item.audioUrl
      setSource('server')
      setState('loading')
      a.play().catch((e: unknown) => {
        // AbortError = parado/pausado antes de começar (não é falha do servidor)
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (e instanceof DOMException && e.name === 'NotAllowedError') {
          // o navegador bloqueou o som sem um clique: tenta a voz do navegador sem desistir do servidor
          if (turn.current !== my || audio.current !== a) return
          releaseAudio(audio)
          speakBrowser(item.text, my, handlers)
          return
        }
        fallback()
      })
    },
    [speakBrowser, useServer],
  )

  const pause = useCallback(() => {
    const a = audio.current
    if (a) {
      a.pause()
      setState('paused')
      return
    }
    if (!speechSupported()) return
    try {
      window.speechSynthesis.pause()
      setState('paused')
    } catch {
      // sem pausa neste navegador
    }
  }, [])

  const resume = useCallback(() => {
    const a = audio.current
    if (a) {
      setState('speaking')
      // Parar logo depois de Continuar rejeita este play() (AbortError): aí o estado já é outro e não volta a "pausado"
      void a.play().catch(() => {
        if (audio.current === a) setState('paused')
      })
      return
    }
    if (!speechSupported()) return
    try {
      window.speechSynthesis.resume()
      setState('speaking')
    } catch {
      // sem retomada neste navegador
    }
  }, [])

  /**
   * Muda a velocidade (fica salva). Áudio do servidor: vale na hora, sem recomeçar. Voz do navegador: a fala atual
   * recomeça na nova velocidade, com os mesmos avisos (a leitura automática continua).
   */
  const changeRate = useCallback(
    (rate: number, item: SpeechItem, handlers?: SpeakHandlers) => {
      const r = clampRate(rate)
      rateRef.current = r
      const merged = { rate: r }
      writePrefs(merged)
      setPrefsState(merged)
      const a = audio.current
      if (a) {
        a.defaultPlaybackRate = r
        a.playbackRate = r
      } else if (state !== 'idle') {
        speak(item, handlers)
      }
    },
    [speak, state],
  )

  // Fechou o manual (desmontou): para de falar.
  useEffect(
    () => () => {
      turn.current++
      releaseAudio(audio)
      cancelSynth()
    },
    [],
  )

  return { supported, prefs, changeRate, state, source, speak, pause, resume, stop }
}
