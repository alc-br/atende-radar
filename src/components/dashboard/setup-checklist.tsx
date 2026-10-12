'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Rocket } from 'lucide-react'
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
    <section data-testid="setup-checklist" className="cartao border-[var(--verde-300)]" aria-labelledby="t-primeiros-passos">
      <div className="cartao__cab">
        <div>
          <h2 id="t-primeiros-passos">
            <span className="selo-icone tom-verde">
              <Rocket className="ic" aria-hidden="true" />
            </span>
            Primeiros passos
          </h2>
          <p>
            {doneCount} de {status.steps.length} concluídos. Faça na ordem: o próximo passo está destacado.
          </p>
        </div>
      </div>
      <div className="cartao__corpo">
        <ol className="grid gap-2.5">
          {status.steps.map((step) => {
            const isNext = next?.id === step.id
            return (
              <li
                key={step.id}
                className={`flex flex-col gap-3 rounded-[var(--raio-sm)] border p-3 sm:flex-row sm:items-center ${
                  isNext ? 'border-[var(--verde-300)] bg-[var(--verde-50)]' : 'border-[var(--borda)] bg-[var(--superficie-2)]'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {step.done ? (
                    <>
                      <CheckCircle2 className="ic mt-0.5 text-[20px] verde-txt" aria-hidden="true" />
                      <span className="sr-only">Concluído:</span>
                    </>
                  ) : (
                    <>
                      <Circle className="ic mt-0.5 text-[20px] suave" aria-hidden="true" />
                      <span className="sr-only">Pendente:</span>
                    </>
                  )}
                  <div className="min-w-0">
                    <p className={`font-semibold ${step.done ? 'suave line-through' : ''}`}>{step.title}</p>
                    <p className="suave text-[13px]">{step.description}</p>
                  </div>
                </div>
                {!step.done && (
                  <button
                    type="button"
                    className={`btn btn--sm shrink-0 ${isNext ? 'btn--primario' : ''}`}
                    onClick={() => setView(step.view as View)}
                  >
                    {step.action}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
