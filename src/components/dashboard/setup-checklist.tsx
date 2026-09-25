'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
import type { View } from '@/lib/store'

interface Step {
  id: string
  title: string
  description: string
  done: boolean
  view: string
  action: string
}

// "Primeiros passos": aparece só para quem configura a organização e some quando tudo estiver feito.
// Cada passo vem dos dados reais (conexão criada, equipe convidada, conversas recebidas).
export function SetupChecklist() {
  const setView = useAppStore((s) => s.setView)
  const refreshTrigger = useAppStore((s) => s.refreshTrigger)
  const [status, setStatus] = useState<{ steps: Step[]; complete: boolean; canManage: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/setup-status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [refreshTrigger])

  if (!status || !status.canManage || status.complete) return null

  const doneCount = status.steps.filter((s) => s.done).length
  const next = status.steps.find((s) => !s.done)

  return (
    <Card data-testid="setup-checklist" className="border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-emerald-700 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Primeiros passos</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount} de {status.steps.length} concluídos. Faça na ordem: o próximo passo está destacado.
            </p>
          </div>
        </div>
        <ol className="space-y-3">
          {status.steps.map((step) => {
            const isNext = next?.id === step.id
            return (
              <li
                key={step.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border p-3 ${
                  isNext ? 'border-emerald-500 bg-background shadow-sm' : 'border-border/60 bg-background/60'
                }`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {step.done ? (
                    <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-label="Concluído" />
                  ) : (
                    <Circle className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" aria-label="Pendente" />
                  )}
                  <div className="min-w-0">
                    <p className={`font-medium ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                {!step.done && (
                  <Button
                    size="sm"
                    variant={isNext ? 'default' : 'outline'}
                    className={isNext ? 'bg-emerald-700 hover:bg-emerald-800 text-white shrink-0' : 'shrink-0'}
                    onClick={() => setView(step.view as View)}
                  >
                    {step.action}
                  </Button>
                )}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
