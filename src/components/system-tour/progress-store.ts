'use client'

import { create } from 'zustand'
import { fetchMutation, runMutation } from '@/lib/mutation'
import { EMPTY_PROGRESS, applyUpdate, parseProgress, type ProgressUpdate, type SystemTourProgress } from '@/lib/system-tour/progress'

// Progresso do "Tour pelo sistema" desta pessoa: lido de /api/tours/system e salvo a cada passo.
// A tela mostra o valor local na hora (otimista); o servidor guarda por membro (OrganizationMember.systemTourJson).

interface ProgressState {
  progress: SystemTourProgress
  loaded: boolean
  /** O servidor gera o áudio da narração (senão a voz é a do navegador). */
  serverAudio: boolean
  load: () => Promise<void>
  save: (update: ProgressUpdate) => Promise<boolean>
}

export const useSystemTourProgress = create<ProgressState>((set) => ({
  progress: EMPTY_PROGRESS,
  loaded: false,
  serverAudio: false,
  load: async () => {
    try {
      const r = await fetch('/api/tours/system', { cache: 'no-store' })
      const d = r.ok ? ((await r.json()) as { progress?: unknown; audio?: unknown }) : null
      set({ progress: parseProgress(d?.progress ? JSON.stringify(d.progress) : null), serverAudio: d?.audio === true, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  save: (update) => {
    set((s) => ({ progress: applyUpdate(s.progress, update) }))
    return runMutation(() => fetchMutation('/api/tours/system', { method: 'PATCH', json: update }), {
      errorMessage: 'Não foi possível salvar o progresso do tour. Ele continua nesta tela.',
    })
  },
}))
