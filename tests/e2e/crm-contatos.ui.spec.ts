import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { TOURS } from '../../src/lib/tours'
import { createUser, loginAs, STRONG, uid } from './helpers'
import { crmCompany, enter, openView, settle } from './crm-ui'
import { crmOffAfterFile } from './crm-cleanup'

// F9 · CRM-01 na interface (telas Contatos e Empresas): cadastro pelo diálogo, erros de campo, aviso de cadastro
// repetido, busca com a espera de 300 ms e o que o atendente não vê. Cada teste confere o efeito pela API e tem o seu
// negativo. A validação e a busca só pela API ficam em crm-matriz e crm-api. Dados inventados.

crmOffAfterFile()

type Pessoa = {
  id: string
  name: string
  email: string | null
  phoneLast4: string | null
  hasPhone: boolean
  companyId: string | null
  ownerMemberId: string | null
  status: string
  version: number
}
type Empresa = { id: string; name: string; taxId: string | null; domain: string | null; segment: string | null; ownerMemberId: string | null; status: string }

/** Só letras: nomes e e-mails sem dígitos não casam com a busca pelos 4 últimos do telefone. */
const letras = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')

/** Celular sintético de DDD 11, nos formatos da tela e internacional (o servidor chega à mesma chave). */
function celular() {
  const n = `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
  const corpo = `${n.slice(0, 5)}-${n.slice(5)}`
  return { n, last4: n.slice(-4), local: `(11) ${corpo}`, intl: `+55 (11) ${corpo}` }
}

/** CNPJ sintético (14 dígitos; a tela e o servidor só conferem a quantidade). */
function cnpj() {
  const d = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('')
  return { digits: d, formatado: `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` }
}

async function people(api: APIRequestContext, params: Record<string, string> = {}) {
  const r = await api.get('/api/crm/contacts', { params: { limit: '100', ...params } })
  expect(r.status(), await r.text()).toBe(200)
  return (await r.json()) as { items: Pessoa[]; total: number }
}

async function companies(api: APIRequestContext, params: Record<string, string> = {}) {
  const r = await api.get('/api/crm/companies', { params: { limit: '100', ...params } })
  expect(r.status(), await r.text()).toBe(200)
  return (await r.json()) as { items: Empresa[]; total: number }
}

async function newPerson(api: APIRequestContext, data: Record<string, unknown>) {
  const r = await api.post('/api/crm/contacts', { data })
  expect(r.status(), await r.text()).toBe(201)
  return ((await r.json()) as { person: Pessoa }).person
}

async function newCompany(api: APIRequestContext, data: Record<string, unknown>) {
  const r = await api.post('/api/crm/companies', { data })
  expect(r.status(), await r.text()).toBe(201)
  return ((await r.json()) as { company: Empresa }).company
}

/** Nome do membro logado, o mesmo que a tela usa em "Nome (você)". */
async function meuNome(api: APIRequestContext) {
  const r = await api.get('/api/me')
  expect(r.status()).toBe(200)
  return ((await r.json()) as { member: { name: string } }).member.name
}

/** Atendente convidado, logado na API e com os guias vistos (como member() em crm-telas.ui.spec.ts). */
async function atendente(admin: APIRequestContext) {
  const email = `atendente.${uid()}@cliente.test`
  const member = await createUser(admin, { email, role: 'atendente' })
  const api = await loginAs(email, STRONG)
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) await api.patch('/api/tours', { data: { tourId } })
  return { api, id: member.id, nome: await meuNome(api) }
}

/** Entra pela Visão geral e abre a tela pelo menu. */
async function abrir(page: Page, view: string, h1: string) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible({ timeout: 20000 })
  await settle(page)
  await openView(page, view)
  await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible({ timeout: 20000 })
}

const aviso = (page: Page, text: string) => page.locator('[data-sonner-toast]').getByText(text, { exact: true })

/** O aviso (canto de cima) pausa enquanto o mouse está sobre ele e pode cobrir botões: tira o mouse e espera sumir. */
async function semAvisos(page: Page) {
  const h = page.viewportSize()?.height ?? 800
  await page.mouse.move(2, h - 2)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15000 })
}

/** Nomes na tabela (cada linha tem um único botão, o do nome); vazio enquanto a lista carrega. */
const nomesNa = (tabela: Locator) => async () => (await tabela.getByRole('button').allInnerTexts()).map((s) => s.trim()).sort()

/** Resposta da lista de contatos com exatamente estes filtros (a tela troca a lista só quando ela chega). */
function listaCom(page: Page, path: string, want: Record<string, string>) {
  return page.waitForResponse(
    (r) => {
      const u = new URL(r.url())
      return u.pathname === path && r.request().method() === 'GET' && Object.entries(want).every(([k, v]) => (u.searchParams.get(k) ?? '') === v)
    },
    { timeout: 15000 },
  )
}

test('CRM-01 · novo contato pelo diálogo (nome, telefone, e-mail e empresa) entra na lista com o telefone mascarado e fica gravado', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const tag = letras()
  const empresa = await newCompany(c.admin, { name: `Padaria Horizonte ${tag}` })
  const fone = celular()
  const nome = `Marina Prado ${tag}`
  const email = `marina.${tag}@cliente.test`
  await enter(context, c.admin)
  await abrir(page, 'crm-contacts', 'Contatos')
  const lista = page.getByRole('region', { name: 'Lista de contatos' })
  await expect(lista.getByText('Nenhum contato ainda', { exact: true })).toBeVisible({ timeout: 15000 })
  // a dona vê as ações de planilha (controle do teste do atendente)
  await expect(page.getByRole('button', { name: 'Importar planilha', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exportar', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Novo contato', exact: true }).first().click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: 'Novo contato' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nome', { exact: true }).fill(nome)
  await dialog.getByLabel('Telefone', { exact: true }).fill(fone.local)
  await dialog.getByLabel('E-mail', { exact: true }).fill(email)
  await dialog.getByLabel('Empresa', { exact: true }).selectOption({ label: empresa.name })
  await expect(dialog.getByLabel('Responsável', { exact: true })).toHaveValue(c.memberId)
  await dialog.getByRole('button', { name: 'Criar contato', exact: true }).click({ timeout: 10000 })

  await expect(aviso(page, 'Contato criado.')).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden()
  const tabela = page.getByRole('region', { name: 'Contatos', exact: true })
  const linha = tabela.getByRole('row').filter({ has: page.getByRole('button', { name: nome, exact: true }) })
  await expect(linha).toHaveCount(1, { timeout: 15000 })
  await expect(linha).toContainText(`•••• ${fone.last4}`)
  await expect(linha).toContainText(email)
  await expect(linha).toContainText(empresa.name)
  await expect(linha).toContainText(`${await meuNome(c.admin)} (você)`)
  await expect(lista.getByText('1 contato', { exact: true })).toBeVisible()
  // negativo: o número completo não aparece na tela
  const texto = await page.locator('main').innerText()
  expect(texto).not.toContain(fone.n)
  expect(texto).not.toContain(fone.local)

  const { items, total } = await people(c.admin, { q: nome })
  expect(total).toBe(1)
  expect(items[0]).toMatchObject({ name: nome, email, phoneLast4: fone.last4, hasPhone: true, companyId: empresa.id, ownerMemberId: c.memberId, status: 'active' })
  const det = await c.admin.get(`/api/crm/contacts/${items[0].id}`)
  expect(det.status()).toBe(200)
  const corpo = await det.text()
  expect(corpo, 'a API também só devolve os 4 últimos dígitos').not.toContain(fone.n)
  expect(JSON.parse(corpo).person.company.name).toBe(empresa.name)

  // negativo: "Cancelar" com o formulário preenchido não grava nada
  await semAvisos(page)
  await page.getByRole('button', { name: 'Novo contato', exact: true }).first().click({ timeout: 10000 })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nome', { exact: true }).fill(`Rascunho ${tag}`)
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click({ timeout: 10000 })
  await expect(dialog).toBeHidden()
  expect((await people(c.admin)).total).toBe(1)
  await c.admin.dispose()
})

test('CRM-01 · T03.01 · cadastro inválido na tela (nome vazio ou só espaços, telefone e e-mail inválidos) mostra o erro no campo e não grava', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const tag = letras()
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/crm/contacts') posts.push(r.url())
  })
  await enter(context, c.admin)
  await abrir(page, 'crm-contacts', 'Contatos')
  await page.getByRole('button', { name: 'Novo contato', exact: true }).first().click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: 'Novo contato' })
  await expect(dialog).toBeVisible()
  const nome = dialog.getByLabel('Nome', { exact: true })
  const telefone = dialog.getByLabel('Telefone', { exact: true })
  const email = dialog.getByLabel('E-mail', { exact: true })
  const criar = dialog.getByRole('button', { name: 'Criar contato', exact: true })
  const erroNome = dialog.getByText('Informe o nome.', { exact: true })

  // o erro só aparece depois da primeira tentativa
  await expect(erroNome).toHaveCount(0)
  await criar.click({ timeout: 10000 })
  await expect(erroNome).toBeVisible()
  await expect(nome).toHaveAttribute('aria-invalid', 'true')
  await nome.fill('   ')
  await criar.click({ timeout: 10000 })
  await expect(erroNome).toBeVisible()

  await nome.fill(`Rafael Antunes ${tag}`)
  await telefone.fill('abc')
  await email.fill('rafael@')
  await criar.click({ timeout: 10000 })
  await expect(dialog.getByText('Telefone inválido.', { exact: true })).toBeVisible()
  await expect(dialog.getByText('E-mail inválido.', { exact: true })).toBeVisible()
  await expect(telefone).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(erroNome).toHaveCount(0)
  await expect(nome).not.toHaveAttribute('aria-invalid', 'true')
  expect(posts, 'com erro no campo, nada vai ao servidor').toHaveLength(0)

  // "123" passa no navegador, mas o servidor exige DDD e número
  await telefone.fill('123')
  await email.fill(`rafael.${tag}@cliente.test`)
  await criar.click({ timeout: 10000 })
  await expect.poll(() => posts.length).toBe(1)
  await expect(dialog.getByRole('alert')).toHaveText('Telefone inválido (use DDD e número).', { timeout: 15000 })
  await expect(dialog.getByText('Telefone inválido.', { exact: true })).toHaveCount(0)
  await expect(dialog).toBeVisible()

  await semAvisos(page)
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click({ timeout: 10000 })
  await expect(dialog).toBeHidden()
  expect((await people(c.admin)).total).toBe(0)
  await expect(page.getByRole('region', { name: 'Lista de contatos' }).getByText('Nenhum contato ainda', { exact: true })).toBeVisible()

  // o diálogo reabre limpo; só o nome basta para gravar
  await page.getByRole('button', { name: 'Novo contato', exact: true }).first().click({ timeout: 10000 })
  await expect(dialog).toBeVisible()
  await expect(nome).toHaveValue('')
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await nome.fill(`Rafael Antunes ${tag}`)
  await criar.click({ timeout: 10000 })
  await expect(aviso(page, 'Contato criado.')).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden()
  const { items, total } = await people(c.admin)
  expect(total).toBe(1)
  expect(items[0]).toMatchObject({ name: `Rafael Antunes ${tag}`, email: null, phoneLast4: null, hasPhone: false })
  await c.admin.dispose()
})

test('CRM-01 · telefone ou e-mail repetido mostra o aviso de cadastro repetido e abre o contato existente, sem gravar outro', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const tag = letras()
  const fone = celular()
  const emailExistente = `existente.${tag}@cliente.test`
  const existente = await newPerson(c.admin, { name: `Helena Duarte ${tag}`, phone: `11 ${fone.n}`, email: emailExistente })
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/crm/contacts') posts.push(r.url())
  })
  await enter(context, c.admin)
  await abrir(page, 'crm-contacts', 'Contatos')
  const tabela = page.getByRole('region', { name: 'Contatos', exact: true })
  await expect(tabela.getByRole('button', { name: existente.name, exact: true })).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: 'Novo contato', exact: true }).first().click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: 'Novo contato' })
  await expect(dialog).toBeVisible()
  const telefone = dialog.getByLabel('Telefone', { exact: true })
  const criar = dialog.getByRole('button', { name: 'Criar contato', exact: true })
  const alerta = dialog.getByRole('alert')
  await dialog.getByLabel('Nome', { exact: true }).fill(`Helena D. ${tag}`)
  // o mesmo número em outro formato (+55, parênteses e hífen)
  await telefone.fill(fone.intl)
  await criar.click({ timeout: 10000 })
  await expect(alerta.getByText('Já existe uma pessoa com este telefone na empresa.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(alerta.getByRole('button', { name: 'Abrir contato existente', exact: true })).toBeVisible()

  // o e-mail com outra caixa também conta como repetido
  await telefone.fill('')
  await dialog.getByLabel('E-mail', { exact: true }).fill(emailExistente.toUpperCase())
  await semAvisos(page)
  await criar.click({ timeout: 10000 })
  await expect(alerta.getByText('Já existe uma pessoa com este e-mail na empresa.', { exact: true })).toBeVisible({ timeout: 15000 })
  expect(posts).toHaveLength(2)
  const depois = await people(c.admin)
  expect(depois.total, 'nenhum cadastro novo').toBe(1)
  expect(depois.items[0]).toMatchObject({ id: existente.id, email: emailExistente, phoneLast4: fone.last4, status: 'active' })

  await semAvisos(page)
  await alerta.getByRole('button', { name: 'Abrir contato existente', exact: true }).click({ timeout: 10000 })
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: existente.name, exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.locator('main')).toContainText(`•••• ${fone.last4}`)
  await expect(page.getByRole('button', { name: 'Mesclar com outro contato', exact: true })).toBeVisible()
  await c.admin.dispose()
})

test('CRM-01 · T03.02 · a busca filtra a lista por nome sem acento, e-mail e 4 últimos dígitos; filtro de empresa e "Limpar filtros"', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const tag = letras()
  const empresa = await newCompany(c.admin, { name: `Livraria Aurora ${tag}` })
  const fb = celular()
  let fc = celular()
  while (fc.last4 === fb.last4) fc = celular()
  const bruna = await newPerson(c.admin, { name: `Bruna Albuquerque ${tag}`, email: `bruna.${tag}@cliente.test`, phone: fb.local, companyId: empresa.id })
  const caio = await newPerson(c.admin, { name: `Caio Mendonça Albuquerque ${tag}`, email: `caio.${tag}@cliente.test`, phone: fc.local })
  const ambos = [bruna.name, caio.name].sort()
  const buscas: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (r.method() === 'GET' && u.pathname === '/api/crm/contacts') buscas.push(u.searchParams.get('q') ?? '')
  })
  await enter(context, c.admin)
  await abrir(page, 'crm-contacts', 'Contatos')
  const lista = page.getByRole('region', { name: 'Lista de contatos' })
  const filtros = page.getByRole('search', { name: 'Filtrar contatos' })
  const busca = filtros.getByRole('searchbox', { name: 'Buscar', exact: true })
  const nomes = nomesNa(page.getByRole('region', { name: 'Contatos', exact: true }))
  await expect.poll(nomes, { timeout: 15000 }).toEqual(ambos)
  await expect(lista.getByText('2 contatos', { exact: true })).toBeVisible()

  const primeira = listaCom(page, '/api/crm/contacts', { q: 'bruna' })
  await busca.pressSequentially('bruna', { delay: 40 })
  await primeira
  await expect.poll(nomes).toEqual([bruna.name])
  await expect(lista.getByText('1 contato', { exact: true })).toBeVisible()
  // a espera de 300 ms junta as teclas: não sai uma busca por letra
  expect(buscas.filter((q) => ['b', 'br', 'bru', 'brun'].includes(q)).length).toBeLessThan(4)

  const casos: [string, string[]][] = [
    ['mendonca', [caio.name]],
    [fc.last4, [caio.name]],
    ['ALBUQUERQUE', ambos],
    [`caio.${tag}@cliente.test`, [caio.name]],
  ]
  for (const [termo, esperado] of casos) {
    const resposta = listaCom(page, '/api/crm/contacts', { q: termo })
    await busca.fill(termo)
    await resposta
    await expect.poll(nomes, { message: termo }).toEqual(esperado)
    const api = await people(c.admin, { q: termo })
    expect(api.items.map((p) => p.name).sort(), `API · ${termo}`).toEqual(esperado)
  }

  // filtro de empresa, igual ao da API
  const porEmpresa = listaCom(page, '/api/crm/contacts', { q: '', companyId: empresa.id })
  await busca.fill('')
  await filtros.getByLabel('Empresa', { exact: true }).selectOption({ label: empresa.name })
  await porEmpresa
  await expect.poll(nomes).toEqual([bruna.name])
  expect((await people(c.admin, { companyId: empresa.id })).items.map((p) => p.id)).toEqual([bruna.id])

  // negativo: termo que não existe mostra o vazio de busca; "Limpar filtros" devolve a lista
  await filtros.getByLabel('Empresa', { exact: true }).selectOption({ label: 'Todas as empresas' })
  await busca.fill(`zzz${tag}`)
  await expect(lista.getByText('Nenhum contato encontrado', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(lista.getByText('Confira a busca ou limpe os filtros para ver todos os contatos.', { exact: true })).toBeVisible()
  expect((await people(c.admin, { q: `zzz${tag}` })).total).toBe(0)
  await lista.getByRole('button', { name: 'Limpar filtros', exact: true }).click({ timeout: 10000 })
  await expect(busca).toHaveValue('')
  await expect.poll(nomes, { timeout: 15000 }).toEqual(ambos)
  await expect(lista.getByText('2 contatos', { exact: true })).toBeVisible()
  expect((await people(c.admin)).total).toBe(2)
  await c.admin.dispose()
})

test('CRM-01 · T03.01 · nova empresa pela tela: nome, CNPJ e site inválidos barrados no campo; CNPJ repetido avisa e busca a empresa existente', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const tag = letras()
  const doc = cnpj()
  const nomeEmpresa = `Aurora Distribuidora ${tag}`
  const dominio = `www.aurora-${tag}.example`
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/crm/companies') posts.push(r.url())
  })
  await enter(context, c.admin)
  await abrir(page, 'crm-companies', 'Empresas')
  const lista = page.getByRole('region', { name: 'Lista de empresas' })
  await expect(lista.getByText('Nenhuma empresa ainda', { exact: true })).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: 'Nova empresa', exact: true }).click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: 'Nova empresa' })
  await expect(dialog).toBeVisible()
  const nome = dialog.getByLabel('Nome', { exact: true })
  const campoCnpj = dialog.getByLabel('CNPJ', { exact: true })
  const site = dialog.getByLabel('Site', { exact: true })
  const criar = dialog.getByRole('button', { name: 'Criar empresa', exact: true })

  // negativos: nada vai ao servidor
  await criar.click({ timeout: 10000 })
  await expect(dialog.getByText('Informe o nome.', { exact: true })).toBeVisible()
  await expect(nome).toHaveAttribute('aria-invalid', 'true')
  await nome.fill(nomeEmpresa)
  await campoCnpj.fill('12345')
  await site.fill('exemplo')
  await criar.click({ timeout: 10000 })
  await expect(dialog.getByText('CNPJ inválido: são 14 números.', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Site inválido. Use só o endereço, como exemplo.com.br.', { exact: true })).toBeVisible()
  await expect(campoCnpj).toHaveAttribute('aria-invalid', 'true')
  await expect(site).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog.getByText('Informe o nome.', { exact: true })).toHaveCount(0)
  expect(posts).toHaveLength(0)
  expect((await companies(c.admin)).total).toBe(0)

  // positivo: CNPJ com pontos e barra, site com protocolo e caminho (a tela guarda só o domínio)
  await campoCnpj.fill(doc.formatado)
  await site.fill(`https://${dominio}/contato`)
  await dialog.getByLabel('Segmento', { exact: true }).fill('Varejo')
  await expect(dialog.getByText('Você fica como responsável por esta empresa.', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('Responsável', { exact: true })).toHaveValue(c.memberId)
  await criar.click({ timeout: 10000 })
  await expect(aviso(page, 'Empresa criada.')).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden()
  const tabela = page.getByRole('region', { name: 'Empresas', exact: true })
  const linha = tabela.getByRole('row').filter({ has: page.getByRole('button', { name: nomeEmpresa, exact: true }) })
  await expect(linha).toHaveCount(1, { timeout: 15000 })
  await expect(linha).toContainText(doc.formatado)
  await expect(linha).toContainText(dominio)
  await expect(linha).toContainText('Varejo')
  await expect(linha).toContainText(`${await meuNome(c.admin)} (você)`)
  await expect(lista.getByText('1 empresa', { exact: true })).toBeVisible()
  const gravada = await companies(c.admin)
  expect(gravada.total).toBe(1)
  expect(gravada.items[0]).toMatchObject({ name: nomeEmpresa, taxId: doc.digits, domain: dominio, segment: 'Varejo', ownerMemberId: c.memberId, status: 'active' })

  // CNPJ repetido (agora sem pontuação): aviso no diálogo e atalho para a empresa que já existe
  await semAvisos(page)
  await page.getByRole('button', { name: 'Nova empresa', exact: true }).click({ timeout: 10000 })
  await expect(dialog).toBeVisible()
  await nome.fill(`Aurora Filial ${tag}`)
  await campoCnpj.fill(doc.digits)
  await criar.click({ timeout: 10000 })
  const alerta = dialog.getByRole('alert')
  await expect(alerta.getByText('Já existe uma empresa com este CNPJ.', { exact: true })).toBeVisible({ timeout: 15000 })
  expect(posts).toHaveLength(2)
  expect((await companies(c.admin)).total, 'a filial não foi gravada').toBe(1)

  await semAvisos(page)
  const porCnpj = listaCom(page, '/api/crm/companies', { q: doc.digits })
  await alerta.getByRole('button', { name: 'Buscar este CNPJ na lista', exact: true }).click({ timeout: 10000 })
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('search', { name: 'Buscar empresas' }).getByRole('searchbox', { name: 'Buscar', exact: true })).toHaveValue(doc.digits)
  await porCnpj
  await expect.poll(nomesNa(tabela)).toEqual([nomeEmpresa])
  await expect(lista.getByText('1 empresa', { exact: true })).toBeVisible()
  expect((await companies(c.admin, { q: doc.digits })).items.map((e) => e.name)).toEqual([nomeEmpresa])
  await c.admin.dispose()
})

test('CRM-01 · T12.04 · atendente cadastra contato como responsável, mas não vê Importar planilha, Exportar nem Mesclar; a API de importação responde 403', async ({ page, context }) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  // exportação ligada: o botão some por permissão, não pela chave da empresa
  expect((await c.admin.patch('/api/crm/settings', { data: { exports: true } })).status()).toBe(200)
  const att = await atendente(c.admin)
  const tag = letras()
  const a = await newPerson(c.admin, { name: `Otávio Brandão ${tag}`, email: `otavio.${tag}@cliente.test`, ownerMemberId: att.id })
  const b = await newPerson(c.admin, { name: `Otávio B. Brandão ${tag}`, ownerMemberId: att.id })
  await newPerson(c.admin, { name: `Sem responsável ${tag}` })
  await enter(context, att.api)
  await abrir(page, 'crm-contacts', 'Contatos')
  const lista = page.getByRole('region', { name: 'Lista de contatos' })
  const tabela = page.getByRole('region', { name: 'Contatos', exact: true })
  await expect.poll(nomesNa(tabela), { timeout: 15000 }).toEqual([a.name, b.name].sort())
  await expect(lista.getByText('2 contatos', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Novo contato', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Importar planilha', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Exportar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('search', { name: 'Filtrar contatos' }).getByLabel('Responsável', { exact: true })).toHaveCount(0)

  // cadastra: sem escolher responsável, fica com ele
  await page.getByRole('button', { name: 'Novo contato', exact: true }).click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: 'Novo contato' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Responsável', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('Você fica como responsável por este contato.', { exact: true })).toBeVisible()
  const novo = `Contato do atendente ${tag}`
  await dialog.getByLabel('Nome', { exact: true }).fill(novo)
  await dialog.getByLabel('Telefone', { exact: true }).fill(celular().local)
  await dialog.getByRole('button', { name: 'Criar contato', exact: true }).click({ timeout: 10000 })
  await expect(aviso(page, 'Contato criado.')).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden()
  const linha = tabela.getByRole('row').filter({ has: page.getByRole('button', { name: novo, exact: true }) })
  await expect(linha).toContainText(`${att.nome} (você)`, { timeout: 15000 })
  const criado = await people(c.admin, { q: novo })
  expect(criado.total).toBe(1)
  expect(criado.items[0].ownerMemberId).toBe(att.id)

  // no detalhe: edita e arquiva, mas não mescla
  await semAvisos(page)
  await tabela.getByRole('button', { name: a.name, exact: true }).click({ timeout: 10000 })
  await expect(page.getByRole('heading', { level: 1, name: a.name, exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Editar contato', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Arquivar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mesclar com outro contato', exact: true })).toHaveCount(0)

  // a API recusa o que a tela esconde (a permissão vem antes da validação e do limite por minuto)
  const rows = [{ name: `Planilha ${tag}` }]
  for (const dryRun of [true, false]) {
    const r = await att.api.post('/api/crm/imports', { data: { dryRun, rows } })
    expect(r.status(), `importar · dryRun ${dryRun}`).toBe(403)
    expect((await r.json()).error).toBe('Sem permissão para esta ação')
  }
  expect((await att.api.post('/api/crm/contacts/merge', { data: { keepId: a.id, mergeId: b.id, keepVersion: a.version, mergeVersion: b.version } })).status()).toBe(403)
  expect((await att.api.post('/api/crm/exports', { data: { entity: 'people' } })).status()).toBe(403)

  const todos = await people(c.admin)
  expect(todos.total, 'os 3 da dona + o do atendente; a planilha não entrou').toBe(4)
  expect(todos.items.filter((p) => p.id === a.id || p.id === b.id).map((p) => p.status)).toEqual(['active', 'active'])
  expect((await people(c.admin, { q: `Planilha ${tag}` })).total).toBe(0)
  // controle: a mesma prévia pela dona responde 200 e não grava
  const prev = await c.admin.post('/api/crm/imports', { data: { dryRun: true, rows } })
  expect(prev.status(), await prev.text()).toBe(200)
  expect(await prev.json()).toMatchObject({ total: 1, valid: 1, created: 0 })
  expect((await people(c.admin)).total).toBe(4)
  await att.api.dispose()
  await c.admin.dispose()
})
