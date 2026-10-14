import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAs, signupOrg, STRONG, uid } from './helpers'
import { testDb } from './db'
import { TOURS } from '../../src/lib/tours'
import { TERMS_VERSION } from '../../src/lib/legal'

// P7/B1/B9/V4/T1 · Na tela: aceite dos termos no cadastro, "Meu perfil" pelo menu do usuário e convites pendentes.

const NEW_PASS = 'Outra-Senha-2026y'

/** Entra numa organização nova (dona = admin) com os guias de tela já vistos. */
async function enterNewOrg(context: BrowserContext, name = 'Dona Perfil') {
  const { email, password } = await signupOrg({ name })
  const api = await loginAs(email, password)
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  return { email, password, api }
}

async function openProfile(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu do usuário' }).click()
  await page.getByRole('menuitem', { name: 'Meu perfil' }).click()
  await expect(page.locator('main').getByRole('heading', { name: 'Meu perfil' })).toBeVisible()
  await expect(page.locator('#profile-name')).toBeVisible({ timeout: 15_000 })
}

test.describe('Cadastro: aceite dos termos', () => {
  test('caixa de aceite é obrigatória e os links abrem Termos e Privacidade em nova aba', async ({ page }) => {
    const email = `ui.termos.${uid()}@cliente.test`
    await page.goto('/')
    await page.locator('header').getByRole('link', { name: /Começar teste grátis/ }).click()
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()

    const termos = page.getByRole('link', { name: 'Termos de Uso' })
    const privacidade = page.getByRole('link', { name: 'Política de Privacidade' })
    await expect(termos).toHaveAttribute('href', /\/termos$/)
    await expect(termos).toHaveAttribute('target', '_blank')
    await expect(privacidade).toHaveAttribute('href', /\/privacidade$/)
    await expect(privacidade).toHaveAttribute('target', '_blank')
    const caixa = page.getByRole('checkbox', { name: /Li e aceito os Termos de Uso e a Política de Privacidade/ })
    await expect(caixa).not.toBeChecked()

    await page.locator('#signup-name').fill('Dona Termos')
    await page.locator('#login-email').fill(email)
    await page.locator('#login-password').fill(STRONG)
    await page.locator('#signup-org').fill(`Empresa Termos ${uid()}`)
    await page.getByRole('button', { name: /Iniciar teste grátis/ }).click()
    // o navegador barra o envio: a caixa fica inválida e nenhuma conta é criada
    expect(await caixa.evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true)
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()
    expect(await testDb.organizationMember.count({ where: { email } })).toBe(0)

    await caixa.check()
    await page.getByRole('button', { name: /Iniciar teste grátis/ }).click()
    await expect(page.getByTestId('trial-banner')).toBeVisible({ timeout: 20_000 })
    const m = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
    expect(m.termsVersion).toBe(TERMS_VERSION)
    expect(m.termsAcceptedAt).not.toBeNull()
  })
})

test.describe('Meu perfil', () => {
  test('abre pelo menu do usuário e altera o nome', async ({ page, context }) => {
    const { api } = await enterNewOrg(context, 'Nome Antigo')
    await openProfile(page)
    await expect(page.locator('#profile-name')).toHaveValue('Nome Antigo')
    await expect(page.locator('#profile-email')).toHaveAttribute('readonly', '')
    await expect(page.getByText(/aceitos em/)).toBeVisible()

    await page.locator('#profile-name').fill('Nome Novo')
    await page.getByRole('button', { name: 'Salvar nome' }).click()
    await expect(page.getByText('Nome atualizado.')).toBeVisible()
    expect((await (await api.get('/api/profile')).json()).profile.name).toBe('Nome Novo')
    await api.dispose()
  })

  test('troca a senha: confirmação diferente e senha atual errada mostram o erro; certa troca e continua logado', async ({ page, context }) => {
    const { email, password, api } = await enterNewOrg(context)
    await openProfile(page)

    await page.locator('#profile-current-password').fill(password)
    await page.locator('#profile-new-password').fill(NEW_PASS)
    await page.locator('#profile-confirm-password').fill('Diferente-2026z')
    await page.getByRole('button', { name: 'Trocar senha' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'A confirmação não é igual à nova senha.' })).toBeVisible()

    await page.locator('#profile-current-password').fill('Errada-Senha-2026')
    await page.locator('#profile-confirm-password').fill(NEW_PASS)
    await page.getByRole('button', { name: 'Trocar senha' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Senha atual incorreta.' })).toBeVisible()

    await page.locator('#profile-current-password').fill(password)
    await page.getByRole('button', { name: 'Trocar senha' }).click()
    await expect(page.getByText('Senha alterada. Os outros aparelhos precisarão entrar de novo.')).toBeVisible()
    await expect(page.locator('#profile-current-password')).toHaveValue('')

    // este navegador continua logado; a sessão aberta antes, em outro lugar, caiu
    expect((await page.request.get('/api/profile')).status()).toBe(200)
    expect((await api.get('/api/profile')).status()).toBe(401)
    const nova = await loginAs(email, NEW_PASS)
    expect((await nova.get('/api/profile')).status()).toBe(200)
    await Promise.all([api.dispose(), nova.dispose()])
  })

  test('"Sair de todos os aparelhos" pede confirmação, derruba as outras sessões e mantém esta', async ({ page, context }) => {
    const { api } = await enterNewOrg(context)
    await openProfile(page)

    await page.getByRole('button', { name: 'Sair de todos os aparelhos' }).click()
    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo).toContainText('Sair de todos os aparelhos?')
    await dialogo.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogo).toHaveCount(0)
    expect((await api.get('/api/profile')).status()).toBe(200) // cancelou: nada mudou

    await page.getByRole('button', { name: 'Sair de todos os aparelhos' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sair dos outros aparelhos' }).click()
    await expect(page.getByText('Pronto: você saiu de todos os outros aparelhos.')).toBeVisible()
    expect((await api.get('/api/profile')).status()).toBe(401)
    expect((await page.request.get('/api/profile')).status()).toBe(200)
    await api.dispose()
  })
})

test.describe('Membros: convite pendente', () => {
  async function openMembers(page: Page, isMobile: boolean) {
    await page.goto('/')
    if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page.locator('[data-tour="nav-members"]').click()
  }

  test('reenviar convite gera link novo; cancelar pede confirmação e tira o convite da lista', async ({ page, context, isMobile }) => {
    const { api } = await enterNewOrg(context)
    const convidado = `ui.pendente.${uid()}@test.local`
    const { member } = await (await api.post('/api/members', { data: { name: 'Pendente UI', email: convidado, role: 'member' } })).json()
    const tokensAntes = await testDb.authToken.count({ where: { memberId: member.id, type: 'invite' } })

    await openMembers(page, !!isMobile)
    const linha = page.locator('table tbody tr').filter({ hasText: convidado })
    await expect(linha).toBeVisible({ timeout: 15_000 })
    await expect(linha).toContainText('Convite enviado')

    await linha.getByRole('button', { name: 'Mais ações' }).click()
    await expect(page.getByRole('menuitem', { name: 'Remover' })).toHaveCount(0) // convite pendente se cancela, não se remove
    await page.getByRole('menuitem', { name: 'Reenviar convite' }).click()
    await expect(page.getByText(/Convite reenviado\./)).toBeVisible()
    await expect.poll(() => testDb.authToken.count({ where: { memberId: member.id, type: 'invite' } })).toBe(tokensAntes + 1)

    await linha.getByRole('button', { name: 'Mais ações' }).click()
    await page.getByRole('menuitem', { name: 'Cancelar convite' }).click()
    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo).toContainText(`Cancelar o convite de ${convidado}?`)
    await dialogo.getByRole('button', { name: 'Voltar' }).click()
    await expect(linha).toBeVisible()

    await linha.getByRole('button', { name: 'Mais ações' }).click()
    await page.getByRole('menuitem', { name: 'Cancelar convite' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar convite' }).click()
    await expect(page.getByText(`Convite de ${convidado} cancelado.`)).toBeVisible()
    await expect(linha).toHaveCount(0)
    expect(await testDb.organizationMember.count({ where: { id: member.id } })).toBe(0)
    await api.dispose()
  })
})
