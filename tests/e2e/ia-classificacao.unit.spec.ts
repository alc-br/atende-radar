import { test, expect } from '@playwright/test'
import { aiClassifyMany, aiEnabled, aiKey, fromSaida, transcript } from '../../src/lib/analysis/ai-classify'
import type { AnalysisMessage } from '../../src/lib/analysis/classify'

// Item 8 · classificação pelo Claude. Sem chave e sem AI_CLASSIFIER=claude (CI, testes) fica desligada e o motor segue
// nas regras de palavras. Aqui só o que não chama a API: tradução da resposta, transcrição e chave do cache.
const at = (min: number) => new Date(Date.UTC(2026, 9, 21, 12, min))
const msg = (direction: AnalysisMessage['direction'], text: string | null, min: number): AnalysisMessage => ({ direction, text, occurredAt: at(min) })

test('desligada sem AI_CLASSIFIER=claude e chave: nada é chamado', async () => {
  expect(aiEnabled()).toBe(false)
  expect((await aiClassifyMany('org', [{ id: 'c1', messages: [msg('inbound', 'quanto custa?', 0)] }], {})).size).toBe(0)
})

test('resposta do Claude vira a mesma classificação das regras, com origem llm', () => {
  expect(fromSaida({ intent: 'preco', urgency: 'normal', sentiment: 'frustrated', confidence: 'alta' }))
    .toEqual({ intent: 'preco', stage: 'price', urgency: 'normal', sentiment: 'frustrated', confidence: 0.9, source: 'llm' })
  expect(fromSaida({ intent: 'nenhuma', urgency: 'low', sentiment: 'neutral', confidence: 'baixa' }))
    .toMatchObject({ intent: null, stage: 'discovery', confidence: 0.55 })
  expect(fromSaida({ intent: 'compra', urgency: 'high', sentiment: 'positive', confidence: 'media' })).toMatchObject({ stage: 'decision', confidence: 0.75 })
})

test('transcrição: quem falou, sem mídia vazia, cortada no fim da conversa', () => {
  const t = transcript([msg('inbound', 'oi,\n  tudo bem?', 0), msg('outbound', null, 1), msg('outbound', 'Tudo! Como ajudo?', 2)])
  expect(t).toBe('CLIENTE: oi, tudo bem?\nEMPRESA: Tudo! Como ajudo?')
  const longa = transcript(Array.from({ length: 80 }, (_, i) => msg('inbound', `mensagem ${i} ${'x'.repeat(200)}`, i)))
  expect(longa.length).toBeLessThanOrEqual(6000)
  expect(longa).toContain('mensagem 79')
  expect(longa).not.toContain('mensagem 0 ')
})

test('cache: mesma conversa e contexto, mesma chave; texto ou segmento diferente, chave nova', () => {
  const k = aiKey('CLIENTE: oi', { segment: 'estetica' })
  expect(aiKey('CLIENTE: oi', { segment: 'estetica' })).toBe(k)
  expect(aiKey('CLIENTE: oi?', { segment: 'estetica' })).not.toBe(k)
  expect(aiKey('CLIENTE: oi', { segment: 'odontologia' })).not.toBe(k)
})
