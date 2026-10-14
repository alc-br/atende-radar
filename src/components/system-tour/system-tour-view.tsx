'use client'

import { useEffect, useMemo } from 'react'
import { CheckCircle2, GraduationCap, Play, RotateCcw, StepForward, Trophy } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { allDone, chapterStatus, chaptersFor, resumeChapter } from '@/lib/system-tour/engine'
import { useSystemTourProgress } from './progress-store'

// Tela "Tour pelo sistema": os capítulos do manual para o papel da pessoa, com o progresso de cada um.

export default function SystemTourView() {
  const me = useAppStore((s) => s.me)
  const runSystemTour = useAppStore((s) => s.runSystemTour)
  const { progress, loaded, load, save } = useSystemTourProgress()

  useEffect(() => {
    void load()
  }, [load])

  const chapters = useMemo(() => (me ? chaptersFor({ role: me.role, isPlatformOperator: me.isPlatformOperator }) : []), [me])
  const resume = loaded ? resumeChapter(chapters, progress) : null
  const resumeStarted = !!resume && chapterStatus(resume, progress).started
  const finishedAll = loaded && allDone(chapters, progress)
  const doneCount = chapters.filter((c) => progress.chapters[c.id]?.done).length

  const start = (chapterId: string, step: number, reset = false) => {
    runSystemTour(chapterId, step)
    void save(reset ? { chapterId, reset: true } : { chapterId, step })
  }

  return (
    <>
      <div className="cab-pagina">
        <div className="cab-pagina__titulo">
          <span className="cab-pagina__icone cab-pagina__icone--caixa" aria-hidden="true">
            <GraduationCap className="ic" />
          </span>
          <div>
            <h1>Tour pelo sistema</h1>
            <p>Um manual interativo, passo a passo, com o que o seu papel usa no AtendeRadar. Você pode parar quando quiser: o progresso fica salvo.</p>
          </div>
        </div>
        {resume && (
          <div className="cab-pagina__acoes">
            <button type="button" className="btn btn--primario btn--lg" onClick={() => start(resume.id, chapterStatus(resume, progress).step)}>
              <StepForward className="ic" aria-hidden="true" />
              {resumeStarted ? 'Continuar de onde parei' : 'Começar o manual'}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-[18px]">
        {finishedAll && (
          <section className="cartao cartao--pad tour-sistema-fim" role="status" data-testid="system-tour-all-done">
            <Trophy className="ic" aria-hidden="true" />
            <div>
              <h2>Parabéns! Você concluiu o manual.</h2>
              <p>Você passou por todos os capítulos do seu papel. Pode rever qualquer um quando quiser, e a Central de ajuda continua à disposição.</p>
            </div>
          </section>
        )}

        <section className="cartao cartao--pad grid gap-2" aria-labelledby="t-como-funciona">
          <h2 id="t-como-funciona" className="text-[15px] font-bold">Como funciona</h2>
          <ul className="suave grid list-disc gap-1 pl-5 text-[13.5px]">
            <li>Cada passo destaca um item da tela e explica para que ele serve.</li>
            <li>Em alguns passos você clica no item destacado ou faz um cadastro de verdade; o manual segue sozinho quando percebe.</li>
            <li>Use as setas ← → do teclado para voltar e avançar, e Esc para fechar.</li>
            <li>O botão Ouvir explica cada passo em voz alta, sem custo; Ler automaticamente lê, mostra com um cursor onde clicar e avança sozinho até o fim do capítulo (cadastros são só mostrados, nunca feitos pelo manual).</li>
          </ul>
        </section>

        <section aria-labelledby="t-capitulos" className="grid gap-3">
          <h2 id="t-capitulos" className="text-[15px] font-bold">
            Capítulos <span className="suave font-normal">({doneCount} de {chapters.length} concluídos)</span>
          </h2>
          {!me || !loaded ? (
            <p className="suave" role="status">Carregando os capítulos...</p>
          ) : (
            <ol className="tour-sistema-lista" data-testid="system-tour-chapters">
              {chapters.map((c, i) => {
                const st = chapterStatus(c, progress)
                const percent = st.done ? 100 : Math.round((st.step / st.total) * 100)
                const headingId = `cap-${c.id}`
                return (
                  <li key={c.id} className="cartao cartao--pad tour-sistema-cap" data-chapter={c.id}>
                    <div className="tour-sistema-cap__cab">
                      <span className="tour-sistema-cap__num" aria-hidden="true">{st.done ? <CheckCircle2 className="ic" /> : i + 1}</span>
                      <div className="min-w-0">
                        <h3 id={headingId}>{c.title}</h3>
                        <p className="suave">{c.summary}</p>
                      </div>
                    </div>
                    <div className="tour-sistema-cap__progresso">
                      <div
                        className="tour-sistema__barra"
                        role="progressbar"
                        aria-label={`Progresso do capítulo ${c.title}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <span className="suave text-[12.5px]" data-testid="chapter-status">
                        {st.done ? `Concluído · ${st.total} passos` : st.started ? `Parou no passo ${st.step + 1} de ${st.total}` : `${st.total} passos`}
                      </span>
                    </div>
                    <div className="tour-sistema-cap__acoes">
                      {st.started && !st.done ? (
                        <>
                          <button type="button" className="btn btn--primario btn--sm" onClick={() => start(c.id, st.step)} aria-describedby={headingId}>
                            <StepForward className="ic" aria-hidden="true" />Continuar de onde parei
                          </button>
                          <button type="button" className="btn btn--sm" onClick={() => start(c.id, 0, true)} aria-describedby={headingId}>
                            <RotateCcw className="ic" aria-hidden="true" />Recomeçar
                          </button>
                        </>
                      ) : st.done ? (
                        <button type="button" className="btn btn--sm" onClick={() => start(c.id, 0, true)} aria-describedby={headingId}>
                          <RotateCcw className="ic" aria-hidden="true" />Recomeçar
                        </button>
                      ) : (
                        <button type="button" className="btn btn--primario btn--sm" onClick={() => start(c.id, 0)} aria-describedby={headingId}>
                          <Play className="ic" aria-hidden="true" />Começar
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  )
}
