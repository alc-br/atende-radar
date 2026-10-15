import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'
import { APPROVED, DECLINED, MASTERCARD } from './pagarme'

// B8 · Checkout transparente na TELA, contra o sandbox real do Pagar.me: o navegador gera o token do cartão com a
// chave pública, o servidor cria a assinatura e a tela Planos passa a mostrar cartão, faturas e cancelamento.

async function enter(context: BrowserContext) {
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  for (const tourId of ['welcome', 'dashboard', 'connections', 'members', 'plans']) await api.patch('/api/tours', { data: { tourId } })
  const enabled = (await (await api.get('/api/billing')).json()).enabled as boolean
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
  return enabled
}

async function openCheckout(page: Page, planCode: string) {
  await page.goto('/')
  await page.getByTestId('trial-banner').getByRole('button', { name: /Ver planos/ }).click()
  await page.getByTestId(`plan-${planCode}`).getByRole('button', { name: /Assinar/ }).click()
  await expect(page.locator('main').getByRole('heading', { name: 'Contratar plano' })).toBeVisible()
}

// No Firefox o clique na opção às vezes chega cedo demais e a lista fica aberta, deixando o resto da página inerte:
// tenta de novo até a lista fechar com a UF escolhida.
async function chooseUf(page: Page, prefix: string, uf: string) {
  const trigger = page.locator(`#${prefix}-state`)
  const listbox = page.getByRole('listbox')
  await expect(async () => {
    if (!(await listbox.count())) await trigger.click()
    await page.getByRole('option', { name: uf, exact: true }).click({ timeout: 3_000 })
    await expect(listbox).toHaveCount(0, { timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect(trigger).toContainText(uf)
}

// Mesmo endereço que o ViaCEP devolve para o CEP: o preenchimento automático (se chegar) não muda nada
async function fillAddress(page: Page, prefix = 'addr') {
  await page.locator(`#${prefix}-zip`).fill('01310100')
  await page.locator(`#${prefix}-number`).click()
  await page.locator(`#${prefix}-street`).fill('Avenida Paulista')
  await page.locator(`#${prefix}-number`).fill('1000')
  await page.locator(`#${prefix}-neighborhood`).fill('Bela Vista')
  await page.locator(`#${prefix}-city`).fill('São Paulo')
  await chooseUf(page, prefix, 'SP')
}

async function fillCard(page: Page, card: { number: string; cvv: string }) {
  await page.locator('#card-number').fill(card.number)
  await page.locator('#card-holder').fill('maria silva')
  await page.locator('#card-expiry').fill('1231')
  await page.locator('#card-cvv').fill(card.cvv)
}

async function fillHolder(page: Page) {
  await page.locator('#holder-name').fill('Clínica Teste Ltda')
  await page.locator('#holder-document').fill('11222333000181')
  await page.locator('#holder-phone').fill('11999998888')
  await page.locator('#holder-email').fill('financeiro@cliente.test')
}

test.describe('B8 · checkout na tela (sandbox Pagar.me)', () => {
  test('contrata com cartão, vê fatura paga, troca o cartão, cancela e reativa a renovação', async ({ page, context }) => {
    test.setTimeout(180_000)
    test.skip(!(await enter(context)), 'sem chaves do Pagar.me neste ambiente')
    await openCheckout(page, 'essencial')

    await expect(page.getByTestId('checkout-test-mode')).toBeVisible()
    await expect(page.getByTestId('checkout-plan')).toHaveText('Essencial')
    await page.getByRole('radio', { name: 'Anual' }).click()
    await expect(page.getByTestId('checkout-price')).toContainText('1.490')
    await page.getByRole('radio', { name: 'Mensal' }).click()
    await expect(page.getByTestId('checkout-price')).toContainText('149')

    await fillHolder(page)
    await fillAddress(page)
    await fillCard(page, APPROVED)
    await expect(page.locator('#card-number')).toHaveValue('4000 0000 0000 0010')
    await expect(page.locator('#card-holder')).toHaveValue('MARIA SILVA')
    await expect(page.locator('#card-expiry')).toHaveValue('12/31')
    await expect(page.getByTestId('card-brand')).toHaveText('Visa')

    await page.getByRole('button', { name: /^Pagar/ }).click()
    const done = page.getByTestId('checkout-done')
    await expect(done).toContainText('Pagamento aprovado', { timeout: 60_000 })
    await expect(page.getByTestId('trial-banner')).toHaveCount(0)

    await done.getByRole('button', { name: 'Ir para Planos' }).click()
    await expect(page.getByTestId('subscription-status')).toHaveText('Ativa')
    await expect(page.getByTestId('card-on-file')).toContainText('final 0010')
    await expect(page.getByTestId('invoices')).toContainText('Paga')
    await expect(page.getByTestId('plan-essencial').getByRole('button', { name: 'Plano atual' })).toBeDisabled()

    // troca de cartão: novo token gerado no navegador
    await page.getByRole('button', { name: 'Trocar cartão' }).click()
    const dialog = page.getByRole('dialog')
    await fillCard(page, MASTERCARD)
    await fillAddress(page, 'card-addr')
    await dialog.getByRole('button', { name: 'Salvar cartão' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 60_000 })
    await expect(page.getByTestId('card-on-file')).toContainText('final 4444')

    // cancelamento: confirma, para de renovar e o plano vale até o fim do período
    await page.getByRole('button', { name: 'Cancelar renovação' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar renovação' }).click()
    await expect(page.getByTestId('subscription-status')).toHaveText('Não renova', { timeout: 30_000 })
    await expect(page.getByTestId('current-plan')).toContainText('Vale até')
    await expect(page.getByRole('button', { name: 'Trocar cartão' })).toHaveCount(0)

    // V7 · reativação antes do fim do período: confirma, volta a renovar no mesmo cartão e nada é cobrado agora
    await page.getByTestId('renewal-canceled').getByRole('button', { name: 'Reativar renovação' }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText('final 4444')
    await confirm.getByRole('button', { name: 'Reativar renovação' }).click()
    await expect(page.getByTestId('subscription-status')).toHaveText('Ativa', { timeout: 30_000 })
    await expect(page.getByTestId('renewal-canceled')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancelar renovação' })).toBeVisible()
    await expect(page.getByTestId('invoices').getByText('Paga', { exact: true })).toHaveCount(1)
  })

  test('cartão recusado mostra o motivo e continua no checkout, sem ativar o plano', async ({ page, context }) => {
    test.setTimeout(120_000)
    test.skip(!(await enter(context)), 'sem chaves do Pagar.me neste ambiente')
    await openCheckout(page, 'gestao')
    await fillHolder(page)
    await fillAddress(page)
    await fillCard(page, DECLINED)
    await page.getByRole('button', { name: /^Pagar/ }).click()
    await expect(page.getByTestId('checkout-error')).toContainText(/recusado/i, { timeout: 60_000 })
    await expect(page.locator('#card-cvv')).toHaveValue('')
    await expect(page.getByTestId('checkout-done')).toHaveCount(0)
  })

  test('dados inválidos são barrados na tela antes de qualquer cobrança', async ({ page, context }) => {
    test.skip(!(await enter(context)), 'sem chaves do Pagar.me neste ambiente')
    await openCheckout(page, 'essencial')
    const calls: string[] = []
    page.on('request', (r) => { if (/pagar\.me|\/api\/billing\/checkout/.test(r.url())) calls.push(r.url()) })
    await fillHolder(page)
    await page.locator('#holder-document').fill('11111111111')
    await fillAddress(page)
    await fillCard(page, APPROVED)
    await page.getByRole('button', { name: /^Pagar/ }).click()
    await expect(page.getByTestId('checkout-error')).toHaveText('CPF ou CNPJ inválido')
    await page.locator('#holder-document').fill('11222333000181')
    await page.locator('#card-number').fill('4000000000000011')
    await page.getByRole('button', { name: /^Pagar/ }).click()
    await expect(page.getByTestId('checkout-error')).toHaveText('Número do cartão inválido')
    expect(calls).toEqual([])
  })
})
