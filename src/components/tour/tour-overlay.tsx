'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { TOURS } from '@/lib/tours'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export function TourOverlay() {
  const activeTour = useAppStore((s) => s.activeTour)
  const activeStep = useAppStore((s) => s.activeStep)
  const nextTourStep = useAppStore((s) => s.nextTourStep)
  const prevTourStep = useAppStore((s) => s.prevTourStep)
  const endTour = useAppStore((s) => s.endTour)
  const markTourSeen = useAppStore((s) => s.markTourSeen)

  const [rect, setRect] = useState<DOMRect | null>(null)
  const steps = activeTour ? TOURS[activeTour] || [] : []
  const step = steps[activeStep]

  const measure = useCallback(() => {
    if (!step) return
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    if (!el) {
      // Alvo não encontrado nesta renderização — pula pro próximo passo
      if (activeTour) {
        if (activeStep < steps.length - 1) {
          nextTourStep()
        } else {
          markTourSeen(activeTour)
          endTour()
        }
      }
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setRect(el.getBoundingClientRect())
  }, [step, activeTour, activeStep, steps.length, nextTourStep, endTour, markTourSeen])

  useEffect(() => {
    setRect(null)
    const id = window.setTimeout(measure, 350) // dá tempo do scrollIntoView terminar
    return () => window.clearTimeout(id)
  }, [measure])

  useEffect(() => {
    if (!activeTour) return
    const onResizeOrScroll = () => measure()
    window.addEventListener('resize', onResizeOrScroll)
    window.addEventListener('scroll', onResizeOrScroll, true)
    return () => {
      window.removeEventListener('resize', onResizeOrScroll)
      window.removeEventListener('scroll', onResizeOrScroll, true)
    }
  }, [activeTour, measure])

  if (!activeTour || !step || !rect) return null

  const isLast = activeStep === steps.length - 1
  const placement = step.placement || 'bottom'

  const cardStyle: React.CSSProperties = { position: 'fixed', zIndex: 100 }
  const gap = 12
  if (placement === 'bottom') {
    cardStyle.top = rect.bottom + gap
    cardStyle.left = Math.min(Math.max(rect.left, 16), window.innerWidth - 336)
  } else if (placement === 'top') {
    cardStyle.bottom = window.innerHeight - rect.top + gap
    cardStyle.left = Math.min(Math.max(rect.left, 16), window.innerWidth - 336)
  } else if (placement === 'right') {
    cardStyle.left = rect.right + gap
    cardStyle.top = Math.min(Math.max(rect.top, 16), window.innerHeight - 220)
  } else {
    cardStyle.right = window.innerWidth - rect.left + gap
    cardStyle.top = Math.min(Math.max(rect.top, 16), window.innerHeight - 220)
  }

  const handleFinish = () => {
    markTourSeen(activeTour)
    fetch('/api/tours', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourId: activeTour }),
    }).catch(() => {})
    endTour()
  }

  return (
    <>
      {/* Overlay escurecido com recorte ao redor do alvo */}
      <div
        style={{
          position: 'fixed',
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          borderRadius: 8,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          zIndex: 90,
          pointerEvents: 'none',
          transition: 'all 0.2s ease',
        }}
      />
      {/* Card com o conteúdo do passo */}
      <div
        style={{ ...cardStyle, width: 320 }}
        className="rounded-lg border bg-popover text-popover-foreground shadow-xl p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm">{step.title}</h3>
          <button onClick={handleFinish} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1.5">{step.body}</p>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-muted-foreground">
            Passo {activeStep + 1} de {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {activeStep > 0 && (
              <Button variant="outline" size="sm" onClick={prevTourStep}>Voltar</Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleFinish}>Pular tour</Button>
            <Button size="sm" onClick={isLast ? handleFinish : nextTourStep}>
              {isLast ? 'Concluir' : 'Próximo'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
