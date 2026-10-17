'use client'

import { useEffect, useMemo } from 'react'
import { GraduationCap, ListChecks, StepForward } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { allDone, chapterStatus, chaptersFor, resumeChapter } from '@/lib/system-tour/engine'
import { useSystemTourProgress } from '@/components/system-tour/progress-store'

// Destaque do "Tour pelo sistema" na Visão Geral: é o treinamento do sistema inteiro, para a pessoa e para cada
// membro da equipe (cada um faz as aulas do seu papel). Mostra quantas aulas a pessoa já concluiu e some quando
// ela conclui todas. O progresso vem do mesmo lugar da tela do tour (/api/tours/system, por membro).
export function TrainingBanner() {
  const me = useAppStore((s) => s.me)
  const runSystemTour = useAppStore((s) => s.runSystemTour)
  const openSystemTour = useAppStore((s) => s.openSystemTour)
  const { progress, loaded, load, save } = useSystemTourProgress()

  useEffect(() => {
    void load()
  }, [load])

  const chapters = useMemo(() => (me ? chaptersFor({ role: me.role, isPlatformOperator: me.isPlatformOperator }) : []), [me])
  if (!me || !loaded || chapters.length === 0 || allDone(chapters, progress)) return null

  const doneCount = chapters.filter((c) => progress.chapters[c.id]?.done).length
  const resume = resumeChapter(chapters, progress)
  const resumeStatus = resume ? chapterStatus(resume, progress) : null
  const resumeIndex = resume ? chapters.findIndex((c) => c.id === resume.id) + 1 : 0
  const percent = Math.round((doneCount / chapters.length) * 100)
  const manages = me.role === 'admin' || me.role === 'gestor'

  const start = () => {
    if (!resume || !resumeStatus) return openSystemTour()
    runSystemTour(resume.id, resumeStatus.step)
    void save({ chapterId: resume.id, step: resumeStatus.step })
  }

  return (
    <section className="cartao treino" data-testid="training-banner" aria-labelledby="t-treino">
      <span className="treino__ic" aria-hidden="true"><GraduationCap className="ic" /></span>
      <div className="treino__texto">
        <h2 id="t-treino">Treinamento do sistema</h2>
        <p>
          Aulas curtas, com a tela de verdade, que mostram o AtendeRadar inteiro: o que cada item faz e como usar no dia a dia.
          {manages
            ? ' Serve de treinamento para a equipe também: cada pessoa que você convidar faz as aulas do papel dela, com o progresso salvo.'
            : ' Cada pessoa da equipe faz as aulas do seu papel, e o progresso fica salvo.'}
        </p>
        <div className="treino__progresso">
          <div className="barra" role="progressbar" aria-label="Aulas concluídas" aria-valuemin={0} aria-valuemax={chapters.length} aria-valuenow={doneCount}>
            <i style={{ width: `${percent}%` }} />
          </div>
          <span data-testid="training-count"><b>{doneCount} de {chapters.length}</b> aulas concluídas</span>
        </div>
      </div>
      <div className="treino__acoes">
        <button type="button" className="btn btn--primario" onClick={start}>
          <StepForward className="ic" aria-hidden="true" />
          {doneCount === 0 && !resumeStatus?.started ? 'Começar o treinamento' : `Continuar: aula ${resumeIndex}`}
        </button>
        <button type="button" className="btn btn--sm" onClick={openSystemTour}>
          <ListChecks className="ic" aria-hidden="true" />Ver as aulas
        </button>
      </div>
    </section>
  )
}
