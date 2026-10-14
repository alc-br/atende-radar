'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Leitura em voz alta do "Tour pelo sistema".
// 1º o áudio gerado no servidor (Piper, gravado uma vez e reaproveitado: GET /api/tours/system/audio), tocado num
//    elemento <audio> com a velocidade escolhida;
// 2º se o servidor não tiver o áudio (503/erro), a Web Speech API do próprio navegador lê o mesmo texto: voz pt-BR
//    quando houver; senão qualquer voz "pt"; senão a padrão do navegador (lang pt-BR).

export const SPEECH_PREFS_KEY = 'ar.systemTour.tts'
export const MIN_RATE = 0.8
export const MAX_RATE = 1.5

export interface SpeechPrefs {
  /** Ler cada passo assim que ele aparece. */
  auto: boolean
  /** Velocidade da fala (0,8× a 1,5×). */
  rate: number
}

const DEFAULT_PREFS: SpeechPrefs = { auto: false, rate: 1 }

export const clampRate = (r: number) => (Number.isFinite(r) ? Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(r * 10) / 10)) : 1)

function readPrefs(): SpeechPrefs {
  try {
    const raw = window.localStorage.getItem(SPEECH_PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<SpeechPrefs>
    return { auto: p.auto === true, rate: clampRate(Number(p.rate ?? 1)) }
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
  a.onplaying = a.onended = a.onerror = null
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

  const stop = useCallback(() => {
    turn.current++
    current.current = null
    releaseAudio(audio)
    cancelSynth()
    setState('idle')
  }, [])

  const speakBrowser = useCallback((text: string, rate: number, my: number) => {
    if (!speechSupported() || !text.trim()) {
      setState('idle')
      return
    }
    try {
      cancelSynth()
      const u = new window.SpeechSynthesisUtterance(text)
      const voice = pickVoice()
      if (voice) u.voice = voice
      u.lang = voice?.lang || 'pt-BR'
      u.rate = rate
      u.onend = () => {
        if (current.current === u && turn.current === my) {
          current.current = null
          setState('idle')
        }
      }
      u.onerror = u.onend
      current.current = u
      window.speechSynthesis.speak(u)
      setSource('browser')
      setState('speaking')
    } catch {
      setState('idle')
    }
  }, [])

  const speak = useCallback(
    (item: SpeechItem, rate?: number) => {
      if (!item.text.trim()) return
      turn.current++
      const my = turn.current
      current.current = null
      releaseAudio(audio)
      cancelSynth()
      const r = clampRate(rate ?? prefs.rate)

      if (!item.audioUrl || !useServer || serverFailed.current) {
        speakBrowser(item.text, r, my)
        return
      }
      const a = new window.Audio()
      audio.current = a
      // O erro chega duas vezes (evento "error" e play() rejeitado): só o primeiro troca para a voz do navegador.
      const fallback = () => {
        if (turn.current !== my || audio.current !== a) return
        serverFailed.current = true
        releaseAudio(audio)
        speakBrowser(item.text, r, my)
      }
      a.preload = 'auto'
      a.defaultPlaybackRate = r
      a.playbackRate = r
      a.onplaying = () => {
        if (turn.current === my) setState('speaking')
      }
      a.onended = () => {
        if (turn.current === my) {
          audio.current = null
          setState('idle')
        }
      }
      a.onerror = fallback // 503 (sem Piper), erro de rede ou formato que o navegador não toca
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
          speakBrowser(item.text, r, my)
          return
        }
        fallback()
      })
    },
    [prefs.rate, speakBrowser, useServer],
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

  const setPrefs = useCallback((next: Partial<SpeechPrefs>) => {
    setPrefsState((p) => {
      const merged = { auto: next.auto ?? p.auto, rate: clampRate(next.rate ?? p.rate) }
      writePrefs(merged)
      return merged
    })
  }, [])

  /** Muda a velocidade do que está tocando. Áudio do servidor: na hora, sem recomeçar; voz do navegador: recomeça. */
  const changeRate = useCallback(
    (rate: number, item: SpeechItem) => {
      const r = clampRate(rate)
      setPrefs({ rate: r })
      const a = audio.current
      if (a) {
        a.defaultPlaybackRate = r
        a.playbackRate = r
      } else if (state !== 'idle') {
        speak(item, r)
      }
    },
    [setPrefs, speak, state],
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

  return { supported, prefs, setPrefs, changeRate, state, source, speak, pause, resume, stop }
}
