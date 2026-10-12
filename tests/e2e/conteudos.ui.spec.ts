import { test, expect } from '@playwright/test'
import { ARTIGOS } from '../../src/content/artigos'

// Blog (lista e artigo) e páginas legais: tudo navegável, sem links mortos.
test.describe('Conteúdos', () => {
  test('lista todos os artigos; busca e filtros funcionam, com estado vazio', async ({ page }) => {
    await page.goto('/conteudos')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const cartoes = page.locator('a.cartao')
    await expect(cartoes).toHaveCount(ARTIGOS.length)
    for (const a of ARTIGOS) await expect(page.locator(`a.cartao[href="/conteudos/${a.slug}"]`)).toBeAttached()

    const busca = page.getByRole('searchbox')
    await busca.fill('tempo de resposta')
    await expect(page.locator(`a.cartao[href="/conteudos/${ARTIGOS[1].slug}"]`)).toBeVisible()
    await expect.poll(() => page.locator('a.cartao:visible').count()).toBeLessThan(ARTIGOS.length)
    await busca.fill('xyzsemresultado')
    await expect(page.locator('a.cartao:visible')).toHaveCount(0)
    await expect(page.getByText('Nenhum conteúdo encontrado')).toBeVisible()
    await busca.fill('')

    await page.getByRole('button', { name: 'Clínicas' }).click()
    await expect(page.getByRole('button', { name: 'Clínicas' })).toHaveAttribute('aria-pressed', 'true')
    const visiveis = await page.locator('a.cartao:visible').count()
    expect(visiveis).toBeGreaterThan(0)
    expect(visiveis).toBeLessThan(ARTIGOS.length)
    await page.getByRole('button', { name: 'Todos' }).click()
    await expect(page.locator('a.cartao:visible')).toHaveCount(ARTIGOS.length)
  })

  test('abrir um artigo: título, compartilhar, leia também e volta ao blog', async ({ page }) => {
    await page.goto('/conteudos')
    const a = ARTIGOS[1]
    await page.locator(`a.cartao[href="/conteudos/${a.slug}"]`).click()
    await expect(page).toHaveURL(new RegExp(`/conteudos/${a.slug}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(a.titulo)

    const wa = page.getByRole('link', { name: 'Compartilhar no WhatsApp' })
    await expect(wa).toHaveAttribute('href', new RegExp(encodeURIComponent(`/conteudos/${a.slug}`)))
    await expect(page.locator('.lado').getByRole('link').filter({ hasText: /\S/ })).not.toHaveCount(0)

    await page.getByRole('link', { name: 'Ver todos os artigos' }).click()
    await expect(page).toHaveURL(/\/conteudos$/)
  })

  test('artigo inexistente dá 404', async ({ page }) => {
    const res = await page.goto('/conteudos/nao-existe')
    expect(res?.status()).toBe(404)
  })

  for (const [path, titulo] of [['/privacidade', 'Política de Privacidade'], ['/termos', 'Termos de Uso']]) {
    test(`${titulo} abre e o rodapé leva aos artigos e às páginas legais`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
      const footer = page.locator('footer')
      await expect(footer.getByRole('link', { name: 'Artigos' })).toHaveAttribute('href', '/conteudos')
      await expect(footer.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
      await expect(footer.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos')
    })
  }
})
