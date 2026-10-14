import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'

// B6 · Perguntas ignoradas: o motor registra a pergunta do cliente que passou do SLA sem resposta (idempotente)
// e marca como respondida quando a empresa responde depois. Aparece em "Perguntas em aberto" no detalhe da conversa.
type Question = { id: string; normalizedQuestion: string; status: string; answeredByMessage: string | null }

test('pergunta sem resposta além do SLA vira pergunta em aberto; resposta da empresa marca como respondida', async ({}, info) => {
  test.skip(info.project.name !== 'api')
  const c = await setupCompany()
  await c.settings({ slaFirst: '10', slaContinuity: '30' })
  const ignorada = newChat(), recente = newChat(), respondida = newChat()
  await c.send(ignorada, 'Vocês aceitam cartão?', { minutes: 30, pushName: 'Pergunta Ignorada' })
  await c.send(recente, 'Quanto custa a limpeza?', { minutes: 3, pushName: 'Pergunta Recente' })
  await c.send(respondida, 'Qual o endereço?', { minutes: 40, pushName: 'Pergunta Respondida' })
  await c.send(respondida, 'Rua das Flores, 100.', { minutes: 38, fromMe: true })
  await c.tick({ onlyThisCompany: true })

  const questionsOf = async (name: string) => {
    const conv = (await c.conversations(name))[0]
    const detail = await (await c.admin.get(`/api/conversations/${conv.id}`)).json()
    return detail.openQuestions as Question[]
  }

  const first = await questionsOf('Pergunta Ignorada')
  expect(first).toHaveLength(1)
  expect(first[0]).toMatchObject({ normalizedQuestion: 'Vocês aceitam cartão?', status: 'open', answeredByMessage: null })
  expect(await questionsOf('Pergunta Recente')).toHaveLength(0) // ainda dentro do SLA
  expect(await questionsOf('Pergunta Respondida')).toHaveLength(0) // respondida a tempo

  // rodar de novo não duplica
  await c.tick({ onlyThisCompany: true })
  expect(await questionsOf('Pergunta Ignorada')).toHaveLength(1)

  // a empresa responde → a mesma pergunta passa a "respondida"
  await c.send(ignorada, 'Aceitamos sim, em até 3x.', { fromMe: true })
  await c.tick({ onlyThisCompany: true })
  const after = await questionsOf('Pergunta Ignorada')
  expect(after).toHaveLength(1)
  expect(after[0].id).toBe(first[0].id)
  expect(after[0].status).toBe('answered')
  expect(after[0].answeredByMessage).toBeTruthy()
  await c.dispose()
})

test('pergunta marcada como respondida à mão não volta a ficar em aberto', async ({}, info) => {
  test.skip(info.project.name !== 'api')
  const c = await setupCompany()
  const chat = newChat()
  await c.send(chat, 'Tem estacionamento?', { minutes: 30, pushName: 'Pergunta Manual' })
  await c.tick({ onlyThisCompany: true })
  const conv = (await c.conversations('Pergunta Manual'))[0]
  const q = ((await (await c.admin.get(`/api/conversations/${conv.id}`)).json()).openQuestions as Question[])[0]
  expect(q.status).toBe('open')

  expect((await c.admin.patch(`/api/open-questions/${q.id}`, { data: { status: 'answered' } })).status()).toBe(200)
  await c.send(chat, 'Oi??', { minutes: 1, pushName: 'Pergunta Manual' })
  await c.tick({ onlyThisCompany: true })
  const qs = (await (await c.admin.get(`/api/conversations/${conv.id}`)).json()).openQuestions as Question[]
  expect(qs).toHaveLength(1)
  expect(qs[0].status).toBe('answered')
  await c.dispose()
})
