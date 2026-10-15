import type { Scenario } from '../types'
import { ATENDIMENTO } from './atendimento'
import { PLANOS } from './planos'
import { DADOS } from './dados'

/** Catálogo de cenários (ordem = ordem de execução de "rodar todos"). */
export const SCENARIOS: Scenario[] = [...ATENDIMENTO, ...PLANOS, ...DADOS]

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.id === id)

/** Resumo do catálogo para a tela, a API e o CLI. */
export const scenarioCatalog = () =>
  SCENARIOS.map((s) => ({ id: s.id, title: s.title, description: s.description, plan: s.plan, steps: s.steps.length }))
