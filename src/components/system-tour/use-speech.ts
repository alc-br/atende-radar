'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Leitura em voz alta do "Tour pelo sistema" com a Web Speech API do próprio navegador: grátis, sem serviço externo e
// sem dependência nova. Voz pt-BR quando houver; senão qualquer voz "pt"; senão a padrão do navegador (lang pt-BR).

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

function pickVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices() || []
    const norm = (l: string) => l.toLowerCase().replace('_', '-')
    return voices.find((v) => norm(v.lang) === 'pt-br') ?? voices.find((v) => norm(v.lang).startsWith('pt')) ?? null
  } catch {
    return null
  }
}

export type SpeechState = 'idle' | 'speaking' | 'paused'

export function useSpeech() {
  // O painel do tour só monta depois de um clique (nunca no HTML do servidor), então dá para ler o navegador já aqui.
  const [supported] = useState(speechSupported)
  const [prefs, setPrefsState] = useState<SpeechPrefs>(() => (typeof window === 'undefined' ? DEFAULT_PREFS : readPrefs()))
  const [state, setState] = useState<SpeechState>('idle')
  const current = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback(() => {
    current.current = null
    setState('idle')
    if (!speechSupported()) return
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignora: alguns navegadores lançam erro se não há nada na fila
    }
  }, [])

  const speak = useCallback(
    (text: string, rate?: number) => {
      if (!speechSupported() || !text.trim()) return
      try {
        window.speechSynthesis.cancel()
        const u = new window.SpeechSynthesisUtterance(text)
        const voice = pickVoice()
        if (voice) u.voice = voice
        u.lang = voice?.lang || 'pt-BR'
        u.rate = clampRate(rate ?? prefs.rate)
        u.onend = () => {
          if (current.current === u) {
            current.current = null
            setState('idle')
          }
        }
        u.onerror = u.onend
        current.current = u
        window.speechSynthesis.speak(u)
        setState('speaking')
      } catch {
        setState('idle')
      }
    },
    [prefs.rate],
  )

  const pause = useCallback(() => {
    if (!speechSupported()) return
    try {
      window.speechSynthesis.pause()
      setState('paused')
    } catch {
      // sem pausa neste navegador
    }
  }, [])

  const resume = useCallback(() => {
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

  // Fechou o manual (desmontou): para de falar.
  useEffect(() => () => {
    if (!speechSupported()) return
    try {
      window.speechSynthesis.cancel()
    } catch {
      // nada a cancelar
    }
  }, [])

  return { supported, prefs, setPrefs, state, speak, pause, resume, stop }
}
