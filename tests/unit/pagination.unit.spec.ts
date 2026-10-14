import { test, expect } from '@playwright/test'
import { pageParams, MAX_PAGE_SIZE } from '../../src/lib/pagination'

// T15 · Listas (conversas, alertas, recuperação, notificações) com teto de itens por página.
const p = (qs: string, def = 20) => pageParams(new URLSearchParams(qs), def)

test('sem parâmetros usa a página 1 e o padrão da rota', () => {
  expect(p('')).toEqual({ page: 1, limit: 20 })
  expect(p('', 15)).toEqual({ page: 1, limit: 15 })
})

test('o que as telas pedem passa sem mudança', () => {
  expect(p('limit=100&page=3')).toEqual({ page: 3, limit: 100 })
  expect(p('limit=1')).toEqual({ page: 1, limit: 1 })
  expect(p('limit=4', 30)).toEqual({ page: 1, limit: 4 })
  expect(p('limit=50')).toEqual({ page: 1, limit: 50 })
})

test('limite acima do teto é cortado', () => {
  expect(MAX_PAGE_SIZE).toBe(100)
  expect(p('limit=100000')).toEqual({ page: 1, limit: 100 })
})

test('valores inválidos voltam ao padrão', () => {
  expect(p('limit=abc&page=xyz')).toEqual({ page: 1, limit: 20 })
  expect(p('limit=-5&page=-2')).toEqual({ page: 1, limit: 1 })
  expect(p('page=0')).toEqual({ page: 1, limit: 20 })
})
