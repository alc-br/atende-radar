import type { View } from '../store'
import type { Permission } from '../permissions'
import type { TourSignal } from './signals'

/**
 * Tipos de passo do "Tour pelo sistema":
 * - info: explica um item (com destaque, se o alvo existir na tela).
 * - click: só avança quando a pessoa clica no elemento destacado.
 * - task: pede um cadastro e avança sozinho quando a tela avisa que deu certo (tourSignal).
 */
export type SystemStepKind = 'info' | 'click' | 'task'

/** Ação simulada pela leitura automática (ver SystemTourStep.autoAction). */
export type AutoAction = 'click' | 'select' | 'demo'

/** O que a leitura automática faz no passo: cadastro nunca é executado; sem definição, só demonstra. */
export const autoActionOf = (step: { kind: SystemStepKind; autoAction?: AutoAction }): AutoAction =>
  step.kind === 'click' ? step.autoAction ?? 'demo' : 'demo'

/** Texto do passo: parágrafos e listas curtas. **negrito** vira <strong>. */
export type SystemTourBlock = string | { list: string[] }

export interface SystemTourStep {
  /** Identificador estável dentro do capítulo. */
  id: string
  kind: SystemStepKind
  title: string
  body: SystemTourBlock[]
  /** Valor do atributo data-tour do elemento destacado. */
  target?: string
  /** Tela que o próprio tour abre antes de mostrar o passo. */
  view?: View
  /** Para "task": o aviso que conclui o passo. */
  signal?: TourSignal
  /** Instrução curta mostrada em destaque (ex.: "Clique em Criar equipe"). */
  action?: string
  /**
   * O que a leitura automática faz neste passo (ninguém clica nada nesse modo; um cursor simulado mostra a ação):
   * - click: navegação (menu, tela, botão que só abre um formulário); o tour clica de verdade.
   * - select: aba ou filtro; o item aparece escolhido e o tour clica de verdade.
   * - demo: só mostra onde fica, sem executar. Padrão quando não definido, e sempre em "task" (cadastro, envio,
   *   exclusão, pagamento nunca são executados pelo tour).
   */
  autoAction?: AutoAction
  /** Passo só aparece para quem tem esta permissão. */
  requires?: Permission
  /**
   * O que a voz fala neste passo: explica o item (o que é, para que serve, por que importa), sem repetir a tela.
   * Texto corrido para TTS: sem markdown, emojis ou siglas difíceis; até NARRATION_MAX caracteres.
   * Sem narração, a voz lê o texto da tela (stepSpeechText).
   */
  narration?: string
  /**
   * Região de que o passo fala (data-tour), em meia-luz ao redor do alvo: o alvo fica aceso, a região em meia-luz e o
   * resto da tela mais escuro. Sem definição: o menu lateral para alvos do menu, o topo para alvos do topo (stepArea).
   */
  area?: string
  /** Momentos da narração que mudam o destaque enquanto a voz fala (narration.ts, NARRATION_CUES). */
  cues?: NarrationCue[]
}

/**
 * Enquanto a voz fala, a partir do trecho `at` da narração o destaque passa a ser:
 * - area: a região inteira acesa e contornada (a voz está falando dela);
 * - target: o alvo aceso com o anel, a região em meia-luz (a voz está falando do item onde se clica).
 */
export interface NarrationCue {
  at: string
  focus: SpotlightFocus
}

export type SpotlightFocus = 'area' | 'target'

export interface SystemTourChapter {
  id: string
  title: string
  /** Uma linha: para que serve o capítulo. */
  summary: string
  /** Telas que o capítulo usa: o capítulo só aparece se o papel abre TODAS. */
  views: View[]
  /** Permissão extra exigida (ex.: só quem gerencia equipes). */
  requires?: Permission
  /** Só para o operador da plataforma (painel Admin). */
  platformOnly?: boolean
  steps: SystemTourStep[]
}
