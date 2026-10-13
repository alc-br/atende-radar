import { test, expect } from '@playwright/test'
import { classifyMessages, type AnalysisMessage } from '../../src/lib/analysis/classify'
import { extractPromise } from '../../src/lib/analysis/promises'
import type { ConversaRotulada } from './qualidade/tipos'
import { CONJUNTO_A } from './qualidade/conjunto-a'
import { CONJUNTO_B } from './qualidade/conjunto-b'
import { CONJUNTO_C } from './qualidade/conjunto-c'
import { CONJUNTO_VALIDACAO } from './qualidade/conjunto-validacao'
import { CONJUNTO_INDEPENDENTE } from './qualidade/conjunto-independente'
import { CONJUNTO_CEGO } from './qualidade/conjunto-cego'

// Qualidade dos alertas que dependem do texto, medida num conjunto rotulado (ver qualidade/tipos.ts).
// Precisão = dos alertas que o sistema daria, quantos estavam certos (alarme falso derruba a confiança no produto).
// Cobertura = dos casos que mereciam alerta, quantos o sistema pegou.
// Barra definida antes de medir: precisão ≥ 90% e cobertura ≥ 80% em cada alerta, no treino e na validação.
const PRECISAO_MIN = 0.9
const COBERTURA_MIN = 0.8

const ALTA = ['compra', 'agendamento', 'negociacao'] // mesma lista da regra high_intent_no_reply do motor

function sistema(c: ConversaRotulada) {
  const inicio = new Date('2030-01-07T12:00:00Z').getTime()
  const msgs: AnalysisMessage[] = c.msgs.map(([quem, text], i) => ({ direction: quem === 'c' ? 'inbound' : 'outbound', text, occurredAt: new Date(inicio + i * 60000) }))
  const cls = classifyMessages(msgs)
  return {
    alta: ALTA.includes(cls.intent ?? ''),
    preco: cls.intent === 'preco',
    frustrado: cls.sentiment === 'frustrated',
    promessa: msgs.some((m) => m.direction === 'outbound' && !!extractPromise(m.text, m.occurredAt)),
    intent: cls.intent,
  }
}

type Alerta = 'alta' | 'preco' | 'frustrado' | 'promessa'
const ALERTAS: Alerta[] = ['alta', 'preco', 'frustrado', 'promessa']
const esperado = (c: ConversaRotulada, a: Alerta) => (a === 'alta' || a === 'preco' ? c.pedido === a : c[a])

function medir(conjunto: readonly ConversaRotulada[]) {
  return ALERTAS.map((a) => {
    let vp = 0, fp = 0, fn = 0
    const erros: string[] = []
    for (const c of conjunto) {
      const s = sistema(c)
      const e = esperado(c, a)
      if (s[a] && e) vp++
      else if (s[a] && !e) { fp++; erros.push(`  alarme falso ${c.id} (intenção=${s.intent}): ${c.msgs.filter((m) => m[0] === 'c').map((m) => m[1]).join(' | ')}`) }
      else if (!s[a] && e) { fn++; erros.push(`  não pegou   ${c.id} (intenção=${s.intent}): ${c.msgs.map((m) => `${m[0]}: ${m[1]}`).join(' | ')}`) }
    }
    const precisao = vp + fp ? vp / (vp + fp) : 1
    const cobertura = vp + fn ? vp / (vp + fn) : 1
    return { alerta: a, vp, fp, fn, precisao, cobertura, erros }
  })
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4)

for (const [nome, conjunto] of [
  ['treino', [...CONJUNTO_A, ...CONJUNTO_B, ...CONJUNTO_C, ...CONJUNTO_INDEPENDENTE]],
  ['validação', CONJUNTO_VALIDACAO],
] as const) {
  test(`qualidade dos alertas (${nome}, ${conjunto.length} conversas)`, () => {
    const ids = conjunto.map((c) => c.id)
    expect(new Set(ids).size, 'ids repetidos').toBe(ids.length)
    const r = medir(conjunto)
    console.log(`\n${nome}: ${conjunto.length} conversas`)
    for (const x of r) console.log(`  ${x.alerta.padEnd(10)} precisão ${pct(x.precisao)}  cobertura ${pct(x.cobertura)}  (acertos ${x.vp}, alarmes falsos ${x.fp}, perdidos ${x.fn})`)
    for (const x of r) if (x.erros.length) console.log(`${x.alerta}:\n${x.erros.join('\n')}`)
    for (const x of r) {
      expect.soft(x.precisao, `precisão de ${x.alerta}`).toBeGreaterThanOrEqual(PRECISAO_MIN)
      expect.soft(x.cobertura, `cobertura de ${x.alerta}`).toBeGreaterThanOrEqual(COBERTURA_MIN)
    }
  })
}

// Conjunto CEGO (60 conversas escritas por outro agente, sem ver as regras): é a medida honesta do que um cliente novo
// vai ver. NUNCA ajustar regras olhando estes erros (deixaria de ser cego). Medido em 13/10/2026, só com regras de palavras:
//   alta precisão 100% cobertura 56% · preço 88%/100% · frustrado 75%/40% · promessa 100%/87%
// A barra aqui é "não piorar". Subir a cobertura de verdade pede o classificador com IA (source 'llm' em classify.ts).
const PISO_CEGO: Record<Alerta, { precisao: number; cobertura: number }> = {
  alta: { precisao: 1, cobertura: 0.55 },
  preco: { precisao: 0.85, cobertura: 1 },
  frustrado: { precisao: 0.75, cobertura: 0.4 },
  promessa: { precisao: 1, cobertura: 0.85 },
}
test(`qualidade dos alertas (cego, ${CONJUNTO_CEGO.length} conversas): não piorar`, () => {
  const r = medir(CONJUNTO_CEGO)
  console.log(`\ncego:${CONJUNTO_CEGO.length} conversas`)
  for (const x of r) console.log(`  ${x.alerta.padEnd(10)} precisão ${pct(x.precisao)}  cobertura ${pct(x.cobertura)}  (acertos ${x.vp}, alarmes falsos ${x.fp}, perdidos ${x.fn})`)
  for (const x of r) {
    expect.soft(x.precisao, `precisão de ${x.alerta}`).toBeGreaterThanOrEqual(PISO_CEGO[x.alerta].precisao)
    expect.soft(x.cobertura, `cobertura de ${x.alerta}`).toBeGreaterThanOrEqual(PISO_CEGO[x.alerta].cobertura)
  }
})
