import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// T2 · Matriz papel × tela, PELA TELA: o menu mostra exatamente o que o papel pode abrir, e cada tela permitida abre de verdade.
// A matriz é escrita à mão (spec §9), de propósito — não é importada do código de produção.
const ALL = ['admin', 'gestor', 'supervisor', 'analista', 'member', 'atendente', 'viewer'] as const
type Role = (typeof ALL)[number]
const OPERACAO: Role[] = ['admin', 'gestor', 'supervisor', 'atendente']
const GESTAO: Role[] = ['admin', 'gestor', 'supervisor']
const CONFIG: Role[] = ['admin', 'gestor']
const ADMIN: Role[] = ['admin']
const ANALISE: Role[] = ['admin', 'gestor', 'supervisor', 'analista']
const LEITURA_REL: Role[] = ['admin', 'gestor', 'supervisor', 'analista', 'viewer']

const SCREENS: Array<{ view: string; heading: RegExp; allowed: readonly Role[] }> = [
  { view: 'dashboard', heading: /Vis[ãa]o Geral/i, allowed: ALL },
  { view: 'alerts', heading: /Alertas/i, allowed: ALL },
  { view: 'conversations', heading: /Conversas/i, allowed: OPERACAO },
  { view: 'recovery', heading: /Recupera[çc][ãa]o/i, allowed: OPERACAO },
  { view: 'team', heading: /Equipe|Desempenho/i, allowed: ANALISE },
  { view: 'reports', heading: /Relat[óo]rios/i, allowed: LEITURA_REL },
  { view: 'connections', heading: /Conex[õo]es/i, allowed: GESTAO },
  { view: 'settings', heading: /Configura[çc][õo]es/i, allowed: CONFIG },
  { view: 'members', heading: /Membros/i, allowed: GESTAO },
  { view: 'teams', heading: /Equipes/i, allowed: GESTAO },
  { view: 'plans', heading: /Planos/i, allowed: ADMIN },
  { view: 'admin', heading: /Admin/i, allowed: [] }, // painel da plataforma: nenhum papel de cliente
]

for (const role of ALL) {
  test(`${role}: menu mostra só o permitido e cada tela permitida abre`, async ({ page, context, isMobile }, info) => {
    test.skip(info.project.name !== 'ui-desktop', 'matriz pela tela roda uma vez, no desktop')
    test.setTimeout(120000)
    const api = await loginAs(`${role}.a@test.local`)
    for (const s of SCREENS) await api.patch('/api/tours', { data: { tourId: s.view } })
    await api.patch('/api/tours', { data: { tourId: 'welcome' } })
    await context.addCookies((await api.storageState()).cookies)
    await api.dispose()

    await page.goto('/')
    await expect(page.locator('main').getByRole('heading', { name: /Vis[ãa]o Geral/i }).first()).toBeVisible({ timeout: 20000 })
    for (const s of SCREENS) {
      const item = page.locator(`[data-tour="nav-${s.view}"]`)
      if (s.allowed.includes(role)) await expect(item, `${role} deveria ver "${s.view}" no menu`).toBeVisible()
      else await expect(item, `${role} NÃO deveria ver "${s.view}" no menu`).toHaveCount(0)
    }
    for (const s of SCREENS.filter((x) => x.allowed.includes(role))) {
      if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
      await page.locator(`[data-tour="nav-${s.view}"]`).click()
      await expect(page.locator('main').getByRole('heading', { name: s.heading }).first(), `${role}: tela ${s.view}`).toBeVisible({ timeout: 15000 })
    }
  })
}
