import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'

// I8 · Motor incremental: a cada rodada só entram as conversas que podem mudar de estado — as que receberam mensagem
// desde a última rodada, as que estão esperando a empresa (alertas por tempo), com alerta/promessa em aberto,
// com oportunidade (abandono) ou paradas há tempo suficiente para encerrar. Conversa quieta e sem pendência não é reprocessada.
test('rodadas seguintes só reprocessam o que pode mudar; mensagem nova traz a conversa de volta', async ({}, info) => {
  test.skip(info.project.name !== 'api')
  const c = await setupCompany()
  await c.settings({ inactivityClose: '48', abandonTime: '48' })
  const quietA = newChat(), quietB = newChat(), waiting = newChat()
  // duas conversas "quietas": a empresa falou por último, sem preço/agendamento (sem oportunidade), sem promessa
  for (const chat of [quietA, quietB]) {
    await c.send(chat, 'Oi, tudo bem?', { minutes: 20, pushName: `Quieto ${chat.slice(5, 9)}` })
    await c.send(chat, 'Tudo ótimo! Qualquer coisa estamos à disposição.', { minutes: 15, fromMe: true })
  }
  // uma esperando a empresa: continua entrando (alerta por tempo)
  await c.send(waiting, 'Alguém aí?', { minutes: 5, pushName: 'Esperando' })

  const first = await c.tick({ onlyThisCompany: true })
  expect(first.conversations).toBe(3)
  const second = await c.tick({ onlyThisCompany: true })
  expect(second.conversations).toBe(1)

  // mensagem nova numa quieta → volta a ser analisada
  await c.send(quietA, 'Na verdade tenho uma dúvida', { minutes: 1, pushName: 'Quieto' })
  const third = await c.tick({ onlyThisCompany: true })
  expect(third.conversations).toBe(2)
  await c.dispose()
})
