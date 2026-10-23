'use client'

import { useEffect } from 'react'
import { dl } from '@/lib/datalayer'

// Eventos da página de anúncio (docs/operacao/medicao.md › Páginas de anúncio por segmento): um ouvinte só, no documento,
// sem mudar o HTML que o servidor mandou. toggle, play e ended não sobem pela árvore, por isso a fase de captura.
export function MedicaoSegmento({ segmento }: { segmento: string }) {
  useEffect(() => {
    const base = { page_segment: segmento }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest<HTMLElement>('[data-cta]')
      if (a) dl('cta_click', { ...base, cta_id: a.dataset.cta, cta_position: a.dataset.ctaPos ?? '' })
    }
    const onToggle = (e: Event) => {
      const d = e.target
      if (!(d instanceof HTMLDetailsElement) || !d.open || !d.closest('[data-faq]')) return
      dl('faq_open', { ...base, faq_question: d.querySelector('summary')?.textContent?.trim() ?? '' })
    }
    const vistos = new WeakSet<HTMLVideoElement>()
    const onPlay = (e: Event) => {
      const v = e.target
      if (!(v instanceof HTMLVideoElement) || vistos.has(v)) return // só o 1º play; pausar e voltar não conta de novo
      vistos.add(v)
      dl('video_play', { ...base, video_title: v.dataset.video ?? '' })
    }
    const onEnded = (e: Event) => {
      const v = e.target
      if (v instanceof HTMLVideoElement) dl('video_complete', { ...base, video_title: v.dataset.video ?? '' })
    }
    document.addEventListener('click', onClick)
    document.addEventListener('toggle', onToggle, true)
    document.addEventListener('play', onPlay, true)
    document.addEventListener('ended', onEnded, true)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('toggle', onToggle, true)
      document.removeEventListener('play', onPlay, true)
      document.removeEventListener('ended', onEnded, true)
    }
  }, [segmento])
  return null
}
