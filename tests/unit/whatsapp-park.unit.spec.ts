import { test, expect } from '@playwright/test'
import { park, stillParked, type ParkedMap } from '../../src/lib/whatsapp/park'

// QR sem ninguém escanear: a conexão fica estacionada até o cliente pedir um QR novo. Em produção (18/10/2026) a própria
// gravação de "QR expirou" mudava o updatedAt para depois da marca, e a sessão voltava a pedir QR ao WhatsApp a cada
// 15 s, sem fim (mais de 3 horas no log).
test.describe('WhatsApp · conexão estacionada', () => {
  test('a gravação de "QR expirou" não conta como pedido novo do cliente', async () => {
    const map: ParkedMap = new Map()
    const savedAt = new Date(Date.now() + 5) // o banco grava depois da hora em que decidimos estacionar
    await park(map, 'c1', async () => ({ updatedAt: savedAt }))
    // as próximas voltas do reconcile leem a linha como o banco a gravou
    for (let i = 0; i < 3; i++) expect(stillParked(map, 'c1', savedAt)).toBe(true)
  })

  test('o cliente pede QR de novo: a linha muda e a sessão volta (uma vez)', async () => {
    const map: ParkedMap = new Map()
    const savedAt = new Date()
    await park(map, 'c1', async () => ({ updatedAt: savedAt }))
    const askedAgain = new Date(savedAt.getTime() + 1000)
    expect(stillParked(map, 'c1', askedAgain)).toBe(false)
    expect(map.has('c1')).toBe(false)
    expect(stillParked(map, 'c1', askedAgain)).toBe(false)
  })

  test('enquanto grava, continua estacionada; conexão que nunca estacionou abre normal', async () => {
    const map: ParkedMap = new Map()
    let during: boolean | null = null
    await park(map, 'c1', async () => {
      during = stillParked(map, 'c1', new Date(Date.now() + 60000))
      return { updatedAt: new Date() }
    })
    expect(during).toBe(true)
    expect(stillParked(map, 'outra', new Date())).toBe(false)
  })

  test('falha ao gravar: fica estacionada com a hora atual e o erro sobe', async () => {
    const map: ParkedMap = new Map()
    await expect(park(map, 'c1', async () => { throw new Error('db fora') })).rejects.toThrow('db fora')
    expect(stillParked(map, 'c1', new Date(Date.now() - 1000))).toBe(true)
  })
})
