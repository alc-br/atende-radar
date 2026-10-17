'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { TOURS, welcomeStepsFor } from '@/lib/tours'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export function TourOverlay() {
  const activeTour = useAppStore((s) => s.activeTour)
  const activeStep = useAppStore((s) => s.activeStep)
  const nextTourStep = useAppStore((s) => s.nextTourStep)
  const prevTourStep = useAppStore((s) => s.prevTourStep)
  const endTour = useAppStore((s) => s.endTour)
  const markTourSeen = useAppStore((s) => s.markTourSeen)
  const me = useAppStore((s) => s.me)
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen)

  // rect: posição do alvo; at: de qual passo ela é. O destaque desliza do alvo anterior para o novo, e o cartão só
  // aparece quando a posição já é a do passo atual (senão surgiria no lugar errado e pularia).
  const [spot, setSpot] = useState<{ rect: DOMRect; at: string } | null>(null)
  // Tour novo começa sem destaque (a posição guardada é de outro tour); entre passos do mesmo tour, desliza.
  const rect = spot && activeTour && spot.at.startsWith(`${activeTour}:`) ? spot.rect : null
  const stepKey = `${activeTour}:${activeStep}`
  // O tour de boas-vindas depende do papel; os demais são por tela.
  const steps = activeTour === 'welcome' ? welcomeStepsFor(me?.role, !!me?.isPlatformOperator) : activeTour ? TOURS[activeTour] || [] : []
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
    setSpot({ rect: el.getBoundingClientRect(), at: `${activeTour}:${activeStep}` })
  }, [step, activeTour, activeStep, steps.length, nextTourStep, endTour, markTourSeen])

  // No celular o menu é uma gaveta: abre quando o passo aponta para um item do menu e fecha nos demais.
  // Só fecha a gaveta que o próprio guia abriu: a que a pessoa abriu continua aberta quando o guia termina.
  const openedDrawer = useRef(false)
  useEffect(() => {
    if (!activeTour || !step) return
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    if (step.target.startsWith('nav-')) {
      setMobileNavOpen(true)
      openedDrawer.current = true
    } else if (openedDrawer.current) {
      setMobileNavOpen(false)
      openedDrawer.current = false
    }
  }, [activeTour, step, setMobileNavOpen])

  useEffect(() => {
    if (!activeTour && openedDrawer.current) {
      setMobileNavOpen(false)
      openedDrawer.current = false
    }
  }, [activeTour, setMobileNavOpen])

  useEffect(() => {
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
  const ready = spot?.at === stepKey

  const isLast = activeStep === steps.length - 1
  const placement = step.placement || 'bottom'

  const cardStyle: React.CSSProperties = { position: 'fixed', zIndex: 100 }
  const gap = 12
  // Celular: o cartão fica ancorado embaixo, ocupando a largura da tela (senão o botão "Próximo" cai fora da tela).
  const narrow = window.innerWidth < 640
  if (narrow) {
    cardStyle.left = 16
    cardStyle.right = 16
    cardStyle.bottom = 16
  } else if (placement === 'bottom') {
    cardStyle.top = rect.bottom + gap
    cardStyle.left = Math.min(Math.max(rect.left, 16), window.innerWidth - 356)
  } else if (placement === 'top') {
    cardStyle.bottom = window.innerHeight - rect.top + gap
    cardStyle.left = Math.min(Math.max(rect.left, 16), window.innerWidth - 356)
  } else if (placement === 'right') {
    cardStyle.left = rect.right + gap
    cardStyle.top = Math.min(Math.max(rect.top, 16), window.innerHeight - 250)
  } else {
    cardStyle.right = window.innerWidth - rect.left + gap
    cardStyle.top = Math.min(Math.max(rect.top, 16), window.innerHeight - 250)
  }

  // outcome alimenta a taxa de conclusão do tour (Admin › Produto): "Concluir" no último passo x "Pular"/fechar
  const handleFinish = (outcome: 'completed' | 'skipped') => {
    markTourSeen(activeTour)
    fetch('/api/tours', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourId: activeTour, outcome }),
    }).catch(() => {})
    endTour()
  }

  return (
    <>
      {/* Fundo escurecido com recorte no alvo. O anel branco + verde marca o item mesmo no menu escuro, e o
          destaque desliza de um alvo para o outro: dá para ver para onde o tour foi. */}
      <div
        className="tour-spot"
        data-testid="tour-spot"
        style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
      >
        <span key={stepKey} className="tour-spot__pulso" aria-hidden="true" />
      </div>
      {/* Cartão do passo: entra com animação a cada passo */}
      {ready && (
        <div
          key={stepKey}
          role="dialog"
          aria-label={step.title}
          data-testid="tour-card"
          style={narrow ? cardStyle : { ...cardStyle, width: 340 }}
          className="tour-card rounded-xl border bg-popover text-popover-foreground shadow-2xl p-4 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-300"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="tour-card__passo" data-testid="tour-step-count">Passo {activeStep + 1} de {steps.length}</span>
            <button type="button" onClick={() => handleFinish('skipped')} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Fechar o tour">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="tour-card__barra" aria-hidden="true">
            {steps.map((_, i) => <i key={i} className={i <= activeStep ? 'feito' : ''} />)}
          </div>
          <h3 className="font-semibold text-[15px] mt-2">{step.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{step.body}</p>
          <div className="flex items-center justify-between gap-2 mt-4">
            <Button variant="ghost" size="sm" className="px-2 text-muted-foreground whitespace-nowrap" onClick={() => handleFinish('skipped')}>Pular tour</Button>
            <div className="flex items-center gap-2">
              {activeStep > 0 && (
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={prevTourStep}>Voltar</Button>
              )}
              <Button size="sm" className="whitespace-nowrap" onClick={isLast ? () => handleFinish('completed') : nextTourStep}>
                {isLast ? 'Concluir' : 'Próximo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
