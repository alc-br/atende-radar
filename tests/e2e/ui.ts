import { expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAs } from './helpers'
import { TOURS } from '../../src/lib/tours'

/** Entra no navegador como `email`. Por padrão marca todos os tours como vistos (eles cobririam a tela). */
export async function enter(context: BrowserContext, email: string, password = 'demo123', opts: { tours?: boolean } = {}) {
  const api = await loginAs(email, password)
  if (opts.tours !== false) {
    for (const tourId of ['welcome', ...Object.keys(TOURS)]) await api.patch('/api/tours', { data: { tourId } })
  }
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

/** Abre uma tela pelo menu lateral (no celular, pelo botão "Abrir menu"). */
export async function openView(page: Page, view: string, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator(`[data-tour="nav-${view}"]`).click()
}

/** Página inicial carregada (Visão Geral). */
export async function home(page: Page) {
  await page.goto('/')
  await expect(page.locator('main').getByRole('heading', { name: /Vis[ãa]o Geral/i }).first()).toBeVisible({ timeout: 20000 })
}
